import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message, sendMessage } from '../services/ai-service';
import { formatResponse } from './chat';
import { runAgent, summarizeOldToolResults } from './agent';
import { mcpManager } from '../mcp/manager';
import { handleMcpCommand } from '../mcp/commands';
import { checkForUpdates } from './update';
import { createConversationId, saveConversation } from '../conversations/manager';
import { handleHistoryCommand } from '../conversations/commands';
import { runCommand } from '../tools/terminal';
import { runPythonCode, detectPython } from '../tools/python';
import { runSmokeTests, buildQuickChecks, printSmokeReport } from '../tools/smoke';
import { takeScreenshot } from '../tools/browser';
import { screenshotAndAnalyze } from '../tools/vision';
import { modelSetup } from './model-setup';
import { getUsageSince, getUsageSnapshot, printSessionSummary, printStats } from '../services/usage-tracker';
// Tool router kaldırıldı — DEHA her zaman agent modunda çalışır (tool_choice: auto)
import {
  addMessage,
  closeMemory,
} from '../services/memory';
import {
  detectWorkDir,
  setWorkDir,
  appendMessage,
  buildContextMessages,
  buildStaticContextMessages,
  autoCompress,
  getContextStats,
  flushOnExit,
  hydrateSession,
  resetSession,
  addPinnedMessage,
  clearPinnedMessages,
  addArchitectureFile,
  clearArchitectureFiles,
} from '../services/session-memory';
import { getMaxContextTokens } from '../services/token-counter';
import { startServices, stopServices } from '../services/process-manager';
import { runSystemTest } from './test-runner';
import { DEHA_VERSION, DEHA_VERSION_LABEL } from '../version';
import { logger } from '../services/logger';

const BANNER = `
${chalk.bold.cyan('╭────────────────────────────────────────────────╮')}
${chalk.bold.cyan('│')}  ${chalk.bold.white('DEHA')} ${chalk.cyan('AI')} ${chalk.dim('— Professional Coding Assistant')}    ${chalk.bold.cyan('│')}
${chalk.bold.cyan('│')}  ${chalk.dim(`v${DEHA_VERSION}`)}  ${chalk.dim('•')}  ${chalk.dim('github.com/deha-cli')}              ${chalk.bold.cyan('│')}
${chalk.bold.cyan('╰────────────────────────────────────────────────╯')}
`;

const HELP_TEXT = `
${chalk.bold('Komutlar:')}
  ${chalk.cyan('/help')}                    Bu yardım mesajını göster
  ${chalk.cyan('/new')}                     Yeni sohbet başlat
  ${chalk.cyan('/clear')}                   Sohbet geçmişini temizle
  ${chalk.cyan('/model')}                   Model & provider ayarlarını düzenle (Chat/Planner/Coder/Judge/Vision)
  ${chalk.cyan('/thinking [on|off] [effort]')} DeepSeek thinking mode'u aç/kapat
  ${chalk.cyan('/agent <soru>')}            Araç çağırabilen ajan modu (Claude)
  ${chalk.cyan('/build <görev>')}           Planner/Coder/Judge build akışını çalıştır
  ${chalk.cyan('/file <yol>')}              Dosyayı bağlama ekle
  ${chalk.cyan('/architecture <yol>')}      Mimari dökümanı (Second Brain) context'e mıhlar
  ${chalk.cyan('/mcp <list|status|...>')}        MCP sunucu yönetimi
  ${chalk.cyan('/oldconversations [n|search]')}  Eski sohbetleri görüntüle
  ${chalk.cyan('/run <komut>')}                  Terminal komutu çalıştır
  ${chalk.cyan('/python <kod>')}                 Python kodu çalıştır
  ${chalk.cyan('/smoketest <url>')}              HTTP smoke testi yap
  ${chalk.cyan('/screenshot <url>')}             Ekran görüntüsü al
  ${chalk.cyan('/vision <url>')}                 Screenshot + AI analizi
  ${chalk.cyan('/plannerchat')}                 Planner rolü ile direkt konuşma modunu aç/kapat
  ${chalk.cyan('/judgechat')}                   Judge rolü ile direkt konuşma modunu aç/kapat
  ${chalk.cyan('/pin <metin>')}                Önemli bilgileri context'in en başına (Cache) sabitler
  ${chalk.cyan('/unpin')}                       Tüm sabitlenmiş bilgileri temizler
  ${chalk.cyan('/stats')}                        Token kullanımı ve maliyet istatistikleri
  ${chalk.cyan('/test')}                         API ve pipeline sistem testi
  ${chalk.cyan('/judge <dosya> <görev>')}   Sadece Judge rolünü çalıştırarak bir dosyayı değerlendir
  ${chalk.cyan('/exit')}                         Çıkış yap

${chalk.bold('@dosya.ts sözdizimi:')}
  Mesajın içine ${chalk.yellow('@./src/index.ts')} yazarak dosya içeriğini otomatik ekle.
`;

