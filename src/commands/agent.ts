import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message, OAIMessage, ToolCall, sendWithTools, sendWithToolsOpenAICompat } from '../services/ai-service';
import { DEHA_TOOLS, executeTool, executeToolAsync, printToolCall } from '../tools';
import { mcpManager } from '../mcp/manager';
import { getWorkDir } from '../services/session-memory';
import { logger } from '../services/logger';

/** WorkDir bilgisini config'e system prompt olarak enjekte et */
function injectWorkDir(config: DehaConfig): DehaConfig {
  const workDir = getWorkDir();
  const workDirNote = workDir
    ? `\n\n[PROJECT CONTEXT]\n- ACTIVE WORKING DIRECTORY: ${workDir}\n- CRITICAL RULE: You are currently working in this project. All file operations (read, write, list, search) and shell commands MUST be performed within this directory by default.\n- If the user explicitly asks for another absolute path or says "root dizini", "/root", "VPS root", or similar, use that requested path exactly. In that case, "/root" means the server root user's home directory, NOT the project root.\n- Do NOT look at C:\\Users\\BAHADIR or other parent directories unless the user explicitly asks for a different project/path.\n- FOCUS: Stay within the project context unless the user explicitly names another path. If you need to list files without a specific path, list ${workDir} first.`
    : '';
  return {
    ...config,
    systemPrompt: config.systemPrompt + workDirNote,
  };
}

export async function runAgent(
  userMessage: string,
  config: DehaConfig,
  history: Message[] = [],
  abortSignal?: AbortSignal,
): Promise<string> {
  const mcpTools = mcpManager.getAnthropicTools();
  const allTools = [...DEHA_TOOLS, ...mcpTools];

  if (mcpTools.length > 0) {
    logger.write(chalk.dim(`  [${mcpTools.length} MCP aracı aktif]\n`));
  }

  // WorkDir'i system prompt'a enjekte et
  const enrichedConfig = injectWorkDir(config);

  // Claude → native tool calling
  if (config.provider === 'claude') {
    return runAgentClaude(userMessage, enrichedConfig, history, allTools, abortSignal);
  }

  // OpenAI-uyumlu providerlar (DeepSeek, OpenAI, OpenRouter, xAI, custom)
  return runAgentOpenAI(userMessage, enrichedConfig, history, allTools, abortSignal);
}

const MAX_TOOL_ROUNDS = 200;
const MAX_AUTO_CONTINUE_ROUNDS = 6;
const MAX_POST_TOOL_COMPLETION_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 32_000;

// ─── Claude agent döngüsü ────────────────────────────────────────────────────

async function runAgentClaude(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<string> {
  const messages: Message[] = [...history, { role: 'user', content: userMessage }];
  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;

  while (round < maxRounds) {
    round++;
    let roundText = '';

    const { text, toolCalls } = await sendWithTools(messages, config, allTools, (chunk) => {
      roundText += chunk;
    }, abortSignal, forceToolUse ? 'required' : 'auto');
    const effectiveToolCalls = toolCalls.length > 0
      ? toolCalls
      : parseInlineXmlToolCalls(text, allTools);

    if (effectiveToolCalls.length === 0) {
      finalText = text;
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
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }
      if (text && !isSilentInterimOutput(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(roundText);
        logger.raw('\n');
      }
      break;
    }

    const toolResultBlocks: string[] = [];
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
      const result = await runTool(tc.name, tc.input, config);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const preview = compactedResult.length > 200 ? compactedResult.slice(0, 200) + '…' : compactedResult;
      logger.write(chalk.dim('    → ') + chalk.gray(preview));
      toolResultBlocks.push(`<tool_result name="${tc.name}" id="${tc.id}">\n${compactedResult}\n</tool_result>`);
      finalText = text;
    }

    messages.push({ role: 'assistant', content: text || '[tool calls]' });
    messages.push({
      role: 'user',
      content: toolResultBlocks.join('\n\n') + '\n\nBu sonuçları kullanarak devam et.',
    });
  }

  return finalText;
}

// ─── OpenAI-uyumlu agent döngüsü ────────────────────────────────────────────

async function runAgentOpenAI(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Geçmiş mesajları OpenAI formatına dönüştür
  const messages: OAIMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;

  while (round < maxRounds) {
    round++;
    let roundText = '';

    const { text, toolCalls, rawAssistantMsg, malformedToolCalls } = await sendWithToolsOpenAICompat(
      messages,
      config,
      allTools,
      (chunk) => {
        roundText += chunk;
      },
      abortSignal,
      forceToolUse ? 'required' : 'auto',
    );
    const inlineToolCalls = toolCalls.length > 0 ? [] : parseInlineXmlToolCalls(text, allTools);
    const effectiveToolCalls = toolCalls.length > 0 ? toolCalls : inlineToolCalls;
    const effectiveAssistantMsg = inlineToolCalls.length > 0
      ? withSyntheticOpenAIToolCalls(rawAssistantMsg, inlineToolCalls)
      : rawAssistantMsg;

    if (malformedToolCalls > 0 && effectiveToolCalls.length === 0) {
      forceToolUse = true;
      messages.push({
        role: 'user',
        content: MALFORMED_TOOL_CALL_PROMPT,
      });
      continue;
    }

    if (effectiveToolCalls.length === 0) {
      finalText = text;
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
        messages.push(effectiveAssistantMsg);
        messages.push({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }
      if (text && !isSilentInterimOutput(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(roundText);
        logger.raw('\n');
      }
      break;
    }

    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
    messages.push(effectiveAssistantMsg);
    hadToolActivity = true;
    postToolCompletionRounds = 0;
    autoContinueRounds = 0;
    forceToolUse = false;

    if (text && !isSilentInterimOutput(text)) {
      logger.write('\n' + chalk.bold.cyan('DEHA:'));
      logger.raw(roundText);
      logger.raw('\n');
    }

    // Tool'ları çalıştır ve sonuçları ekle
    for (const tc of effectiveToolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const preview = compactedResult.length > 200 ? compactedResult.slice(0, 200) + '…' : compactedResult;
      logger.write(chalk.dim('    → ') + chalk.gray(preview));

      // OpenAI tool result format
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: compactedResult,
      });

      finalText = text;
    }
  }

  return finalText;
}

