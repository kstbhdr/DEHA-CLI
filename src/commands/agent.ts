import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message, OAIMessage, ToolCall, sendWithTools, sendWithToolsOpenAICompat, sanitizeHistoryForOpenAI } from '../services/ai-service';
import { DEHA_TOOLS, executeTool, executeToolAsync, printToolCall } from '../tools';
import { mcpManager } from '../mcp/manager';
import { getWorkDir, isHomeDirectory, getActiveTask, setActiveTask, updateActiveTask, completeActiveTask, cancelActiveTask, getPreviousTask, ActiveTaskContext } from '../services/session-memory';
import { logger } from '../services/logger';
import { safeSlice, safeJsonParse } from '../services/text-utils';
import { getMaxContextTokens } from '../services/token-counter';
import { TurnContextAssembler, createTurnAssembler, isSectionedContextEnabled, SECTIONED_CONTEXT_PROMPT, BuildStats, addTaskFollowUp } from '../services/sectioned-context';
import { resolveTotalContextTokens } from '../services/sectioned-context';
import { computeOutputReserve } from '../services/sectioned-context/budget';
import { backgroundJobsEnabled, BACKGROUND_JOB_NAMES, BACKGROUND_JOBS_PROMPT, blockingJobsForActiveTask, listBackgroundJobs } from '../tools/background-jobs';

/** WorkDir bilgisini config'e system prompt olarak enjekte et */
export function injectWorkDir(config: DehaConfig, customSystemPrompt?: string): DehaConfig {
  const workDir = getWorkDir();
  const basePrompt = customSystemPrompt ?? config.systemPrompt;

  // The home directory isn't "a project" — it's the whole user profile
  // (IDE caches, dotfiles, unrelated repos side by side). Telling the model
  // to "stay focused on this project" when workDir === home directory makes
  // it treat the entire profile as one project and volunteer unsolicited
  // commentary about random sibling folders even for a plain greeting.
  const isHome = workDir && isHomeDirectory(workDir);

  const workDirNote = !workDir
    ? ''
    : isHome
      ? `\n\n[PROJECT CONTEXT]\n- CURRENT DIRECTORY: ${workDir} (this is the user's HOME directory, not a specific project)\n- No specific project is selected yet. Do NOT list, scan, or comment on unrelated folders here unless the user explicitly asks about one.\n- If the user's request implies a specific project, ask which one or navigate there first (e.g. via a path they mention). Do not guess.`
      : `\n\n[PROJECT CONTEXT]\n- ACTIVE WORKING DIRECTORY: ${workDir}\n- CRITICAL RULE: You are currently working in this project. All file operations (read, write, list, search) and shell commands MUST be performed within this directory by default.\n- If the user explicitly asks for another absolute path or says "root dizini", "/root", "VPS root", or similar, use that requested path exactly. In that case, "/root" means the server root user's home directory, NOT the project root.\n- Do NOT look at parent or sibling directories unless the user explicitly asks for a different project/path.\n- FOCUS: Stay within the project context unless the user explicitly names another path. If you need to list files without a specific path, list ${workDir} first.`;

  return {
    ...config,
    systemPrompt: basePrompt + workDirNote,
  };
}

export interface AgentResult {
  response: string;
  messages: Message[]; // The complete turn history
}

/** Turn sırasında üretilen her yeni mesajı ANINDA kalıcılaştırmak için — bkz. runAgent'ın onMessage parametresi. */
export type OnMessage = (msg: Message) => void | Promise<void>;

export async function runAgent(
  userMessage: string,
  config: DehaConfig,
  history: Message[] = [],
  abortSignal?: AbortSignal,
  customSystemPrompt?: string,
  onMessage?: OnMessage,
  options: { taskAlreadyResolved?: boolean; sectioned?: boolean } = {},
): Promise<AgentResult> {
  const mcpTools = mcpManager.getAnthropicTools();
  const allTools = [...DEHA_TOOLS.filter(t => backgroundJobsEnabled() || !BACKGROUND_JOB_NAMES.has(t.name)), ...mcpTools];

  if (mcpTools.length > 0) {
    logger.write(chalk.dim(`  [${mcpTools.length} MCP aracı aktif]\n`));
  }

  // Aktif görevi açık semantiklerle yönet.
  // Çağıran taraf (interactive) bunu context'i kurmadan ÖNCE yapmışsa tekrar etme —
  // aksi halde history'deki <active_task> bloğu bir önceki (bayat) görevi gösterir.
  if (!options.taskAlreadyResolved) {
    resolveTaskForUserMessage(userMessage);
  }

  // WorkDir'i system prompt'a enjekte et
  let enrichedConfig = injectWorkDir(config, customSystemPrompt);
  if (backgroundJobsEnabled()) {
    enrichedConfig.systemPrompt += BACKGROUND_JOBS_PROMPT;
    const activeId = getActiveTask()?.id;
    const existing = listBackgroundJobs().filter(j => j.taskId === activeId).slice(0, 8)
      .map(j => ({ job_id: j.id, status: j.status, command: j.command, exit_code: j.exitCode }));
    if (existing.length) enrichedConfig.systemPrompt += '\n[TRACKED JOBS FOR THIS TASK]\n' + JSON.stringify(existing);
  }

  // Bölümlü context: görev / brain / değişiklikler / tool günlüğü
  let assembler: TurnContextAssembler | undefined;
  if (options.sectioned && isSectionedContextEnabled()) {
    enrichedConfig = { ...enrichedConfig, systemPrompt: enrichedConfig.systemPrompt + SECTIONED_CONTEXT_PROMPT };
    const requested = enrichedConfig.roleOverride?.maxTokens ?? enrichedConfig.toolMaxTokens ?? enrichedConfig.maxTokens;
    const outputLimit = Math.min(requested, computeOutputReserve(resolveTotalContextTokens(enrichedConfig), requested));
    enrichedConfig.toolMaxTokens = outputLimit;
    if (enrichedConfig.roleOverride) enrichedConfig.roleOverride = { ...enrichedConfig.roleOverride, maxTokens: outputLimit };
    assembler = createTurnAssembler(enrichedConfig, allTools as unknown[], config.provider === 'claude' ? 'claude' : 'openai');
  }

  // Claude → native tool calling
  if (config.provider === 'claude') {
    return runAgentClaude(userMessage, enrichedConfig, history, allTools, abortSignal, onMessage, assembler);
  }

  // OpenAI-uyumlu providerlar (DeepSeek, OpenAI, OpenRouter, xAI, custom)
  return runAgentOpenAI(userMessage, enrichedConfig, history, allTools, abortSignal, onMessage, assembler);
}

function logAssemblerStats(stats: BuildStats): void {
  if (!stats.rolledOver) return;
  const u = stats.used;
  logger.write(chalk.dim(
    `  ✂ Bağlam: eski round'lar özetlendi — ~${Math.round(stats.totalTokens / 1000)}k/${Math.round(stats.budgets.total / 1000)}k ` +
    `(görev ${u.task} · plan ${u.plan} · değişiklik ${u.changes} · tool özet ${u.toolLog} · son round'lar ${u.native})\n`,
  ));
}

const MAX_TOOL_ROUNDS = 200;
const MAX_AUTO_CONTINUE_ROUNDS = 6;
const MAX_POST_TOOL_COMPLETION_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 32_000;
const MAX_INLINE_RETRY_ROUNDS = 2;
const MAX_CONTEXT_RECOVERY_ATTEMPTS = 3;
const TURN_KEEP_RECENT_MESSAGES = 8;
const TURN_SHRINK_MIN_CHARS = 600;
const TURN_ANCHOR_MARKER = '[DEHA BAĞLAM NOTU]';

type TurnMessage = { role?: unknown; content?: unknown; tool_calls?: unknown; [k: string]: unknown };

function contentLength(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((n, b: any) => n + (typeof b?.text === 'string' ? b.text.length : 0), 0);
  }
  return 0;
}

function estimateTurnTokens(messages: TurnMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += contentLength(m.content) + 16;
    if (Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls as any[]) {
        chars += (tc?.function?.name?.length ?? 0) + (typeof tc?.function?.arguments === 'string' ? tc.function.arguments.length : 0) + 32;
      }
    }
  }
  return Math.ceil(chars / 3.5);
}

/**
 * Tek bir agent turu içinde gönderilecek toplam bağlamın bütçesini hesaplar.
 * Çıktı rezervi + tool şemaları düşülür, tahmin hatası için %10 pay bırakılır.
 */
export function computeTurnBudgetTokens(config: DehaConfig, tools: unknown[]): number {
  const override = readPositiveInt(process.env.DEHA_TURN_BUDGET_TOKENS, 0);
  if (override > 0) return override;
  const model = activeModelName(config);
  const maxCtx = config.maxContextTokens > 0 ? config.maxContextTokens : getMaxContextTokens(config.provider, model);
  const outputReserve = Math.min(config.toolMaxTokens || config.maxTokens || 8_192, Math.floor(maxCtx / 4));
  const toolSchemaTokens = Math.ceil(JSON.stringify(tools ?? []).length / 3.5);
  return Math.max(6_000, Math.floor((maxCtx - outputReserve - toolSchemaTokens - 2_048) * 0.9));
}