const COMMAND_SUGGESTIONS = [
  '/help', '/new', '/clear', '/model', '/thinking', '/agent', '/build', '/file', '/architecture',
  '/mcp', '/history', '/oldconversations', '/run', '/python', '/smoketest', '/screenshot',
  '/vision', '/plannerchat', '/judgechat', '/pin', '/unpin', '/stats', '/test', '/judge', '/exit',
];

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const PASTE_PLACEHOLDER_PATTERN = /\[Pasted Content (\d+) chars #(\d+)\]/g;

export async function interactive(
  config: DehaConfig,
  initialHistory: Message[] = [],
  initialConversationId?: string,
): Promise<void> {
  logger.write(BANNER);
  logger.write(
    chalk.dim('Provider: ') + chalk.green(getProviderLabel(config.provider)) +
    chalk.dim('  |  Model: ') + chalk.yellow(getActiveModel(config)) + '\n',
  );
  logger.write(chalk.dim('Çıkmak için /exit  •  Yardım için /help\n'));

  startServices().then(s => {
    const parts: string[] = [];
    if (s.redis !== 'unavailable') parts.push(`Redis ${s.redis === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (s.chromadb !== 'unavailable') parts.push(`ChromaDB ${s.chromadb === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (parts.length) process.stdout.write(chalk.dim('  ') + parts.join(chalk.dim('  ')) + '\n\n');
  }).catch(() => {});

  setWorkDir(process.cwd());
  mcpManager.connectAll(true).catch(() => {});
  checkForUpdates(true).catch(() => {});

  const pasteInput = createPasteInput();
  readline.emitKeypressEvents(pasteInput.stream);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdout.write('\x1b[?2004h');
  }
  process.stdin.pipe(pasteInput.stream);

  const rl = readline.createInterface({
    input: pasteInput.stream,
    output: process.stdout,
    terminal: true,
    completer: completeCommand,
  });

  const sessionUsageSnapshot = getUsageSnapshot();
  let activeAbortController: AbortController | null = null;
  let lastSuggestion = '';
  let activeRole: 'chat' | 'planner' | 'judge' = 'chat';
  
  const specializedHistories: Record<'planner' | 'judge', Message[]> = {
    planner: [],
    judge: [],
  };

  const isAIActive = () => activeAbortController !== null;

  const onGlobalKeypress = (_str: string, key: { name?: string; ctrl?: boolean } | undefined) => {
    if (key?.name === 'escape' && activeAbortController) {
      activeAbortController.abort();
      process.stdout.write(chalk.red('\n[İptal edildi - ESC]\n'));
      return;
    }

    if (!isAIActive()) {
      if ((key?.name === 'right' || (key?.name === 'e' && key?.ctrl)) && lastSuggestion && rl.cursor === rl.line.length) {
        const ghost = lastSuggestion.slice(rl.line.length);
        if (ghost) {
          rl.write(ghost);
          lastSuggestion = '';
          return;
        }
      }

      process.nextTick(() => {
        const suggestion = getInlineSuggestion(rl.line);
        if (suggestion !== lastSuggestion || true) {
          lastSuggestion = suggestion;
          process.stdout.write('\x1b[s'); // Save cursor
          process.stdout.write('\x1b[K'); // Clear from cursor to end
          if (suggestion && suggestion.startsWith(rl.line) && rl.line.length > 0) {
            const ghost = suggestion.slice(rl.line.length);
            process.stdout.write(chalk.dim(ghost));
          }
          process.stdout.write('\x1b[u'); // Restore cursor
        }
      });
    }
  };
  pasteInput.stream.on('keypress', onGlobalKeypress);

  const history: Message[] = [...initialHistory];
  let conversationId: string | null = initialConversationId ?? null;
  if (initialHistory.length > 0) {
    await hydrateSession(initialHistory, { workDir: process.cwd(), preserveSummary: true }).catch(() => {});
    logger.write(chalk.dim(`  ↩ ${initialHistory.length} mesaj yüklendi\n`));
  } else {
    conversationId = createConversationId();
    await resetSession(process.cwd()).catch(() => {});
  }

  // DEHA_SECOND_BRAIN_PATH env varı tanımlıysa otomatik yükle
  const secondBrainPath = process.env.DEHA_SECOND_BRAIN_PATH;
  if (secondBrainPath && fs.existsSync(secondBrainPath)) {
    addArchitectureFile(secondBrainPath);
    logger.write(chalk.dim(`  🧠 Second Brain: ${secondBrainPath}\n`));
  }

  const prompt = async () => {
    const input = await new Promise<string>((resolve) => {
      let buffer = '';
      const roleLabels: Record<string, string> = {
        chat:    chalk.bold.cyan('DEHA ❯ '),
        planner: chalk.bold.magenta('PLANNER ❯ '),
        judge:   chalk.bold.yellow('JUDGE ❯ '),
      };
      rl.setPrompt(roleLabels[activeRole] || roleLabels.chat);
      rl.prompt();
      lastSuggestion = getInlineSuggestion(rl.line);
      const onLine = (line: string) => {
        if (line.endsWith('\\')) {
          buffer += (buffer ? '\n' : '') + line.slice(0, -1);
          rl.setPrompt('... ');
          rl.prompt();
          return;
        }
        buffer += (buffer ? '\n' : '') + line;
        rl.removeListener('line', onLine);
        resolve(buffer);
      };
      rl.on('line', onLine);
    });

    const modelInput = pasteInput.expand(input);
    const trimmed = input.trim();
    const modelTrimmed = modelInput.trim();
    if (!trimmed) { prompt(); return; }

      if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
        await exitCleanup(history, config, conversationId, sessionUsageSnapshot);
        rl.close(); process.exit(0);
      }

      if (trimmed === '/help') { logger.write(HELP_TEXT); prompt(); return; }

      if (trimmed === '/new') {
        if (history.length >= 2) saveConversation(history, config.provider, getActiveModel(config), { conversationId: conversationId ?? undefined });
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        setWorkDir(process.cwd());
        logger.write(chalk.green('✓ Yeni sohbet başlatıldı. ID: ') + chalk.cyan(conversationId) + '\n');
        prompt(); return;
      }

      if (trimmed === '/clear') {
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        console.clear();
        logger.write(BANNER);
        logger.write(chalk.green('✓ Sohbet geçmişi temizlendi.\n'));
        prompt(); return;
      }

      if (trimmed === '/stats') { printStats(); prompt(); return; }
      if (trimmed === '/version' || isVersionQuestion(trimmed)) { logger.write(chalk.cyan(`${DEHA_VERSION_LABEL}\n`)); prompt(); return; }

      if (trimmed === '/model') {
        rl.pause();
        try { await modelSetup(config); } catch (err: any) { if (err.name !== 'ExitPromptError') logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err))); }
        rl.resume(); prompt(); return;
      }

      if (trimmed.startsWith('/thinking')) {
        const parts = trimmed.split(/\s+/).slice(1);
        if (parts.length === 0) { logger.write(chalk.cyan('Thinking: ') + chalk.yellow(config.deepseekThinking) + '\n'); prompt(); return; }
        const state = normalizeThinkingState(parts[0]);
        if (!state) { logger.write(chalk.yellow('ℹ /thinking <on|off>\n')); prompt(); return; }
        config.deepseekThinking = state;
        if (state === 'enabled' && parts[1]) config.deepseekReasoningEffort = normalizeThinkingEffort(parts[1]);
        logger.write(chalk.green('✓ Güncellendi.\n'));
        prompt(); return;
      }

      if (trimmed.startsWith('/build ')) {
        const task = modelTrimmed.slice(7).trim();
        if (!task) { logger.write(chalk.yellow('ℹ /build <görev>\n')); prompt(); return; }
        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          const { runPipeline } = await import('../pipeline/orchestrator');
          // Sadece son 5 mesajı ve mıhlanmış context'i gönder
          const contextHistory = buildContextMessages(undefined, { minHotMessages: 20 });
          const summarizedHistory = summarizeOldToolResults(contextHistory, 10);
          const pipelineResult = await runPipeline(task, config, summarizedHistory, abortController.signal);
          // Pipeline sonucunu history'ye ekle — böylece "/build bitti, ne yaptın?" sorusu cevaplanabilir
          const userBuildMsg: Message = { role: 'user', content: `/build ${task}` };
          const lines: string[] = [
            `Build pipeline tamamlandı.`,
            `Görev: ${task}`,
            `Sonuç: ${pipelineResult.verdict.pass ? 'PASS ✓' : 'FAIL ✗'} — Skor: ${pipelineResult.verdict.score} — İterasyon: ${pipelineResult.iterations}`,
          ];
          if (pipelineResult.verdict.feedback) {
            lines.push(`Judge özeti: ${pipelineResult.verdict.feedback.slice(0, 600)}`);
          }
          const assistantBuildMsg: Message = { role: 'assistant', content: lines.join('\n') };
          history.push(userBuildMsg, assistantBuildMsg);
          await appendMessage(userBuildMsg);
          await appendMessage(assistantBuildMsg);
        } catch (err: unknown) {
          if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Pipeline hatası: ') + (err instanceof Error ? err.message : String(err)) + '\n');
        } finally { activeAbortController = null; }
        prompt(); return;
      }

      if (trimmed.startsWith('/judge ')) {
        const parts = modelTrimmed.slice(7).trim().split(/\s+/);
        const filePath = parts[0];
        const task = parts.slice(1).join(' ').trim();
        if (!filePath || !task) { logger.write(chalk.yellow('ℹ /judge <dosya> <görev>\n')); prompt(); return; }
        if (!fs.existsSync(filePath)) { logger.write(chalk.red(`✗ Dosya yok: ${filePath}\n`)); prompt(); return; }
        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          const code = fs.readFileSync(filePath, 'utf-8');
          const { runJudge } = await import('../pipeline/judge');
          const verdict = await runJudge(task, 'Manuel', code, config, (chunk) => process.stdout.write(chalk.yellow(chunk)), abortController.signal);
          logger.write('\n' + chalk.bold('─'.repeat(40)) + (verdict.pass ? chalk.bgGreen.black(' PASS ') : chalk.bgRed.white(' FAIL ')) + '\n');
        } catch (err: unknown) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + (err instanceof Error ? err.message : String(err)) + '\n'); }
        finally { activeAbortController = null; }
        prompt(); return;
      }

      if (trimmed === '/plannerchat') { activeRole = activeRole === 'planner' ? 'chat' : 'planner'; logger.write(chalk.magenta(`\n● Planner moduna ${activeRole === 'planner' ? 'girildi' : 'çıkıldı'}.\n`)); prompt(); return; }
      if (trimmed === '/judgechat') { activeRole = activeRole === 'judge' ? 'chat' : 'judge'; logger.write(chalk.yellow(`\n● Judge moduna ${activeRole === 'judge' ? 'girildi' : 'çıkıldı'}.\n`)); prompt(); return; }

      if (trimmed.startsWith('/architecture ')) {
        const filePath = trimmed.slice(14).trim();
        if (!fs.existsSync(filePath)) { logger.write(chalk.red(`✗ Dosya bulunamadı: ${filePath}\n`)); prompt(); return; }
        addArchitectureFile(filePath);
        logger.write(chalk.green(`✓ Mimari dosya (Second Brain) mıhlandı.\n`));
        prompt(); return;
      }

      if (trimmed.startsWith('/pin ')) {
        const text = modelTrimmed.slice(5).trim();
        if (text) { addPinnedMessage(text); logger.write(chalk.green('✓ Sabitlendi.\n')); }
        prompt(); return;
      }

      if (trimmed === '/unpin') { clearPinnedMessages(); logger.write(chalk.yellow('✓ Pinler temizlendi.\n')); prompt(); return; }

      if (trimmed.startsWith('/file ')) {
        const filePath = trimmed.slice(6).trim();
        const injected = injectFile(filePath);
        if (injected) {
          const msg: Message = { role: 'user', content: injected };
          history.push(msg); history.push({ role: 'assistant', content: `Okudum: ${filePath}` });
          await appendMessage(msg);
        }
        prompt(); return;
      }

      if (trimmed.startsWith('/mcp')) { await handleMcpCommand(trimmed.slice(4).trim()); prompt(); return; }

      if (trimmed.startsWith('/oldconversations') || trimmed.startsWith('/history')) {
        const selection = await handleHistoryCommand(trimmed.replace(/^\/oldconversations\s*|^\/history\s*/, ''));
        if (selection) {
          history.length = 0; history.push(...selection.messages);
          conversationId = selection.id; await hydrateSession(selection.messages, { workDir: process.cwd() }).catch(() => {});
        }
        prompt(); return;
      }

      if (trimmed.startsWith('/run ')) {
        const cmd = modelTrimmed.slice(5).trim();
        const abortController = new AbortController();
        activeAbortController = abortController;
        try { const r = await runCommand(cmd, { stream: true, shell: true, timeout: 60_000 }); }
        catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ ') + err.message + '\n'); }
        finally { activeAbortController = null; }
        prompt(); return;
      }

      const userMessage = resolveAtFiles(modelTrimmed);
      const detectedDir = detectWorkDir(userMessage);
      if (detectedDir) { setWorkDir(detectedDir); logger.write(chalk.dim(`  📁 Dir: ${detectedDir}\n`)); }

      // ── Specialized Roles (Planner/Judge) ──
      if (activeRole !== 'chat') {
        const roleConfig = activeRole === 'planner' ? config.pipeline.planner : config.pipeline.judge;
        const roleHistory = specializedHistories[activeRole];
        const { PLANNER_PROMPT, JUDGE_PROMPT } = await import('../prompts.config');
        const specializedSystemPrompt = activeRole === 'planner' ? PLANNER_PROMPT : JUDGE_PROMPT;
        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          process.stdout.write('\n' + chalk.bold[activeRole === 'planner' ? 'magenta' : 'yellow'](`${activeRole.toUpperCase()}: `));
          const staticContext = buildStaticContextMessages();
          const { runAgent } = await import('./agent');
          const agentResult = await runAgent(userMessage, { ...config, ...roleConfig }, [...staticContext, ...summarizeOldToolResults(roleHistory, 10)], abortController.signal, specializedSystemPrompt);
          roleHistory.push(...agentResult.messages);
          logger.write(chalk.dim('─'.repeat(50)) + '\n');
        } catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + err.message + '\n'); }
        finally { activeAbortController = null; }
        prompt(); return;
      }

      // ── Main Chat / Agent ──
      // DEHA her zaman agent modunda çalışır. Model tool_choice:'auto' ile
      // kendisi karar verir: tool gerekiyorsa çağırır, gerekmiyorsa direkt cevap verir.
      // Böylece "bakayım" deyip hiçbir şey yapmama sorunu ortadan kalkar.
      const abortController = new AbortController();
      activeAbortController = abortController;
      try {
        const maxCtxTokens = config.maxContextTokens > 0 ? config.maxContextTokens : getMaxContextTokens(config.provider, getActiveModel(config));
        const contextBudget = getContextBudgetTokens(config, maxCtxTokens);
        const minHotMessages = Math.max(config.minHotMessages, 20);



        const contextHistory = buildContextMessages(undefined, { maxTokens: contextBudget, minHotMessages });
        const summarizedHistory = summarizeOldToolResults(contextHistory, 25);

        const agentResult = await runAgent(userMessage, config, summarizedHistory, abortController.signal);
        history.push(...agentResult.messages);
        for (const msg of agentResult.messages) { await appendMessage(msg); addMessage(msg).catch(() => {}); }

        saveConversation(history, config.provider, getActiveModel(config), { conversationId: conversationId ?? undefined });
        const compressed = await autoCompress((msgs) => summarizeForCompression(msgs, config, maxCtxTokens), maxCtxTokens, config.compressThreshold, minHotMessages);
        if (compressed) logger.write(chalk.dim('  📦 Context compressed\n'));
        logger.write(chalk.dim('─'.repeat(50)) + '\n');
      } catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + err.message + '\n'); }
      finally { activeAbortController = null; }
      prompt();
  };

  rl.on('SIGINT', async () => { if (activeAbortController) activeAbortController.abort(); else { await exitCleanup(history, config, conversationId, sessionUsageSnapshot); process.exit(0); } });
  process.once('SIGTERM', async () => { await flushOnExit().catch(() => {}); await closeMemory().catch(() => {}); process.exit(0); });
  rl.on('close', () => { pasteInput.stream.removeListener('keypress', onGlobalKeypress); process.stdin.unpipe(pasteInput.stream); pasteInput.cleanup(); if (process.stdin.isTTY) { process.stdout.write('\x1b[?2004l'); process.stdin.setRawMode(false); } });
  prompt();
}