function compactToolResultForModel(toolName: string, result: string): string {
  const maxChars = readPositiveInt(process.env.DEHA_MAX_TOOL_RESULT_CHARS, MAX_TOOL_RESULT_CHARS);
  if (!result || result.length <= maxChars) return result;

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.max(0, maxChars - headChars - 260);
  const omitted = result.length - headChars - tailChars;

  return [
    result.slice(0, headChars),
    '',
    `[DEHA TOOL OUTPUT TRUNCATED: ${toolName} sonucu ${result.length} karakterdi; ${omitted} karakter modele gönderilmedi. Daha spesifik path/pattern ile tekrar çağır.]`,
    '',
    tailChars > 0 ? result.slice(-tailChars) : '',
  ].join('\n');
}

function parseInlineXmlToolCalls(text: string, tools: typeof DEHA_TOOLS): ToolCall[] {
  if (!text || !text.includes('<')) return [];

  const toolNames = new Set(tools.map((tool) => tool.name));
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
      return JSON.parse(jsonCandidate);
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
  'Bu yanıt bir ara durum güncellemesi olarak algılandı.',
  'Kullanıcıdan yeni bir mesaj bekleme ve onay isteme.',
  'Az önce söylediğin inceleme, arama, okuma veya düzenleme adımını şimdi gerçekten uygula.',
  'Gerekliyse tool kullanarak devam et ve görev tamamlanana kadar ilerle.',
  'Sadece kendi başına çözülemeyen gerçek bir blokaj varsa dur.',
].join(' ');

const POST_TOOL_CONTINUE_PROMPT = [
  'Az önce tool sonuçları üretildi ama kullanıcıya dönük final yanıt henüz tamamlanmadı.',
  'Eğer kullanıcının istediği bilgi tool sonucunda geldiyse hemen nihai, somut cevabı yaz ve dur.',
  'Sadece kullanıcının isteğini cevaplamak için doğrudan gerekli olan bir sonraki tool çağrısını yap.',
  'Kapsamı genişletme, kod veya yapılandırma dosyalarını incelemeye geçme.',
  'Yeni kullanıcı mesajı bekleme.',
].join(' ');

const MALFORMED_TOOL_CALL_PROMPT = [
  'Önceki tool çağrısı eksik veya bozuk JSON ile kesildi.',
  'Aynı adımı yeniden dene ama sadece geçerli ve eksiksiz tool çağrıları üret.',
  'Büyük bir dosya yazıyorsan içeriği daha küçük parçalara böl veya daha kısa bir araç çağrısı kullan.',
  'Ara durum mesajı yazma.',
].join(' ');

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
  if (shouldAutoContinue(assistantText, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)) {
    return true;
  }

  if (!assistantText.trim()) {
    return aggressiveAutoContinue || autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS;
  }

  const normalized = assistantText.toLowerCase().trim();

  // Interim dil varsa model sadece niyet bildirmiştir; devam edip işi gerçekten yapsın.
  if (containsInterimLanguage(normalized)) return true;

  // Non-empty ve interim olmayan cevap final kabul edilir. Aksi halde basit cevaplar
  // "görev tamamlandı" demediği için gereksiz tool döngüsüne giriyor.
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

  const normalized = assistantText.toLowerCase().trim();

  // Boş cevap → devam et
  if (!normalized) return true;

  // Tool sonrası model "okuyorum/bakayım/test edeceğim" gibi ara durum yazdıysa
  // gerçekten sonraki tool adımına geçsin.
  if (containsInterimLanguage(normalized)) return true;

  // Tool sonrası non-empty ve interim olmayan her cevap finaldir. Böylece basit
  // "dosyayı oku" istekleri okuduktan sonra başka dosyalara sapmaz.
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

async function runTool(
  name: string,
  input: Record<string, unknown>,
  config: DehaConfig,
): Promise<string> {
  if (mcpManager.isMcpTool(name)) {
    try {
      return await mcpManager.callTool(name, input);
    } catch (err: unknown) {
      return `HATA: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const syncResult = executeTool(name, input);
  if (syncResult.startsWith('__ASYNC_TOOL__:')) {
    return await executeToolAsync(name, input, config);
  }
  return syncResult;
}