function activeModelName(config: DehaConfig): string {
  switch (config.provider) {
    case 'claude': return config.claudeModel || '';
    case 'openai': return config.openaiModel || '';
    case 'deepseek': return config.deepseekModel || '';
    case 'ollama': return config.ollamaModel || '';
    case 'openrouter': return config.openrouterModel || '';
    case 'xai': return config.xaiModel || '';
    default: return '';
  }
}

function isToolResultMessage(m: TurnMessage): boolean {
  if (m.role === 'tool') return true;
  return m.role === 'user' && typeof m.content === 'string' && m.content.includes('<tool_result');
}

/**
 * Uzun tool döngülerinde bağlamı bütçe içinde tutar (IN-PLACE).
 *
 * Eskiden tur içi mesajlar sınırsız büyüyordu; bağlam penceresi dolunca
 * provider/sunucu (Ollama, vLLM, bazı OpenRouter endpoint'leri) EN BAŞTAKİ
 * mesajları — system prompt ve kullanıcının görev isteğini — sessizce kesiyordu.
 * Model sadece tool çıktılarını görüp "mesajın boş geldi" diyerek görevi
 * yarıda bırakıyordu.
 *
 * Kurallar:
 *  - `protectedCount` öncesi (system + geçmiş + kullanıcının isteği) ASLA silinmez.
 *  - Son TURN_KEEP_RECENT_MESSAGES mesaj olduğu gibi kalır.
 *  - 1. aşama: eski tool sonuçları head+tail olarak kısaltılır (idempotent).
 *  - 2. aşama: hâlâ sığmıyorsa en eski tur-içi round'lar (assistant + tool
 *    sonuçları birlikte, eşleşme bozulmadan) çıkarılır ve görevi yeniden
 *    hatırlatan tek bir çapa notu eklenir/güncellenir.
 */
export function fitTurnToBudget(
  messages: TurnMessage[],
  protectedCount: number,
  budgetTokens: number,
  taskReminder: string,
): { shrunk: number; dropped: number } {
  let shrunk = 0;
  let dropped = 0;
  if (estimateTurnTokens(messages) <= budgetTokens) return { shrunk, dropped };

  // 1. aşama: eski tool sonuçlarını kısalt
  const recentStart = Math.max(protectedCount, messages.length - TURN_KEEP_RECENT_MESSAGES);
  for (let i = protectedCount; i < recentStart; i++) {
    const m = messages[i];
    if (!isToolResultMessage(m) || typeof m.content !== 'string') continue;
    const c = m.content;
    if (c.length <= TURN_SHRINK_MIN_CHARS) continue;
    messages[i] = {
      ...m,
      content: safeSlice(c, 0, 300) + `\n[... bağlam limiti için kırpıldı: ${c.length} karakter ...]\n` + safeSlice(c, -150),
    };
    shrunk++;
  }
  if (estimateTurnTokens(messages) <= budgetTokens) return { shrunk, dropped };

  // 2. aşama: en eski round'ları çıkar (çapa notu korunur)
  let anchorIdx = messages.findIndex((m, i) => i >= protectedCount && typeof m.content === 'string' && m.content.startsWith(TURN_ANCHOR_MARKER));
  let start = anchorIdx >= 0 ? anchorIdx + 1 : protectedCount;

  while (estimateTurnTokens(messages) > budgetTokens && messages.length - start > TURN_KEEP_RECENT_MESSAGES) {
    // Bir grup: [assistant (+tool_calls)] + ardından gelen tool/user mesajları, bir sonraki assistant'a kadar
    let end = start + 1;
    if (messages[start].role === 'assistant') {
      while (end < messages.length && messages[end].role !== 'assistant') end++;
    }
    if (messages.length - end < TURN_KEEP_RECENT_MESSAGES) break;
    messages.splice(start, end - start);
    dropped += end - start;
  }

  if (dropped > 0) {
    const prevDropped = anchorIdx >= 0 ? Number((/çıkarılan: (\d+)/.exec(String(messages[anchorIdx].content)) || [])[1] || 0) : 0;
    const note: TurnMessage = {
      role: 'user',
      content: `${TURN_ANCHOR_MARKER} Bağlam limiti nedeniyle bu turdaki eski araç adımları çıkarıldı (toplam çıkarılan: ${prevDropped + dropped} mesaj). GÖREV DEVAM EDİYOR — kullanıcı mesajı boş DEĞİL.\n${taskReminder}\nKaldığın yerden devam et; zaten yaptığın adımları gereksiz tekrarlama.`,
    };
    if (anchorIdx >= 0) messages[anchorIdx] = note;
    else messages.splice(protectedCount, 0, note);
  }
  return { shrunk, dropped };
}

function buildTaskReminder(userMessage: string): string {
  const task = getActiveTask();
  const original = task?.originalUserRequest || userMessage;
  const lines = [`Orijinal kullanıcı isteği: "${safeSlice(original, 0, 2_000)}"`];
  if (task?.currentObjective && task.currentObjective !== original) lines.push(`Mevcut hedef: "${safeSlice(task.currentObjective, 0, 1_000)}"`);
  if (task?.lastMeaningfulToolResult) lines.push(`Son anlamlı araç çıktısı: ${task.lastMeaningfulToolResult}`);
  return lines.join('\n');
}

export function isExplicitCancellation(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^(iptal|iptal et|vazge[cç]|cancel|stop|abort)$/i,
    /^(g[oö]revi (iptal et|durdur|b[iı]rak))$/i,
  ];
  return patterns.some(p => p.test(lower));
}

export function isExplicitContinuation(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^(devam|devam et|s[uü]rd[uü]r|continue|go on|proceed|keep going)$/i,
    /^(kald[iı][gğ][iı]n yerden devam( et)?|kald[iı][gğ][iı]m[iı]z yerden devam( et)?)$/i,
    /^(devam et|continue|keep going)[\s,;:!—-]+(?!ama (?:yeni|başka)|but (?:a )?(?:new|different))/i,
  ];
  return patterns.some(p => p.test(lower));
}

export function isFollowUpOrInspection(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const patterns = [
    /hangi (dosya|test|komut|kod|de[gğ]i[sş]iklik)/i,
    /which (files?|tests?|command|changes?)/i,
    /ne (yapt[iı]n|oldu|de[gğ]i[sş]ti|sonu[cç]land[iı])/i,
    /what (did you do|happened|changed|passed|failed)/i,
    /son durum( ne)?/i,
    /^(current )?status\??$/i,
    /(neden|why did you) (durdun|stop|block)/i,
    /([oö]nceki|[oö]nceki testi|hatay[iı]) (d[uü]zelt|fix)/i,
    /(fix|repair) (the )?(previous|failing )?test/i,
    /(testi|testleri) (tekrar |yeniden )?[cç]al[iı][sş]t[iı]r/i,
    /run (the )?tests? again/i,
    /hata veriyor/i,
    // \b şart: aksi halde "different", "diffusion" vb. her mesaj takip sayılıp
    // eski görev hiç değişmiyordu.
    /\bdiff(i|i g[oö]ster)?\b/i,
  ];
  return patterns.some(p => p.test(lower));
}

export function resolveTaskForUserMessage(userMessage: string): ActiveTaskContext {
  const currentTask = getActiveTask();
  const trimmed = userMessage.trim();

  // 1. Açık iptal
  if (isExplicitCancellation(trimmed)) {
    if (currentTask && currentTask.taskState === 'ACTIVE') {
      cancelActiveTask();
      return currentTask;
    }
    return setActiveTask(userMessage, userMessage);
  }

  // 2. Açık devam etme
  if (isExplicitContinuation(trimmed)) {
    if (currentTask) {
      if (currentTask.taskState !== 'ACTIVE') {
        const updated = updateActiveTask({ taskState: 'ACTIVE', recoveryAttemptCount: 0 }) || currentTask;
        addTaskFollowUp(userMessage);
        return updated;
      }
      addTaskFollowUp(userMessage);
      return currentTask;
    }
    return setActiveTask(userMessage, userMessage);
  }

  // 3. Mevcut görev yoksa yeni başlat
  if (!currentTask) {
    return setActiveTask(userMessage, userMessage);
  }

  // 4. Önceki veya mevcut görev üzerine takip / soru / hata düzeltme
  if (isFollowUpOrInspection(trimmed)) {
    const updated = updateActiveTask({
      currentObjective: userMessage,
      taskState: 'ACTIVE',
      recoveryAttemptCount: 0,
    }) || currentTask;
    addTaskFollowUp(userMessage);
    return updated;
  }

  // 5. Eski görev ister ACTIVE ister COMPLETE/BLOCKED olsun, yeni bir üst-düzey talimat geldiğinde
  // DEHA eski göreve takılıp kalmamalı, yeni göreve geçmeli:
  return setActiveTask(userMessage, userMessage);
}

export interface ContextLossCheckOptions {
  userMessage?: string;
  hadToolActivity?: boolean;
}

/**
 * Modelin aktif bir görev varken bağlamı unutup karşılama veya görev bekleme
 * moduna geçip geçmediğini (context-loss) tespit eder.
 *
 * False-positive koruması:
 * - Markdown kod blokları (```) içeren yanıtlar asla karşılama sayılmaz.
 * - Kullanıcı bizzat karşılama veya çeviri istediyse kurtarma tetiklenmez.
 * - Sadece STATUS etiketleri temizlendikten sonra baskın olarak karşılama/amnezi
 *   kalıpları içeren kısa yanıtlar tespit edilir.
 */