async function exitCleanup(history: Message[], config: DehaConfig, conversationId?: string | null, sessionUsageSnapshot = 0): Promise<void> {
  await flushOnExit().catch(() => {}); await closeMemory().catch(() => {}); stopServices();
  let sessionId: string | null = null;
  if (history.length >= 1) { 
    const filePath = saveConversation(history, config.provider, getActiveModel(config), { conversationId: conversationId ?? undefined }); 
    if (filePath) sessionId = path.basename(filePath, '.md'); 
  } else {
    try {
      const { listConversations } = await import('../conversations/manager');
      const latest = listConversations(1);
      if (latest && latest.length > 0) sessionId = latest[0].id;
    } catch { }
  }
  await mcpManager.disconnectAll().catch(() => {});
  printSessionSummary(getUsageSince(sessionUsageSnapshot));
  logger.write(chalk.dim('Görüşürüz! 👋\n'));
  if (sessionId) logger.write(chalk.dim('Önceki sohbete dönmek için: ') + chalk.cyan(`deha resume ${sessionId}\n`));
}

function getContextBudgetTokens(config: DehaConfig, maxContextTokens: number): number {
  const outputReserve = 8_192; const safetyReserve = 8_192;
  const hardCap = safePositiveInt(process.env.DEHA_CONTEXT_BUDGET_TOKENS, 80_000);
  return Math.max(8_000, Math.min(hardCap, maxContextTokens - outputReserve - safetyReserve));
}