export function isContextLossGreeting(text: string, options: ContextLossCheckOptions = {}): boolean {
  if (!text) return false;
  const rawTrimmed = text.trim();

  // 1. Kod bloğu içeriyorsa bu gerçek bir cevaptır, karşılama sayılmaz
  if (rawTrimmed.includes('```')) return false;

  // 2. Kullanıcı açıkça bir karşılama metni veya çeviri istediyse false-positive üretme
  if (options.userMessage) {
    const userLower = options.userMessage.toLowerCase();
    const isExplicitGreetingRequest =
      userLower.includes('çevir') ||
      userLower.includes('translate') ||
      userLower.includes('karşılama') ||
      userLower.includes('greeting') ||
      userLower.includes('ben deha') ||
      userLower.includes('nasıl yardımcı');
    if (isExplicitGreetingRequest) return false;
  }

  // 3. STATUS etiketlerini temizle
  const cleanText = rawTrimmed.replace(/\[STATUS:\s*(?:COMPLETE|BLOCKED|CONTINUE)\]/gi, '').trim();
  if (!cleanText) return false;

  // Uzun onboarding yanıtları da görevi unutabilir: yetenek listesi nedeniyle
  // 300 karakter sınırını aşan, yeniden görev isteyen yanıtları yakala.
  const introducesDeha = /^merhaba[!,.\s]*ben deha\b/i.test(cleanText);
  const asksForTask = /bana hangi görevde yardımcı olabilirim|lütfen yapmak istediğiniz işi|görevi başlatmak için (?:sizin )?(?:talebinizi|isteğinizi|görevinizi) bekliyorum/i.test(cleanText);
  if (introducesDeha && asksForTask && options.userMessage?.trim()) return true;

  // 3.5 "Mesajın boş geldi" tipi amnezi: kullanıcı mesajı gerçekten boş değilse bu
  // kesin bir context-loss sinyalidir. Bu yanıtlar genelde yetenek listesi içerdiği
  // için 300 karakter sınırına takılmasın diye uzunluk kontrolünden önce bakılır.
  if (options.userMessage && options.userMessage.trim().length > 0 && cleanText.length <= 1200) {
    const emptyMessagePatterns = [
      /(your )?message (came through|was|is|appears( to be)?|seems( to be)?) empty/i,
      /i don'?t see (a|any) (question|task|request|message)/i,
      /mesaj(ın|iniz)? boş (geldi|görünüyor|ulaştı)/i,
    ];
    if (emptyMessagePatterns.some(p => p.test(cleanText))) return true;
  }

  // 4. Gerçek amnezi karşılama mesajları kısa boşta bekleme metinleridir
  if (cleanText.length > 300) return false;

  // 5. Tırnak içindeki karşılama örnekleri (örn. "Merhaba! Ben DEHA...")
  if (/^["'`«].*["'`»]$/.test(cleanText) && options.userMessage && options.userMessage.includes('"')) {
    return false;
  }

  const lower = cleanText.toLowerCase();
  const patterns = [
    /henüz (bir )?görev (tanımı )?(yapılmadı|bulunmuyor)/i,
    /henüz (bir )?görev (vermediniz|belirtilmedi|atanmadı|tanımlanmadı)/i,
    /görev tanımı yapılmadı/i,
    /ne yapmamı istersiniz/i,
    /hazır bekliyorum/i,
    /yeni (bir )?görev (bekliyorum|verebilirsiniz)/i,
    /ben deha[.,! ]+(henüz|size nasıl|ne yapmamı|nasıl yardımcı)/i,
    /merhaba!? ben deha[.,! ]*(henüz|nasıl yardımcı|ne yapmak|size nasıl)?/i,
    /no task (has been )?(defined|specified|provided)/i,
    /how can i help (you )?today\??$/i,
    /what would you like me to do\??$/i,
    /waiting for (a|your) task/i,
    /ready for your command/i,
  ];

  return patterns.some(p => p.test(lower));
}

/**
 * Some models (usually local/fine-tuned ones without real function-calling
 * support) write a tool call as literal text — `[Tool Call: **x**({...})]`,
 * `<invoke name="x">`, DSML, `**x**({...})` — instead of a structured
 * tool_calls entry. `parseInlineXmlToolCalls` catches the well-formed cases,
 * but if the model's output got cut off mid-call (e.g. hit max_tokens while
 * writing a long shell command), the bracket/JSON is left unbalanced and no
 * parser can recover it. Left unchecked, that broken fragment gets shown to
 * the user as if it were the actual answer — this detects the attempt so the
 * caller can retry instead of displaying raw tool-call syntax as a response.
 */
function looksLikeUnexecutedToolCallAttempt(text: string): boolean {
  if (!text) return false;
  return /\[Tool\s*Call:/i.test(text) ||
    /<invoke\s+name=/i.test(text) ||
    /DSML[^]*?invoke/i.test(text) ||
    /\*{2}\w+\*{2}\s*\(\s*\{/.test(text);
}

// ─── Claude agent döngüsü ────────────────────────────────────────────────────

async function runAgentClaude(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
  onMessage?: OnMessage,
  assembler?: TurnContextAssembler,
): Promise<AgentResult> {
  const messages: Message[] = [...history];
  const startIdx = history.length;
  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;
  let consecutiveToolFailures = 0;

  let lastStopReason: string | null = null;
  let inlineRetryRounds = 0;
  let contextRecoveryAttempts = 0;
  let jobCompletionRetries = 0;
  const turnBudget = computeTurnBudgetTokens(config, allTools as unknown[]);

  // A process crash/kill mid-turn previously lost the whole turn (nothing was
  // persisted until the full multi-round loop returned). Persisting each
  // message as it's produced means a resumed session can at least see what
  // was attempted instead of the model having zero memory of pending work.
  const pushMessage = async (msg: Message): Promise<void> => {
    messages.push(msg);
    await onMessage?.(msg);
  };

  while (round < maxRounds) {
    if (abortSignal?.aborted) {
      updateActiveTask({ taskState: 'INTERRUPTED' });
      const abortContent = '[İşlem kullanıcı tarafından durduruldu]';
      await pushMessage({ role: 'assistant', content: abortContent });
      finalText = abortContent;
      break;
    }

    round++;
    let roundText = '';

    let requestMessages: Message[] = messages;
    if (assembler) {
      const built = assembler.build({ systemPrompt: config.systemPrompt, history, turn: messages.slice(startIdx) as any, userMessage });
      requestMessages = built.messages as unknown as Message[];
      logAssemblerStats(built.stats);
    } else {
      const fit = fitTurnToBudget(messages as TurnMessage[], startIdx, turnBudget, buildTaskReminder(userMessage));
      if (fit.dropped > 0) logger.write(chalk.dim(`  ✂ Bağlam limiti: ${fit.dropped} eski araç mesajı çıkarıldı, görev çapası korundu\n`));
    }

    const { text, toolCalls, stopReason } = await sendWithTools(requestMessages, config, allTools, (chunk) => {
      roundText += chunk;
    }, abortSignal, forceToolUse ? 'required' : 'auto');
    lastStopReason = stopReason;
    const effectiveToolCalls = toolCalls.length > 0
      ? toolCalls
      : parseInlineXmlToolCalls(text, allTools);

    if (effectiveToolCalls.length === 0) {
      if (!text.trim() && getActiveTask()?.taskState === 'ACTIVE' && round >= maxRounds) {
        updateActiveTask({ taskState: 'INTERRUPTED' });
      }
      if (looksLikeUnexecutedToolCallAttempt(text) && inlineRetryRounds < MAX_INLINE_RETRY_ROUNDS) {
        inlineRetryRounds++;
        forceToolUse = true;
        await pushMessage({ role: 'assistant', content: text });
        await pushMessage({ role: 'user', content: MALFORMED_TOOL_CALL_PROMPT });
        continue;
      }

      // Context-loss kontrolü: Aktif görev varken model "Henüz görev vermediniz" dediğinde kurtar
      const activeTask = getActiveTask();
      const isContextLoss = activeTask && activeTask.taskState === 'ACTIVE' && isContextLossGreeting(text, { userMessage, hadToolActivity });
      if (isContextLoss) {
        if (contextRecoveryAttempts < MAX_CONTEXT_RECOVERY_ATTEMPTS) {
          contextRecoveryAttempts++;
          updateActiveTask({ recoveryAttemptCount: contextRecoveryAttempts });
          forceToolUse = true;
          await pushMessage({ role: 'assistant', content: text });
          const recoveryPrompt = `[SİSTEM UYARISI: Görev zaten aktif ve devam ediyor. Karşılama veya görev bekleme mesajı üretme.\nOrijinal Kullanıcı İsteği: "${activeTask.originalUserRequest}"\n${activeTask.lastMeaningfulToolResult ? `Son Araç Çıktısı: ${activeTask.lastMeaningfulToolResult}\n` : ''}Lütfen göreve odaklan ve gerekli adımları/araçları çalıştırarak devam et.]`;
          await pushMessage({ role: 'user', content: recoveryPrompt });
          continue;
        } else {
          logger.write('\n' + chalk.bold.cyan('DEHA:'));
          finalText = describeContextRecoveryFailure(activeTask.originalUserRequest);
          logger.raw(chalk.red(`\n${finalText}\n`));
          updateActiveTask({ taskState: 'INTERRUPTED' });
          await pushMessage({ role: 'assistant', content: finalText });
          break;
        }
      }

      const pendingJobs = parseStatusTag(text) !== 'BLOCKED' ? blockingJobsForActiveTask() : [];
      if (pendingJobs.length) {
        if (++jobCompletionRetries <= 3 && round < maxRounds) {
          await pushMessage({ role: 'assistant', content: text || '[Awaiting jobs]' });
          await pushMessage({ role: 'user', content: pendingJobReminder(pendingJobs.map(j => j.id)) });
          forceToolUse = true;
          continue;
        }
        finalText = 'Gerekli arka plan işleri henüz tamamlanmadı. İşler korunuyor; list_jobs / wait_job ile devam edilebilir.';
        updateActiveTask({ taskState: 'INTERRUPTED' });
        await pushMessage({ role: 'assistant', content: finalText });
        logger.write(finalText);
        break;
      }
      finalText = text;
      const status = parseStatusTag(text);
      if (status === 'COMPLETE') {
        completeActiveTask();
      } else if (status === 'BLOCKED') {
        updateActiveTask({ taskState: 'BLOCKED' });
      }

      const shouldContinue = hadToolActivity
        ? await shouldContinueAfterToolPhase(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            postToolCompletionRounds,
          )
        : await shouldContinueAfterNoToolResponse(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            autoContinueRounds,
            aggressiveAutoContinue,
          );

      if (shouldContinue) {
        autoContinueRounds++;
        forceToolUse = true;
        await pushMessage({ role: 'assistant', content: text });
        await pushMessage({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }

      // Final asistan mesajını mutlaka kalıcılaştır
      const finalContent = text?.trim()
        ? text
        : describeSilentFinalResponse(lastStopReason, hadToolActivity);
      finalText = finalContent;
      if (!text.trim() && getActiveTask()?.taskState === 'ACTIVE') updateActiveTask({ taskState: 'INTERRUPTED' });
      await pushMessage({ role: 'assistant', content: finalContent });

      if (looksLikeUnexecutedToolCallAttempt(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.red(describeUnexecutedToolCall(lastStopReason)));
        logger.raw('\n');
      } else if (text && !isSilentInterimOutput(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(roundText);
        logger.raw('\n');
      } else if (hadToolActivity) {
        // Tool aktivitesi vardı ama son yanıt silent/boş çıktı — özet iste
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.dim(finalContent + '\n'));
      } else {
        // Ne görünür metin ne tool aktivitesi var — kullanıcıya asla sessiz
        // dönmeyelim, aksi halde "chat cevap vermiyor" gibi görünür.
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.red(describeEmptyResponse(lastStopReason)));
        logger.raw('\n');
      }
      break;
    }

    const toolResultBlocks: string[] = [];
    const pendingRecords: Array<{ name: string; input: Record<string, unknown>; result: string }> = [];
    hadToolActivity = true;
    postToolCompletionRounds = 0;
    autoContinueRounds = 0;
    forceToolUse = false;

    if (text && !isSilentInterimOutput(text)) {
      logger.write('\n' + chalk.bold.cyan('DEHA:'));
      logger.raw(roundText);
      logger.raw('\n');
    }

    for (const tc of effectiveToolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config, abortSignal);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const previewText = compactedResult.trim();
      const preview = previewText.length === 0
        ? chalk.red('(boş sonuç — timeout veya bağlantı hatası olabilir)')
        : chalk.gray(previewText.length > 200 ? previewText.slice(0, 200) + '…' : previewText);
      logger.write(chalk.dim('    → ') + preview);
      toolResultBlocks.push(`<tool_result name="${tc.name}" id="${tc.id}">\n${compactedResult}\n</tool_result>`);
      pendingRecords.push({ name: tc.name, input: tc.input, result: compactedResult });
      finalText = text;

      if (previewText.length > 0 && !isSilentInterimOutput(previewText)) {
        updateActiveTask({ lastMeaningfulToolResult: `[${tc.name}]: ${safeSlice(previewText, 0, 400)}` });
      }

      // Error tracking
      if (isToolError(compactedResult)) {
        consecutiveToolFailures++;
      } else {
        consecutiveToolFailures = 0;
      }
    }

    // Round budget awareness
    let budgetWarning = '';
    if (round > 0 && round % 15 === 0) {
      logger.write(chalk.dim(`  ⚠ ${round} tool rounds used\n`));
    }
    if (round === 50) {
      budgetWarning = '\n[SYSTEM WARNING] 50 tool rounds used. Is the task still incomplete? Work efficiently, avoid unnecessary repetition.';
    }

    // Error recovery
    let errorRecovery = '';
    if (consecutiveToolFailures >= 3) {
      errorRecovery = '\n' + ERROR_RECOVERY_PROMPT;
      consecutiveToolFailures = 0;
    }

    await pushMessage({ role: 'assistant', content: text || '[tool calls]' });
    await pushMessage({
      role: 'user',
      content: toolResultBlocks.join('\n\n') + '\n\nUse these results to continue.' + budgetWarning + errorRecovery,
    });
    if (assembler) {
      const turnIndex = messages.length - 1 - startIdx;
      const notices = pendingRecords.map(r => assembler.recordTool(r.name, r.input, r.result, text, turnIndex)).filter(Boolean);
      if (notices.length) {
        await pushMessage({ role: 'user', content: notices.join('\n') });
        logger.write(chalk.yellow('  ↻ Aynı inceleme sonucu tekrarlandı; modele mevcut kanıtı kullanması hatırlatıldı.'));
      }
    }
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
    const capped = round >= maxRounds && !abortSignal?.aborted;
    const finalContent = capped
      ? `[DEHA: Araç turu sınırına ulaşıldı (${round}/${maxRounds} tur). Görev tamamlanmadı; görev ve brain korunuyor.]`
      : finalText?.trim() ? finalText : describeSilentFinalResponse(lastStopReason, hadToolActivity);
    if (capped) updateActiveTask({ taskState: 'INTERRUPTED' });
    finalText = finalContent;
    await pushMessage({ role: 'assistant', content: finalContent });
    if (capped) logger.write(chalk.yellow('\n' + finalContent + '\n'));
  }

  return { response: finalText, messages: messages.slice(startIdx) };
}

// ─── OpenAI-uyumlu agent döngüsü ────────────────────────────────────────────

async function runAgentOpenAI(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
  onMessage?: OnMessage,
  assembler?: TurnContextAssembler,
): Promise<AgentResult> {
  // Geçmiş mesajları OpenAI formatına dönüştür + mutual-pairing ile orphan tool mesajlarını temizle
  const startIdx = history.length;
  const sanitizedHistory = sanitizeHistoryForOpenAI(history);
  const initialMessageCount = 1 + sanitizedHistory.length;
  const messages: OAIMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...sanitizedHistory,
  ];

  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;
  let consecutiveToolFailures = 0;

  let lastFinishReason: string | null = null;
  let inlineRetryRounds = 0;
  let contextRecoveryAttempts = 0;
  let jobCompletionRetries = 0;
  const turnBudget = computeTurnBudgetTokens(config, allTools as unknown[]);

  // A process crash/kill mid-turn previously lost the whole turn (nothing was
  // persisted until the full multi-round loop returned) — a resumed session
  // had zero memory of a tool call that was in flight. Persisting each
  // message immediately means even a partial tool_calls/tool_result set
  // survives; sanitizeHistoryForOpenAI now turns any leftover orphaned
  // tool_calls into a visible text note instead of silently dropping them.
  const pushMessage = async (msg: OAIMessage): Promise<void> => {
    messages.push(msg);
    if (onMessage) await onMessage(toHistoryMessage(msg));
  };

  while (round < maxRounds) {
    if (abortSignal?.aborted) {
      updateActiveTask({ taskState: 'INTERRUPTED' });
      const abortContent = '[İşlem kullanıcı tarafından durduruldu]';
      const finalMsg: OAIMessage = {
        role: 'assistant',
        content: abortContent,
      };
      await pushMessage(finalMsg);
      finalText = abortContent;
      break;
    }

    round++;
    let roundText = '';

    let requestMessages: OAIMessage[] = messages;
    if (assembler) {
      const built = assembler.build({ systemPrompt: config.systemPrompt, history, turn: messages.slice(initialMessageCount) as any, userMessage });
      requestMessages = built.messages as OAIMessage[];
      logAssemblerStats(built.stats);
    } else {
      const fit = fitTurnToBudget(messages as TurnMessage[], initialMessageCount, turnBudget, buildTaskReminder(userMessage));
      if (fit.dropped > 0) logger.write(chalk.dim(`  ✂ Bağlam limiti: ${fit.dropped} eski araç mesajı çıkarıldı, görev çapası korundu\n`));
    }

    const { text, toolCalls, rawAssistantMsg, malformedToolCalls, finishReason } = await sendWithToolsOpenAICompat(
      requestMessages,
      config,
      allTools,
      (chunk) => {
        roundText += chunk;
      },
      abortSignal,
      forceToolUse ? 'required' : 'auto',
    );
    lastFinishReason = finishReason;
    const inlineToolCalls = toolCalls.length > 0 ? [] : parseInlineXmlToolCalls(text, allTools);
    const effectiveToolCalls = toolCalls.length > 0 ? toolCalls : inlineToolCalls;
    let effectiveAssistantMsg = inlineToolCalls.length > 0
      ? withSyntheticOpenAIToolCalls(rawAssistantMsg, inlineToolCalls)
      : rawAssistantMsg;

    if (effectiveToolCalls.length > 0 && effectiveAssistantMsg.tool_calls && Array.isArray(effectiveAssistantMsg.tool_calls)) {
      const validIds = new Set(effectiveToolCalls.map(tc => tc.id));
      effectiveAssistantMsg = {
        ...effectiveAssistantMsg,
        tool_calls: effectiveAssistantMsg.tool_calls.filter((tc: any) => validIds.has(tc.id))
      };
    }

    if (malformedToolCalls > 0 && effectiveToolCalls.length === 0) {
      forceToolUse = true;
      await pushMessage({
        role: 'user',
        content: MALFORMED_TOOL_CALL_PROMPT,
      });
      continue;
    }

    if (effectiveToolCalls.length === 0 && looksLikeUnexecutedToolCallAttempt(text) && inlineRetryRounds < MAX_INLINE_RETRY_ROUNDS) {
      inlineRetryRounds++;
      forceToolUse = true;
      await pushMessage(rawAssistantMsg);
      await pushMessage({ role: 'user', content: MALFORMED_TOOL_CALL_PROMPT });
      continue;
    }

    if (effectiveToolCalls.length === 0) {
      if (!text.trim() && getActiveTask()?.taskState === 'ACTIVE' && round >= maxRounds) {
        updateActiveTask({ taskState: 'INTERRUPTED' });
      }
      // Context-loss kontrolü: Aktif görev varken model "Henüz görev vermediniz" dediğinde kurtar
      const activeTask = getActiveTask();
      const isContextLoss = activeTask && activeTask.taskState === 'ACTIVE' && isContextLossGreeting(text, { userMessage, hadToolActivity });
      if (isContextLoss) {
        if (contextRecoveryAttempts < MAX_CONTEXT_RECOVERY_ATTEMPTS) {
          contextRecoveryAttempts++;
          updateActiveTask({ recoveryAttemptCount: contextRecoveryAttempts });
          forceToolUse = true;
          await pushMessage(effectiveAssistantMsg);
          const recoveryPrompt = `[SİSTEM UYARISI: Görev zaten aktif ve devam ediyor. Karşılama veya görev bekleme mesajı üretme.\nOrijinal Kullanıcı İsteği: "${activeTask.originalUserRequest}"\n${activeTask.lastMeaningfulToolResult ? `Son Araç Çıktısı: ${activeTask.lastMeaningfulToolResult}\n` : ''}Lütfen göreve odaklan ve gerekli adımları/araçları çalıştırarak devam et.]`;
          await pushMessage({ role: 'user', content: recoveryPrompt });
          continue;
        } else {
          logger.write('\n' + chalk.bold.cyan('DEHA:'));
          finalText = describeContextRecoveryFailure(activeTask.originalUserRequest);
          logger.raw(chalk.red(`\n${finalText}\n`));
          updateActiveTask({ taskState: 'INTERRUPTED' });
          const finalMsg: OAIMessage = {
            ...effectiveAssistantMsg,
            content: finalText,
          };
          await pushMessage(finalMsg);
          break;
        }
      }

      const pendingJobs = parseStatusTag(text) !== 'BLOCKED' ? blockingJobsForActiveTask() : [];
      if (pendingJobs.length) {
        if (++jobCompletionRetries <= 3 && round < maxRounds) {
          await pushMessage(effectiveAssistantMsg);
          await pushMessage({ role: 'user', content: pendingJobReminder(pendingJobs.map(j => j.id)) });
          forceToolUse = true;
          continue;
        }
        finalText = 'Gerekli arka plan işleri henüz tamamlanmadı. İşler korunuyor; list_jobs / wait_job ile devam edilebilir.';
        updateActiveTask({ taskState: 'INTERRUPTED' });
        await pushMessage({ role: 'assistant', content: finalText });
        logger.write(finalText);
        break;
      }
      finalText = text;
      const status = parseStatusTag(text);
      if (status === 'COMPLETE') {
        completeActiveTask();
      } else if (status === 'BLOCKED') {
        updateActiveTask({ taskState: 'BLOCKED' });
      }

      const shouldContinue = hadToolActivity
        ? await shouldContinueAfterToolPhase(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            postToolCompletionRounds,
          )
        : await shouldContinueAfterNoToolResponse(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            autoContinueRounds,
            aggressiveAutoContinue,
          );

      if (shouldContinue) {
        autoContinueRounds++;
        forceToolUse = true;
        await pushMessage(effectiveAssistantMsg);
        await pushMessage({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }

      // Final asistan mesajını mutlaka kalıcılaştır
      const finalContent = text?.trim()
        ? text
        : describeSilentFinalResponse(lastFinishReason, hadToolActivity);
      finalText = finalContent;
      if (!text.trim() && getActiveTask()?.taskState === 'ACTIVE') updateActiveTask({ taskState: 'INTERRUPTED' });
      const finalAssistantMsg: OAIMessage = {
        ...effectiveAssistantMsg,
        content: finalContent,
      };
      await pushMessage(finalAssistantMsg);

      const reasoningText = rawAssistantMsg.reasoning_content 
        ? chalk.dim(chalk.gray(`\n<think>\n${rawAssistantMsg.reasoning_content}\n</think>\n`))
        : '';
        
      const hasVisibleOutput = (text && !isSilentInterimOutput(text)) || reasoningText;

      if (looksLikeUnexecutedToolCallAttempt(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.red(describeUnexecutedToolCall(lastFinishReason)));
        logger.raw('\n');
      } else if (hasVisibleOutput) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        if (reasoningText) logger.raw(reasoningText);
        if (text && !isSilentInterimOutput(text)) logger.raw(roundText);
        logger.raw('\n');
      } else if (hadToolActivity) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.dim(finalContent + '\n'));
      } else {
        // Ne görünür metin ne tool aktivitesi var — kullanıcıya asla sessiz
        // dönmeyelim, aksi halde "chat cevap vermiyor" gibi görünür.
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.red(describeEmptyResponse(lastFinishReason)));
        logger.raw('\n');
      }
      break;
    }

    const reasoningText = rawAssistantMsg.reasoning_content
      ? chalk.dim(chalk.gray(`\n<think>\n${rawAssistantMsg.reasoning_content}\n</think>\n`))
      : '';

    const hasVisibleOutput = (text && !isSilentInterimOutput(text)) || reasoningText;

    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
    await pushMessage(effectiveAssistantMsg);
    hadToolActivity = true;
    postToolCompletionRounds = 0;
    autoContinueRounds = 0;
    forceToolUse = false;

    if (hasVisibleOutput) {
      logger.write('\n' + chalk.bold.cyan('DEHA:'));
      if (reasoningText) logger.raw(reasoningText);
      if (text && !isSilentInterimOutput(text)) logger.raw(roundText);
      logger.raw('\n');
    }

    // Tool'ları çalıştır ve sonuçları ekle
    for (const tc of effectiveToolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config, abortSignal);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const previewText = compactedResult.trim();
      const preview = previewText.length === 0
        ? chalk.red('(boş sonuç — timeout veya bağlantı hatası olabilir)')
        : chalk.gray(previewText.length > 200 ? previewText.slice(0, 200) + '…' : previewText);
      logger.write(chalk.dim('    → ') + preview);

      if (previewText.length > 0 && !isSilentInterimOutput(previewText)) {
        updateActiveTask({ lastMeaningfulToolResult: `[${tc.name}]: ${safeSlice(previewText, 0, 400)}` });
      }

      // Error tracking
      if (isToolError(compactedResult)) {
        consecutiveToolFailures++;
      } else {
        consecutiveToolFailures = 0;
      }

      // OpenAI tool result format
      const inspectionNotice = assembler?.recordTool(tc.name, tc.input, compactedResult, text, messages.length - initialMessageCount);
      await pushMessage({
        role: 'tool',
        tool_call_id: tc.id,
        content: compactedResult + (inspectionNotice ? '\n\n' + inspectionNotice : ''),
      });
      if (inspectionNotice) logger.write(chalk.yellow('  ↻ Aynı inceleme sonucu tekrarlandı; modele mevcut kanıtı kullanması hatırlatıldı.'));

      finalText = text;
    }

    // Round budget awareness
    if (round > 0 && round % 15 === 0) {
      logger.write(chalk.dim(`  ⚠ ${round} tool rounds used\n`));
    }
    if (round === 50) {
      await pushMessage({ role: 'user', content: '[SYSTEM WARNING] 50 tool rounds used. Is the task still incomplete? Work efficiently, avoid unnecessary repetition.' });
    }

    // Error recovery injection
    if (consecutiveToolFailures >= 3) {
      await pushMessage({ role: 'user', content: ERROR_RECOVERY_PROMPT });
      consecutiveToolFailures = 0;
    }
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
    const capped = round >= maxRounds && !abortSignal?.aborted;
    const finalContent = capped
      ? `[DEHA: Araç turu sınırına ulaşıldı (${round}/${maxRounds} tur). Görev tamamlanmadı; görev ve brain korunuyor.]`
      : finalText?.trim() ? finalText : describeSilentFinalResponse(lastFinishReason, hadToolActivity);
    if (capped) updateActiveTask({ taskState: 'INTERRUPTED' });
    finalText = finalContent;
    const finalAssistantMsg: OAIMessage = {
      role: 'assistant',
      content: finalContent,
    };
    await pushMessage(finalAssistantMsg);
    if (capped) logger.write(chalk.yellow('\n' + finalContent + '\n'));
  }

  // Convert internal OAIMessage back to Message[] for history
  const resultHistory: Message[] = messages
    .slice(initialMessageCount)
    .filter(m => m.role !== 'system')
    .map(toHistoryMessage);

  return { response: finalText, messages: resultHistory };
}

function toHistoryMessage(m: OAIMessage): Message {
  return {
    role: m.role as any,
    content: typeof m.content === 'string' ? m.content : (m.content === null ? '' : String(m.content)),
    tool_calls: m.tool_calls as any[],
    tool_call_id: m.tool_call_id as string,
    reasoning_content: m.reasoning_content as string,
  };
}

function compactToolResultForModel(toolName: string, result: string): string {
  const maxChars = readPositiveInt(process.env.DEHA_MAX_TOOL_RESULT_CHARS, MAX_TOOL_RESULT_CHARS);
  if (!result || result.length <= maxChars) return result;

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.max(0, maxChars - headChars - 260);
  const omitted = result.length - headChars - tailChars;

  return [
    safeSlice(result, 0, headChars),
    '',
    `[DEHA TOOL OUTPUT TRUNCATED: ${toolName} sonucu ${result.length} karakterdi; ${omitted} karakter modele gönderilmedi. Daha spesifik path/pattern ile tekrar çağır.]`,
    '',
    tailChars > 0 ? safeSlice(result, -tailChars) : '',
  ].join('\n');
}

/** 
 * Geçmişteki devasa tool çıktılarını özetler.
 * 
 * ÖNEMLİ — PROMPT CACHE UYUMLULUĞU:
 * Bu fonksiyon orijinal history dizisini IN-PLACE (yerinde) değiştirir.
 * Böylece bir kez kırpılan mesaj sonraki çağrılarda aynı kalır ve
 * mesaj dizisinin başındaki prefix sabitleşir. Bu da OpenRouter/provider
 * tarafındaki prompt cache mekanizmasının düzgün çalışmasını sağlar.
 * (Eski davranış: her çağrıda kayan pencere ile prefix değişiyordu
 *  → cache hiçbir zaman hit edemiyordu → çağrı başı ~$0.33 harcama.)
 */