async function summarizeForCompression(msgs: Message[], config: DehaConfig, maxCtxTokens: number): Promise<string> {
  const stats = getContextStats(maxCtxTokens);
  const lastFive = msgs.slice(-5);
  const olderMsgs = msgs.slice(0, -5);

  // Tool mesajlarını akıllıca özetle — sadece ilk 300 char
  const formatMsg = (m: Message, maxLen: number) => {
    const content = (m.content || '').slice(0, maxLen);
    if (m.role === 'tool') return `[tool]: ${content.slice(0, 200)}`;
    return `[${m.role}]: ${content}`;
  };

  const summaryPrompt = [
    'Aşağıdaki sohbet geçmişini kısa ve yoğun bir MÜHENDİSLİK ÖZETİNE dönüştür.',
    '',
    'MUTLAKA KORU:',
    '- Dosya yolları ve satır numaraları (ör: /root/api/routes/article.ts:45)',
    '- Değiştirilen/okunan fonksiyon ve değişken adları',
    '- Hata mesajları ve error kodları',
    '- Kullanıcının açık istekleri ve şikayetleri',
    '- Hangi tool çağrıldı ve ne sonuç döndü (kısa)',
    '',
    'ATLA: Selamlaşmalar, tekrarlı "anladım" mesajları, uzun kod blokları',
    '',
    `WorkDir: ${stats.workDir}`,
    '',
    '--- ESKİ MESAJLAR ---',
    ...olderMsgs.map(m => formatMsg(m, 800)),
    '',
    '--- SON 5 MESAJ (ÖNEMLİ) ---',
    ...lastFive.map(m => formatMsg(m, 1500)),
  ].join('\n');
  return sendMessage([{ role: 'user', content: summaryPrompt }], config);
}