export function summarizeOldToolResults(history: Message[], keepCount = 10): Message[] {
  const pairedToolCallIds = collectAssistantToolCallIds(history);
  const keepThreshold = history.length - keepCount;

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];

    // Yetim (orphan) tool sonuçları — hem eski hem yeni pencerede dönüştür
    if (msg.role === 'tool' && (!msg.tool_call_id || !pairedToolCallIds.has(msg.tool_call_id))) {
      history[i] = asPreviousToolResultContext(msg);
      continue;
    }

    // Son keepCount mesajını olduğu gibi bırak (detay lazım)
    if (i >= keepThreshold) continue;

    // Eski tool sonuçlarını kırp — IN-PLACE mutasyon
    if (msg.role === 'tool') {
       const content = (msg.content || '').trim();
       
       // Kısa sonuçları olduğu gibi bırak (zaten kırpılmışlar da buraya düşer → idempotent)
       if (content.length <= 500) continue;
       
       // Hata mesajlarını daha fazla bağlamla koru
       const lower = content.toLowerCase();
       if (lower.includes('error') || lower.includes('hata') || lower.includes('failed') || lower.includes('exception')) {
         if (content.length <= 1500) continue;
         history[i] = { ...msg, content: safeSlice(content, 0, 800) + `\n[... ${content.length - 1100} karakter kırpıldı ...]\n` + safeSlice(content, -300) };
         continue;
       }

       // Büyük sonuçlar: head + tail koru (~450 char → bir sonraki çağrıda <= 500 kontrolüne takılır, tekrar kırpılmaz)
       history[i] = { ...msg, content: safeSlice(content, 0, 300) + `\n[... tool sonucu kırpıldı: ${content.length} karakter → 450 karakter ...]\n` + safeSlice(content, -150) };
    }
  }

  return history;
}

function collectAssistantToolCallIds(history: Message[]): Set<string> {
  const ids = new Set<string>();

  for (const msg of history) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.tool_calls)) continue;
    for (const toolCall of msg.tool_calls) {
      const id = typeof toolCall?.id === 'string' ? toolCall.id : '';
      if (id) ids.add(id);
    }
  }

  return ids;
}

function asPreviousToolResultContext(msg: Message): Message {
  const id = msg.tool_call_id ? ` id=${msg.tool_call_id}` : '';
  const content = compactPreviousToolContext(msg.content || '');
  return {
    role: 'user',
    content: `<previous_tool_result${id}>\n${content}\n</previous_tool_result>`,
  };
}

function compactPreviousToolContext(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 2_000) return trimmed;

  return [
    safeSlice(trimmed, 0, 1_200),
    '',
    `[... previous tool result truncated: ${trimmed.length} chars total ...]`,
    '',
    safeSlice(trimmed, -600),
  ].join('\n');
}


/**
 * DeepSeek DSML format parser.
 * DeepSeek sometimes emits tool calls as text in its internal DSML format:
 *   <｜｜DSML｜｜invoke name="tool_name">
 *     <｜｜DSML｜｜parameter name="param" string="true">value</｜｜DSML｜｜parameter>
 *   </｜｜DSML｜｜invoke>
 * instead of proper JSON tool_calls. This parser catches and executes them.
 */
function parseInlineDsmlToolCalls(text: string, tools: typeof DEHA_TOOLS): ToolCall[] {
  if (!text || !text.includes('DSML')) return [];

  const toolNames = new Set(tools.map((t) => t.name));
  const calls: ToolCall[] = [];

  // Match <*DSML*invoke name="tool_name">...</*DSML*invoke>
  const invokePattern = /<[^>]*DSML[^>]*invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[^>]*DSML[^>]*invoke>/gi;
  let invokeMatch: RegExpExecArray | null;

  while ((invokeMatch = invokePattern.exec(text)) !== null) {
    const name = invokeMatch[1].trim();
    if (!toolNames.has(name)) continue;

    const body = invokeMatch[2];
    const input: Record<string, unknown> = {};

    // 1. Standard DSML parameter: <*DSML*parameter name="key" ...>value</*DSML*parameter>
    const paramPattern = /<[^>]*DSML[^>]*parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[^>]*DSML[^>]*parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramPattern.exec(body)) !== null) {
      const key = paramMatch[1].trim();
      const val = decodeXmlEntities(paramMatch[2].trim());
      input[key] = coerceInlineXmlValue(val);
    }

    // 2. Short parameter format: <parameter=key>value</parameter>
    const shortParamPattern = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/gi;
    let shortParamMatch: RegExpExecArray | null;
    while ((shortParamMatch = shortParamPattern.exec(body)) !== null) {
      const key = shortParamMatch[1].trim();
      const val = decodeXmlEntities(shortParamMatch[2].trim());
      input[key] = coerceInlineXmlValue(val);
    }

    if (Object.keys(input).length > 0) {
      calls.push({ name, input, id: `dsml_${name}_${calls.length}_${Date.now()}` });
    }
  }

  return calls.slice(0, 8);
}