function safePositiveInt(value: string | undefined, fallback: number): number { const parsed = Number.parseInt(value ?? '', 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function containsPastedPlaceholder(input: string): boolean { PASTE_PLACEHOLDER_PATTERN.lastIndex = 0; return PASTE_PLACEHOLDER_PATTERN.test(input); }

function createPasteInput(): { stream: Transform; expand: (line: string) => string; cleanup: () => void; } {
  const pasted = new Map<string, string>(); let nextId = 1; let buffer = ''; let collectingPaste = false;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      buffer += chunk.toString('utf8'); let output = '';
      while (buffer.length > 0) {
        if (!collectingPaste) {
          const start = buffer.indexOf(PASTE_START);
          if (start < 0) { const keep = pasteStartSuffixLength(buffer); if (buffer.length <= keep) break; output += buffer.slice(0, buffer.length - keep); buffer = buffer.slice(buffer.length - keep); break; }
          output += buffer.slice(0, start); buffer = buffer.slice(start + PASTE_START.length); collectingPaste = true;
        }
        const end = buffer.indexOf(PASTE_END); if (end < 0) break;
        const content = buffer.slice(0, end); const id = String(nextId++); pasted.set(id, content);
        const hasNewline = content.includes('\n') || content.includes('\r');
        output += (content.length <= 150 && !hasNewline) ? content : `[Pasted Content ${content.length} chars #${id}]`;
        buffer = buffer.slice(end + PASTE_END.length); collectingPaste = false;
      }
      if (output) this.push(output); callback();
    },
    flush(callback) { if (buffer) { this.push(buffer); buffer = ''; } callback(); },
  });
  return { stream, expand: (line: string) => line.replace(PASTE_PLACEHOLDER_PATTERN, (_match, _chars, id) => pasted.get(id) ?? _match), cleanup: () => pasted.clear(), };
}

function pasteStartSuffixLength(value: string): number { const max = Math.min(value.length, PASTE_START.length - 1); for (let len = max; len > 0; len--) { if (PASTE_START.startsWith(value.slice(-len))) return len; } return 0; }

function getActiveModel(config: DehaConfig): string {
  switch (config.provider) {
    case 'claude': return config.claudeModel;
    case 'openai': return config.openaiModel;
    case 'deepseek': return config.deepseekModel;
    case 'ollama': return config.ollamaModel;
    case 'openrouter': return config.openrouterModel;
    case 'xai': return config.xaiModel;
    default: return config.provider;
  }
}

function injectFile(filePath: string): string | null {
  try {
    const resolved = path.resolve(filePath); const content = fs.readFileSync(resolved, 'utf-8'); const ext = path.extname(filePath).slice(1) || 'text';
    return `FILE CONTENT: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\``;
  } catch { logger.error(chalk.red(`✗ Dosya okunamadı: ${filePath}\n`)); return null; }
}

function resolveAtFiles(message: string): string {
  return message.replace(/@([\S]+)/g, (_match, filePath) => {
    try {
      const resolved = path.resolve(filePath); const content = fs.readFileSync(resolved, 'utf-8'); const ext = path.extname(filePath).slice(1) || 'text';
      return `\n\`\`\`${ext}\n// ${resolved}\n${content}\n\`\`\`\n`;
    } catch { return _match; }
  });
}

function isVersionQuestion(message: string): boolean { const msg = message.trim().toLowerCase(); return msg === 'versiyon' || msg === 'version' || msg === 'sürüm'; }
function normalizeThinkingState(value: string): 'enabled' | 'disabled' | null { const v = value.toLowerCase(); if (['on', 'enable', 'enabled'].includes(v)) return 'enabled'; if (['off', 'disable', 'disabled'].includes(v)) return 'disabled'; return null; }
function normalizeThinkingEffort(value: string): 'high' | 'max' { return value.toLowerCase() === 'max' ? 'max' : 'high'; }

function completeCommand(line: string): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  const hits = COMMAND_SUGGESTIONS.filter((cmd) => cmd.startsWith(line));
  return [hits.length ? hits : COMMAND_SUGGESTIONS, line];
}

function getInlineSuggestion(line: string): string {
  if (!line.startsWith('/') || COMMAND_SUGGESTIONS.includes(line)) return '';
  return COMMAND_SUGGESTIONS.find((cmd) => cmd.startsWith(line)) ?? '';
}