function parseInlineXmlToolCalls(text: string, tools: typeof DEHA_TOOLS): ToolCall[] {
  if (!text) return [];

  const toolNames = new Set(tools.map((tool) => tool.name));

  // 1. Markdown-style: [Tool Call: **read_file**({...})]  — xAI Grok, etc.
  const mdCalls = parseInlineMarkdownToolCalls(text, toolNames);
  if (mdCalls.length > 0) return mdCalls;

  // 2. DeepSeek DSML format
  if (text.includes('DSML')) {
    const dsmlCalls = parseInlineDsmlToolCalls(text, tools);
    if (dsmlCalls.length > 0) return dsmlCalls;
  }

  if (!text.includes('<')) return [];

  // 3. Claude-style <invoke name="tool"><parameter name="key">value</parameter></invoke>
  // Some models (especially local ones fine-tuned/prompted on Claude-style tool-call
  // examples) emit this literally as plain text instead of using structured
  // tool_calls — without this, those calls silently never execute.
  if (text.includes('<invoke')) {
    const invokeCalls = parseInlineInvokeToolCalls(text, toolNames);
    if (invokeCalls.length > 0) return invokeCalls;
  }

  // 4. XML-style: <tool_name>...</tool_name>

  const calls: ToolCall[] = [];

  for (const name of toolNames) {
    const pattern = new RegExp(`<${escapeRegExp(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(name)}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const input = parseInlineXmlToolInput(name, match[1]);
      if (input) {
        calls.push({
          name,
          input,
          id: `inline_${name}_${calls.length}_${Date.now()}`,
        });
      }
    }
  }

  return calls.slice(0, 8);
}

/**
 * Parse markdown-style inline tool calls emitted by xAI Grok and similar models.
 * Matches patterns like:
 *   [Tool Call: **read_file**({"path":"/root/file.ts","start_line":1,"end_line":50})]
 *   [Tool Call: read_file({"path":"/root/file.ts"})]
 *   **read_file**({"path":"/root/file.ts"})
 */
function parseInlineMarkdownToolCalls(text: string, toolNames: Set<string>): ToolCall[] {
  const calls: ToolCall[] = [];

  // Pattern 1: [Tool Call: **name**({...})] or [Tool Call: name({...})]
  const toolCallPattern = /\[Tool\s*Call:\s*\*{0,2}(\w+)\*{0,2}\s*\((\{[\s\S]*?\})\)\s*\]/gi;
  let match: RegExpExecArray | null;
  while ((match = toolCallPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!toolNames.has(name)) continue;
    try {
      const input = safeJsonParse(match[2]) as Record<string, unknown>;
      calls.push({ name, input, id: `md_${name}_${calls.length}_${Date.now()}` });
    } catch { /* JSON parse failed, skip */ }
  }

  if (calls.length > 0) return calls.slice(0, 8);

  // Pattern 2: Standalone **name**({...}) without [Tool Call:] wrapper
  const standalonePattern = /\*{2}(\w+)\*{2}\s*\((\{[\s\S]*?\})\)/gi;
  while ((match = standalonePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!toolNames.has(name)) continue;
    try {
      const input = safeJsonParse(match[2]) as Record<string, unknown>;
      calls.push({ name, input, id: `md_${name}_${calls.length}_${Date.now()}` });
    } catch { /* JSON parse failed, skip */ }
  }

  return calls.slice(0, 8);
}

/**
 * Parse Claude/Anthropic-style inline tool calls:
 *   <invoke name="read_file">
 *   <parameter name="path">C:\project\file.ts</parameter>
 *   <parameter name="start_line">1</parameter>
 *   </invoke>
 * Seen from models that were fine-tuned on (or whose system prompt example
 * shows) Claude-style function-calling XML and reproduce it as literal text
 * instead of emitting a real tool_calls entry.
 */
function parseInlineInvokeToolCalls(text: string, toolNames: Set<string>): ToolCall[] {
  const calls: ToolCall[] = [];

  const invokePattern = /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/gi;
  let invokeMatch: RegExpExecArray | null;

  while ((invokeMatch = invokePattern.exec(text)) !== null) {
    const name = invokeMatch[1].trim();
    if (!toolNames.has(name)) continue;

    const body = invokeMatch[2];
    const input: Record<string, unknown> = {};

    const paramPattern = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramPattern.exec(body)) !== null) {
      const key = paramMatch[1].trim();
      const val = decodeXmlEntities(paramMatch[2].trim());
      input[key] = coerceInlineXmlValue(val);
    }

    if (Object.keys(input).length > 0) {
      calls.push({ name, input, id: `invoke_${name}_${calls.length}_${Date.now()}` });
    }
  }

  return calls.slice(0, 8);
}

function parseInlineXmlToolInput(toolName: string, body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const jsonCandidate = extractJsonObject(trimmed);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // XML child tag parsing fallback.
    }
  }

  const input: Record<string, unknown> = {};
  const childPattern = /<([A-Za-z_][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let child: RegExpExecArray | null;
  while ((child = childPattern.exec(trimmed)) !== null) {
    input[child[1]] = coerceInlineXmlValue(decodeXmlEntities(child[2].trim()));
  }

  if (Object.keys(input).length > 0) return normalizeInlineToolInput(toolName, input);

  if (toolName === 'run_shell' || toolName === 'run_terminal') {
    return { command: decodeXmlEntities(trimmed) };
  }
  if (toolName === 'read_file' || toolName === 'cat' || toolName === 'list_dir' || toolName === 'ls') {
    return { path: decodeXmlEntities(trimmed) };
  }

  return null;
}

function normalizeInlineToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  if ((toolName === 'run_shell' || toolName === 'run_terminal') && input.command === undefined && typeof input.cmd === 'string') {
    input.command = input.cmd;
  }
  if ((toolName === 'read_file' || toolName === 'cat') && input.path === undefined && typeof input.file === 'string') {
    input.path = input.file;
  }
  return input;
}

function withSyntheticOpenAIToolCalls(message: OAIMessage, toolCalls: ToolCall[]): OAIMessage {
  return {
    ...message,
    role: 'assistant',
    content: typeof message.content === 'string' ? stripInlineXmlToolCalls(message.content, toolCalls) : '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.input),
      },
    })),
  };
}

function stripInlineXmlToolCalls(text: string, toolCalls: ToolCall[]): string {
  let stripped = text;
  for (const tc of toolCalls) {
    stripped = stripped.replace(new RegExp(`<${escapeRegExp(tc.name)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tc.name)}>`, 'gi'), '').trim();
  }
  return stripped;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function coerceInlineXmlValue(value: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  const jsonCandidate = extractJsonObject(value) ?? (value.startsWith('[') && value.endsWith(']') ? value : null);
  if (jsonCandidate) {
    try {
      return safeJsonParse(jsonCandidate);
    } catch {
      return value;
    }
  }
  return value;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1000 ? parsed : fallback;
}

const AUTO_CONTINUE_PROMPT = [
  'This response was detected as an interim status update.',
  'Do not wait for user input or ask for permission.',
  'Actually execute the inspection, search, read, or edit step you just mentioned.',
  'Use tools as needed and continue until the task is complete.',
  'Only stop if there is a genuine blocker you cannot resolve on your own.',
].join(' ');

const POST_TOOL_CONTINUE_PROMPT = [
  'Tool results were just produced but the final user-facing response is not yet complete.',
  'If you made a code change, VERIFY FIRST: re-read the file (did the edit land correctly?), if you changed an API endpoint test it with curl and READ THE RESPONSE BODY.',
  'Getting HTTP 200 is NOT enough — prove that the response content is correct.',
  'If the information the user requested is already in the tool results, write the final concrete answer and stop.',
  'Only make the next tool call if it is directly required to answer the user\'s request.',
  'Do not expand scope or start inspecting unrelated code or config files.',
  '"I fixed it / Done" without testing is FORBIDDEN. You MUST test before claiming completion.',
].join(' ');

const MALFORMED_TOOL_CALL_PROMPT = [
  'The previous tool call was truncated or had malformed JSON.',
  'Retry the same step but produce only valid and complete tool calls.',
  'If you are writing a large file, break the content into smaller chunks or use a shorter tool call.',
  'Do not write interim status messages.',
].join(' ');

const ERROR_RECOVERY_PROMPT = [
  '[ERROR RECOVERY] The last 3 tool calls returned errors.',
  'Do NOT retry the same command — try a different approach.',
  'Analyze the root cause: file not found? wrong path? syntax error?',
  'Try a different file path, different command, or different parameters.',
  'If 3 different approaches all fail, explain the situation to the user and ask for help.',
].join(' ');

function isToolError(result: string): boolean {
  if (!result) return true;
  const lower = result.toLowerCase();
  return lower.startsWith('hata:') || lower.startsWith('error:') ||
    lower.includes('command failed') || lower.includes('enoent') ||
    lower.includes('permission denied') || lower.includes('not found') ||
    lower.includes('timeout') || lower.includes('connection refused') ||
    (lower.startsWith('{') && lower.includes('"error"'));
}

function describeContextRecoveryFailure(task: string): string {
  return `Model verilen görevi takip edemedi; ${MAX_CONTEXT_RECOVERY_ATTEMPTS} kurtarma denemesinden sonra bu tur durduruldu. Göreviniz kayıtlı: "${safeSlice(task, 0, 300)}". "devam et" yazarak yeniden deneyebilirsiniz.`;
}

/** Check if the model's response contains a [STATUS: COMPLETE/CONTINUE/BLOCKED] tag */
function parseStatusTag(text: string): 'COMPLETE' | 'CONTINUE' | 'BLOCKED' | null {
  const match = text.match(/\[STATUS:\s*(COMPLETE|CONTINUE|BLOCKED)\]/i);
  return match ? match[1].toUpperCase() as any : null;
}

function shouldAutoContinue(
  text: string,
  round: number,
  maxRounds: number,
  autoContinueRounds: number,
  aggressiveAutoContinue = false,
): boolean {
  if (!text.trim()) return false;
  if (round >= maxRounds) return false;
  if (autoContinueRounds >= MAX_AUTO_CONTINUE_ROUNDS) return false;

  const normalized = text.toLowerCase().trim();
  if (normalized.length > 900) return false;

  if (aggressiveAutoContinue && !looksLikeFinalAnswer(normalized)) {
    return true;
  }

  return containsInterimLanguage(normalized);
}

const INTERIM_PATTERNS: RegExp[] = [
  /\bgörelim\b/,
  /\bbulup\b/,
  /\bbakayım\b/,
  /\bbakıyorum\b/,
  /\binceleyeyim\b/,
  /\binceleyelim\b/,
  /\binceleyeceğim\b/,
  /\binceleyecegim\b/,
  /\bkontrol edeyim\b/,
  /\bkontrol ediyorum\b/,
  /\bkontrol edeceğim\b/,
  /\bkontrol edecegim\b/,
  /\bgöreyim\b/,
  /\bgoreyim\b/,
  /\bekleyeceğim\b/,
  /\bbelirleyelim\b/,
  /\bson satırları\b/,
  /\bdurmuyorum\b/,
  /\byazıyorum\b/,
  /\byazacağım\b/,
  /\byazacagim\b/,
  /\bekliyorum\b/,
  /\bdüzelteceğim\b/,
  /\bdüzeltiyorum\b/,
  /\bduzeltiyorum\b/,
  /\bdüzenliyorum\b/,
  /\bduzenliyorum\b/,
  /\bgüncelliyorum\b/,
  /\bguncelliyorum\b/,
  /\bilerliyorum\b/,
  /\bbitireceğim\b/,
  /\beklemeden\b/,
  /\bfonksiyonunu\b.*\bgörelim\b/,
  /\bşimdi\b.*\b(bakayım|görelim|inceleyelim|bulayım)\b/,
  /\bşimdi\b.*\b(yazıyorum|ekliyorum|düzeltiyorum|okuyorum|bakıyorum)\b/,
  /\bhemen\b.*\b(yazıyorum|bakıyorum|ekliyorum|okuyorum)\b/,
  /\bönce\b.*\b(oku|okuyayım|bakayım|görelim|bulayım)\b/,
  /\b(yapacağım|edeceğim|ekleyeceğim|yazacağım|bakacağım|okuyacağım|bulacağım)\b/,
  /\blet me\b.*\b(check|inspect|find|look)\b/,
  /\bi('| a)?ll\b.*\b(check|inspect|look|find)\b/,
];

function containsInterimLanguage(normalized: string): boolean {
  if (looksLikePlanningJson(normalized)) return true;

  if (INTERIM_PATTERNS.some((p) => p.test(normalized))) return true;

  return (
    normalized.endsWith(':') ||
    normalized.endsWith('...') ||
    normalized.includes('ekleme yapacağım yeri') ||
    normalized.includes('ona göre') ||
    normalized.includes('then i') ||
    normalized.includes('next i')
  );
}

function isSilentInterimOutput(text: string): boolean {
  return looksLikePlanningJson(text.toLowerCase().trim());
}

/** Model hiç metin/tool_call üretmeden turu bitirdiğinde kullanıcıya gösterilecek teşhis mesajı. */
/**
 * The "attempted but unexecuted inline tool call" diagnostic used to always
 * blame max_tokens truncation, even though we already capture the real
 * stop_reason/finish_reason for the round. Two genuinely different failures
 * were being reported identically:
 *   - actually truncated (max_tokens/length): the JSON is *incomplete* — no
 *     amount of parser improvement can recover data that was never written,
 *     the model needs a bigger tool-call token budget or a smaller step.
 *   - stopped normally (stop/end_turn) but still unrecognized: the model
 *     finished writing a *complete* pseudo tool-call in a format none of the
 *     inline parsers matches — this is an actual parser gap worth reporting/fixing.
 */
function describeUnexecutedToolCall(stopReason: string | null): string {
  const isTruncated = stopReason === 'max_tokens' || stopReason === 'length';
  if (isTruncated) {
    return '[DEHA: Model bir araç çağrısını düz metin olarak yazmaya başladı ama yanıt token limitine (max_tokens) takıldığı için tamamlayamadı — çağrı eksik kaldığından çalıştırılamadı. DEHA_TOOL_MAX_TOKENS değerini artırın veya isteği daha küçük adımlara bölün.]';
  }
  return `[DEHA: Model bir araç çağrısını düz metin olarak yazdı ama hiçbir formatla eşleşmedi (stop_reason: ${stopReason ?? 'bilinmiyor'}) — araç çalıştırılmadı. Bu muhtemelen tanınmayan bir tool-call formatı, lütfen bildirin.]`;
}

function describeEmptyResponse(stopReason: string | null): string {
  const isTruncated = stopReason === 'max_tokens' || stopReason === 'length';
  if (isTruncated) {
    return '[DEHA: Model boş yanıt döndürdü — yanıt token limitine (max_tokens) takılmış olabilir. ' +
      'DEHA_TOOL_MAX_TOKENS değerini artırmayı veya /clear ile konuşma geçmişini kısaltmayı deneyin.]';
  }
  return `[DEHA: Model boş yanıt döndürdü (stop_reason: ${stopReason ?? 'bilinmiyor'}). Tekrar deneyin veya mesajı yeniden ifade edin.]`;
}

/**
 * Tool aktivitesi sonrası model sessiz kaldığında (ne tool çağrısı ne metin)
 * gösterilecek son mesaj. ÖNEMLİ: stop_reason max_tokens/length ise bu
 * GERÇEK bir tamamlanma değil, bir KESİNTİdir — "[Agent araştırmayı
 * tamamladı]" gibi başarı ima eden genel mesaj yanıltıcı olur ve görev
 * yarıda kesilmiş halde kullanıcıya "bitti" gibi görünür. Bu durumda
 * describeEmptyResponse'un token-limiti açıklayan mesajını kullan.
 */
function describeSilentFinalResponse(stopReason: string | null, hadToolActivity: boolean): string {
  if (!hadToolActivity) return describeEmptyResponse(stopReason);
  const isTruncated = stopReason === 'max_tokens' || stopReason === 'length';
  if (isTruncated) {
    return '[DEHA: Araç sonuçları üretildi ama model ardından boş yanıt döndürdü — yanıt token limitine ' +
      '(max_tokens) takılmış olabilir, görev YARIDA KESİLMİŞ olabilir. DEHA_TOOL_MAX_TOKENS değerini artırmayı ' +
      'deneyin veya daha kısa araç çıktılarıyla yeniden devam edin. Görev bağlamını silmeyin.]';
  }
  return '[DEHA: Model araç çıktılarından sonra nihai yanıt üretmedi. Görevin tamamlandığı doğrulanmadı; mevcut bağlam korunuyor. Devam etmek için "devam et" yazabilirsiniz.]';
}

function looksLikePlanningJson(normalized: string): boolean {
  if (!normalized) return false;
  if (!normalized.includes('execution_plan') && !normalized.includes('"steps"')) return false;
  return normalized.includes('"ready"') || normalized.includes('"files_to_check"') || normalized.includes('"action"');
}

async function shouldContinueAfterNoToolResponse(
  userMessage: string,
  assistantText: string,
  _config: DehaConfig,
  round: number,
  maxRounds: number,
  autoContinueRounds: number,
  aggressiveAutoContinue: boolean,
): Promise<boolean> {
  // Önce structured STATUS tag kontrolü
  const status = parseStatusTag(assistantText);
  if (status === 'COMPLETE') return false;
  if (status === 'BLOCKED') {
    if (isContextLossGreeting(assistantText)) return false;
    return false;
  }
  if (status === 'CONTINUE') return autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS;

  // Fallback: regex heuristics
  if (shouldAutoContinue(assistantText, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)) {
    return true;
  }

  if (!assistantText.trim()) {
    return aggressiveAutoContinue || autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS;
  }

  const normalized = assistantText.toLowerCase().trim();
  if (containsInterimLanguage(normalized)) return true;

  return false;
}

async function shouldContinueAfterToolPhase(
  userMessage: string,
  assistantText: string,
  _config: DehaConfig,
  round: number,
  maxRounds: number,
  postToolCompletionRounds: number,
): Promise<boolean> {
  if (round >= maxRounds) return false;
  if (postToolCompletionRounds >= MAX_POST_TOOL_COMPLETION_ROUNDS) return false;

  // Önce structured STATUS tag kontrolü
  const status = parseStatusTag(assistantText);
  if (status === 'COMPLETE') return false;
  if (status === 'BLOCKED') {
    if (isContextLossGreeting(assistantText)) return false;
    return false;
  }
  if (status === 'CONTINUE') return true;

  const normalized = assistantText.toLowerCase().trim();

  // Boş cevap → devam et
  if (!normalized) return true;

  // Interim dil varsa devam
  if (containsInterimLanguage(normalized)) return true;

  return false;
}

function wantsUninterruptedExecution(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return normalized.includes('devam et')
    || normalized.includes('durma')
    || normalized.includes('bitene kadar')
    || normalized.includes('bitiresiye kadar')
    || normalized.includes('tamam devam et')
    || normalized.includes('sürekli devam');
}

function looksLikeFinalAnswer(text: string): boolean {
  // Sadece net bitiş ifadeleri final sayılır.
  // "tamamlandı", "sonuç" gibi kelimeler tek başına yeterli değil —
  // rapor sunarken de kullanılabilirler.
  const finalPatterns = [
    /\bgörev tamamlandı\b/,
    /\btask completed\b/,
    /\biş bitti\b/,
    /\ball done\b/,
    /\bsorun çözüldü\b/,
    /\bproblem solved\b/,
    /\btüm (adımlar|işlemler) (tamamlandı|bitti)\b/,
    /\bdone here\b/,
    /\bno further (action|changes) (needed|required)\b/,
  ];

  // Kod bloğu TEK BAŞINA final cevap sayılmaz — raporlamada kod olabilir.
  // Sadece metin ÇOK kısaysa ve kod bloğundan ibaretse final say.
  if (text.includes('```')) {
    const textWithoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
    if (textWithoutCode.length < 30) return true;
  }

  return finalPatterns.some((pattern) => pattern.test(text));
}


// ─── Tool yürütücü (ortak) ───────────────────────────────────────────────────
function pendingJobReminder(ids: string[]): string {
  return '[JOB STILL RUNNING] Required jobs are not verified complete: ' + ids.join(', ') +
    '. Call wait_job with wait_seconds=30 or 60 for each job. Do not claim completion or restart the command. If a supervisor was lost, investigate the original process before retrying.';
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  config: DehaConfig,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) return 'HATA: İşlem kullanıcı tarafından durduruldu';
  if (mcpManager.isMcpTool(name)) {
    try {
      return await mcpManager.callTool(name, input);
    } catch (err: unknown) {
      return `HATA: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const syncResult = executeTool(name, input);
  if (syncResult.startsWith('__ASYNC_TOOL__:')) {
    return await executeToolAsync(name, input, config, abortSignal);
  }
  return syncResult;
}
