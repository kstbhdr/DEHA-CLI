import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message, sendMessage } from '../services/ai-service';
import { safeSlice } from '../services/text-utils';
import { formatResponse } from './chat';
import { runAgent, summarizeOldToolResults, resolveTaskForUserMessage } from './agent';
import { isSectionedContextEnabled } from '../services/sectioned-context';
import { initializeInteractiveSession } from '../services/interactive-session';
import { InputQueue } from '../services/input-queue';
import { handleJobsCommand } from './jobs';
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
import { modelSetup, pipelineSetup } from './model-setup';
import { parsePipelineInput } from '../pipeline/options';
import { configForRole } from '../pipeline/role-config';
import { CODER_TOOL_NAMES } from '../pipeline/coder';
import { getUsageSince, getUsageSnapshot, printSessionSummary, printStats } from '../services/usage-tracker';
// Tool router kaldırıldı — DEHA her zaman agent modunda çalışır (tool_choice: auto)
import {
  addMessage,
  closeMemory,
} from '../services/memory';
import {
  detectWorkDir,
  setWorkDir,
  getWorkDir,
  setConversationId,
  appendMessage,
  buildContextMessages,
  buildStaticContextMessages,
  autoCompress,
  archiveOldMessages,
  getContextStats,
  getSessionStats,
  loadSession,
  getSessionMessages,
  getPendingInputs,
  setPendingInputs,
  getActiveTask,
  clearActiveTask,
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
  ${chalk.cyan('/model')}                   Model & provider ayarlarını düzenle (Chat/Planner/Coder/Judge/Vision/Image)
  ${chalk.cyan('/thinking [on|off] [effort]')} DeepSeek thinking mode'u aç/kapat
  ${chalk.cyan('/security [on|off]')}      run_shell'in proje-dışı dizin kısıtlamasını (sandbox) aç/kapat
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
  ${chalk.cyan('/queue [run|clear|remove <n>]')}     Bekleyen mesajları göster / düzenle
  ${chalk.cyan('/jobs [wait|cancel <id>]')}       Arka plan işlerini göster / yönet
  ${chalk.cyan('/exit')}                         Çıkış yap

${chalk.bold('@dosya.ts sözdizimi:')}
  Mesajın içine ${chalk.yellow('@./src/index.ts')} yazarak dosya içeriğini otomatik ekle.
`;

const COMMAND_SUGGESTIONS = [
  '/config', '/plan', '/code', '/task', '/coderchat',
  '/help', '/new', '/clear', '/model', '/thinking', '/security', '/agent', '/build', '/file', '/architecture',
  '/mcp', '/history', '/oldconversations', '/run', '/python', '/smoketest', '/screenshot',
  '/jobs', '/queue', '/vision', '/plannerchat', '/judgechat', '/pin', '/unpin', '/stats', '/test', '/judge', '/exit',
];

const PIPELINE_HELP = '\n/config: rol modelleri, aşamalar, token bütçeleri\n/plan <görev>: yalnız planı hazırla ve kaydet\n/code [görev]: yalnız Coder; görev yoksa kayıtlı plan\n/task: planı göster (API yok)\n/coderchat: Coder modeli ile araçlı kodlama\n/build --no-judge <görev>: bu görevde Judge kapalı\n';

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
  logger.write(chalk.dim('Çalışırken gönderdiğin mesajlar sıraya alınır  •  Sırayı görmek için /queue\n'));

  startServices().then(s => {
    const parts: string[] = [];
    if (s.redis !== 'unavailable') parts.push(`Redis ${s.redis === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (s.chromadb !== 'unavailable') parts.push(`ChromaDB ${s.chromadb === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (parts.length) process.stdout.write(chalk.dim('  ') + parts.join(chalk.dim('  ')) + '\n\n');
  }).catch(() => {});

  if (process.env.DEHA_MCP_AUTOCONNECT !== '0') mcpManager.connectAll(true).catch(() => {});
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
  let activeRole: 'chat' | 'planner' | 'coder' | 'judge' = 'chat';
  // /model gibi inquirer tabanlı modal sihirbazlar açıkken true. rl.pause()
  // tek başına yeterli değil: inquirer kendi raw-mode okuyucusunu stdin
  // üzerine kurunca, pasteInput.stream'e akan pipe hâlâ 'line' olaylarını
  // tetikleyebiliyor — sihirbaza yazılan model adı/API key gibi cevaplar bu
  // yüzden ana kuyruğa gerçek bir sohbet mesajı gibi ekleniyordu (ve API'ye
  // "mesaj" olarak gönderiliyordu). Bu bayrak o sızıntıyı kapatır.
  let modalActive = false;
  
  const specializedHistories: Record<'planner' | 'coder' | 'judge', Message[]> = {
    planner: [],
    judge: [],
    coder: [],
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

  const restored = await initializeInteractiveSession(process.cwd(), initialHistory, initialConversationId);
  const history: Message[] = [...restored.messages];
  let conversationId: string | null = restored.conversationId;
  if (history.length) logger.write(chalk.dim(`  ↩ ${history.length} mesaj ve kayıtlı görev bağlamı yüklendi\n`));

  // DEHA_SECOND_BRAIN_PATH env varı tanımlıysa otomatik yükle
  const secondBrainPath = process.env.DEHA_SECOND_BRAIN_PATH;
  if (secondBrainPath && fs.existsSync(secondBrainPath)) {
    addArchitectureFile(secondBrainPath);
    logger.write(chalk.dim(`  🧠 Second Brain: ${secondBrainPath}\n`));
  }

  let closed = false;
  const prompt = () => {
    if (closed) return;
    const labels = { chat: 'DEHA', planner: 'PLANNER', coder: 'CODER', judge: 'JUDGE' };
    rl.setPrompt(queue.running ? chalk.yellow('SIRAYA ❯ ') : chalk.bold.cyan(`${labels[activeRole]} ❯ `));
    rl.prompt(true);
    lastSuggestion = getInlineSuggestion(rl.line);
  };

  const processInput = async (input: string) => {
    const modelInput = input;
    const trimmed = input.trim();
    const modelTrimmed = modelInput.trim();
    if (!trimmed) { return; }

      if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
        await exitCleanup(history, config, conversationId, sessionUsageSnapshot);
        rl.close(); process.exit(0);
      }

      if (trimmed === '/help') { logger.write(HELP_TEXT + PIPELINE_HELP); return; }

      if (trimmed === '/new') {
        if (history.length >= 2) saveConversation(history, config.provider, getActiveModel(config), { conversationId: conversationId ?? undefined });
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        setConversationId(conversationId);
        clearActiveTask();
        setWorkDir(process.cwd());
        logger.write(chalk.green('✓ Yeni sohbet başlatıldı. ID: ') + chalk.cyan(conversationId) + '\n');
        return;
      }

      if (trimmed === '/clear') {
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        setConversationId(conversationId);
        clearActiveTask();
        console.clear();
        logger.write(BANNER);
        logger.write(chalk.green('✓ Sohbet geçmişi temizlendi.\n'));
        return;
      }

      if (trimmed === '/stats') { printStats(); return; }
      if (trimmed === '/version' || isVersionQuestion(trimmed)) { logger.write(chalk.cyan(`${DEHA_VERSION_LABEL}\n`)); return; }

      if (trimmed === '/model' || trimmed === '/config') {
        modalActive = true;
        rl.pause();
        try { if (trimmed === '/config') await pipelineSetup(config); else await modelSetup(config); } catch (err: any) { if (err.name !== 'ExitPromptError') logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err))); }
        finally { rl.resume(); modalActive = false; }
        return;
      }

      if (trimmed.startsWith('/thinking')) {
        const parts = trimmed.split(/\s+/).slice(1);
        if (parts.length === 0) { logger.write(chalk.cyan('Thinking: ') + chalk.yellow(config.deepseekThinking) + '\n'); return; }
        const state = normalizeThinkingState(parts[0]);
        if (!state) { logger.write(chalk.yellow('ℹ /thinking <on|off>\n')); return; }
        config.deepseekThinking = state;
        if (state === 'enabled' && parts[1]) config.deepseekReasoningEffort = normalizeThinkingEffort(parts[1]);
        logger.write(chalk.green('✓ Güncellendi.\n'));
        return;
      }

      if (trimmed.startsWith('/security')) {
        const parts = trimmed.split(/\s+/).slice(1);
        const isOn = process.env.DEHA_SANDBOX_CWD !== '0';
        if (parts.length === 0) {
          logger.write(chalk.cyan('Sandbox (run_shell cwd proje-dışı kısıtlaması): ') + (isOn ? chalk.green('ON') : chalk.red('OFF')) + '\n');
          return;
        }
        const arg = parts[0].toLowerCase();
        if (arg === 'on') { delete process.env.DEHA_SANDBOX_CWD; logger.write(chalk.green('✓ Sandbox AÇIK — run_shell cwd proje köküyle sınırlı.\n')); return; }
        if (arg === 'off') { process.env.DEHA_SANDBOX_CWD = '0'; logger.write(chalk.yellow('⚠ Sandbox KAPALI — run_shell cwd proje dışına çıkabilir.\n')); return; }
        logger.write(chalk.yellow('ℹ /security [on|off]\n'));
        return;
      }

      if (trimmed === '/task') {
        try { const { loadLatestPlan, planPath } = await import('../pipeline/task-plan'); logger.write(fs.readFileSync(planPath(loadLatestPlan(getWorkDir() || process.cwd())), 'utf8')); }
        catch { logger.write(chalk.yellow('Kayıtlı plan yok. Önce /plan <görev> kullan.')); }
        return;
      }
      const pipelineCommand = /^\/(build|plan|code)(?:\s|$)/.exec(trimmed);
      if (pipelineCommand) {
        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          const command = pipelineCommand[1];
          const parsed = parsePipelineInput(modelTrimmed.slice(command.length + 1));
          const task = parsed.task;
          if (!task && command !== 'code') { logger.write(chalk.yellow(`ℹ /${command} <görev>\n`)); return; }
          const options = { ...parsed.options, ...(command === 'plan' ? { planOnly: true } : {}), ...(command === 'code' ? { planner: false, judge: parsed.options.judge ?? false, useSavedPlan: !task } : {}) };
          const { runPipeline } = await import('../pipeline/orchestrator');
          // Sadece son 5 mesajı ve mıhlanmış context'i gönder
          const contextHistory = buildContextMessages(undefined, { minHotMessages: 20 });
          const summarizedHistory = summarizeOldToolResults(contextHistory, 10);
          const pipelineResult = await runPipeline(task, config, summarizedHistory, abortController.signal, options);
          // Pipeline sonucunu history'ye ekle — böylece "/build bitti, ne yaptın?" sorusu cevaplanabilir
          const userBuildMsg: Message = { role: 'user', content: modelTrimmed };
          const lines: string[] = [
            `Pipeline: ${pipelineResult.status}.`,
            `Görev: ${task}`,
            `Sonuç: ${pipelineResult.success ? 'başarılı' : 'tamamlanmadı'} — Judge: ${pipelineResult.judgeRan ? pipelineResult.verdict.pass ? 'PASS' : 'FAIL' : 'çalıştırılmadı'} — İterasyon: ${pipelineResult.iterations}`,
            `Plan: ${pipelineResult.taskFile}`,
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
        return;
      }

      if (trimmed.startsWith('/judge ')) {
        const parts = modelTrimmed.slice(7).trim().split(/\s+/);
        const filePath = parts[0];
        const task = parts.slice(1).join(' ').trim();
        if (!filePath || !task) { logger.write(chalk.yellow('ℹ /judge <dosya> <görev>\n')); return; }
        if (!fs.existsSync(filePath)) { logger.write(chalk.red(`✗ Dosya yok: ${filePath}\n`)); return; }
        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          const code = fs.readFileSync(filePath, 'utf-8');
          const { runJudge } = await import('../pipeline/judge');
          const verdict = await runJudge(task, 'Manuel', code, config, (chunk) => process.stdout.write(chalk.yellow(chunk)), abortController.signal);
          logger.write('\n' + chalk.bold('─'.repeat(40)) + (verdict.pass ? chalk.bgGreen.black(' PASS ') : chalk.bgRed.white(' FAIL ')) + '\n');
        } catch (err: unknown) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + (err instanceof Error ? err.message : String(err)) + '\n'); }
        finally { activeAbortController = null; }
        return;
      }

      if (trimmed === '/plannerchat') { activeRole = activeRole === 'planner' ? 'chat' : 'planner'; logger.write(chalk.magenta(`\n● Planner moduna ${activeRole === 'planner' ? 'girildi' : 'çıkıldı'}.\n`)); return; }
      if (trimmed === '/judgechat') { activeRole = activeRole === 'judge' ? 'chat' : 'judge'; logger.write(chalk.yellow(`\n● Judge moduna ${activeRole === 'judge' ? 'girildi' : 'çıkıldı'}.\n`)); return; }
      if (trimmed === '/coderchat') { activeRole = activeRole === 'coder' ? 'chat' : 'coder'; logger.write(chalk.blue(`\nCoder: ${activeRole === 'coder' ? config.pipeline.coder.model : 'normal chat'}\n`)); return; }

      if (trimmed.startsWith('/architecture ')) {
        const filePath = trimmed.slice(14).trim();
        if (!fs.existsSync(filePath)) { logger.write(chalk.red(`✗ Dosya bulunamadı: ${filePath}\n`)); return; }
        addArchitectureFile(filePath);
        logger.write(chalk.green(`✓ Mimari dosya (Second Brain) mıhlandı.\n`));
        return;
      }

      if (trimmed.startsWith('/pin ')) {
        const text = modelTrimmed.slice(5).trim();
        if (text) { addPinnedMessage(text); logger.write(chalk.green('✓ Sabitlendi.\n')); }
        return;
      }

      if (trimmed === '/unpin') { clearPinnedMessages(); logger.write(chalk.yellow('✓ Pinler temizlendi.\n')); return; }

      if (trimmed.startsWith('/file ')) {
        const filePath = trimmed.slice(6).trim();
        const injected = injectFile(filePath);
        if (injected) {
          const msg: Message = { role: 'user', content: injected };
          history.push(msg); history.push({ role: 'assistant', content: `Okudum: ${filePath}` });
          await appendMessage(msg);
        }
        return;
      }

      if (trimmed.startsWith('/mcp')) { await handleMcpCommand(trimmed.slice(4).trim()); return; }

      if (trimmed.startsWith('/oldconversations') || trimmed.startsWith('/history')) {
        const selection = await handleHistoryCommand(trimmed.replace(/^\/oldconversations\s*|^\/history\s*/, ''));
        if (selection) {
          const restored = await initializeInteractiveSession(process.cwd(), selection.messages, selection.id);
          history.length = 0; history.push(...restored.messages);
          conversationId = restored.conversationId;
        }
        return;
      }

      if (trimmed.startsWith('/run ')) {
        const cmd = modelTrimmed.slice(5).trim();
        const abortController = new AbortController();
        activeAbortController = abortController;
        try { const r = await runCommand(cmd, { stream: true, shell: true, timeout: 60_000 }); }
        catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ ') + err.message + '\n'); }
        finally { activeAbortController = null; }
        return;
      }

      const userMessage = resolveAtFiles(modelTrimmed);
      const detectedDir = detectWorkDir(userMessage);
      if (detectedDir) { setWorkDir(detectedDir); logger.write(chalk.dim(`  📁 Dir: ${detectedDir}\n`)); }

      // ── Specialized Roles (Planner/Judge) ──
      if (activeRole !== 'chat') {
        const roleConfig = config.pipeline[activeRole];
        const roleHistory = specializedHistories[activeRole];
        const { PLANNER_PROMPT, JUDGE_PROMPT, PIPELINE_CODER_PROMPT } = await import('../prompts.config');
        const specializedSystemPrompt = activeRole === 'planner' ? PLANNER_PROMPT : activeRole === 'coder' ? PIPELINE_CODER_PROMPT : JUDGE_PROMPT;

        const userMsgObj: Message = { role: 'user', content: userMessage };
        roleHistory.push(userMsgObj);
        await appendMessage(userMsgObj).catch(() => {});

        const abortController = new AbortController();
        activeAbortController = abortController;
        try {
          process.stdout.write('\n' + chalk.bold[activeRole === 'planner' ? 'magenta' : 'yellow'](`${activeRole.toUpperCase()}: `));
          const staticContext = buildStaticContextMessages();
          const { runAgent } = await import('./agent');
          const agentResult = await runAgent(userMessage, configForRole(config, roleConfig, activeRole), [...staticContext, ...summarizeOldToolResults(roleHistory, 10)], abortController.signal, specializedSystemPrompt, undefined,
            activeRole === 'coder' ? { sectioned: true, implementationGuard: true, stage: { allowedTools: CODER_TOOL_NAMES } } : {});
          roleHistory.push(...agentResult.messages);
          logger.write(chalk.dim('─'.repeat(50)) + '\n');
        } catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + err.message + '\n'); }
        finally { activeAbortController = null; }
        return;
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



        const userMsgObj: Message = { role: 'user', content: userMessage };
        history.push(userMsgObj);
        await appendMessage(userMsgObj);
        addMessage(userMsgObj).catch(() => {});

        // Görevi context'i kurmadan ÖNCE çöz: buildContextMessages <active_task>
        // bloğunu state'ten okur. Eskiden bu runAgent içinde (context kurulduktan
        // SONRA) yapılıyordu — model yeni mesaj yerine bir önceki görevi
        // "CRITICAL: devam et" talimatıyla görüp alakasız tool'lar çalıştırıyordu.
        resolveTaskForUserMessage(userMessage);

        // Bölümlü mod: assembler task/brain/changes/tool-log bölümlerini kendisi
        // kurar, ona ham oturum geçmişi verilir. Kapalıysa eski yol.
        const sectioned = isSectionedContextEnabled();
        const agentHistory = sectioned
          ? [...getSessionMessages()]
          : summarizeOldToolResults(buildContextMessages(undefined, { maxTokens: contextBudget, minHotMessages }), 25);

        // A crash/kill mid-turn used to lose the entire turn silently (nothing
        // was persisted until runAgent fully returned) — "devam et" afterwards
        // had zero memory of a tool call that was in flight. Persist each
        // message as it's produced instead of batching at the end.
        await runAgent(userMessage, config, agentHistory, abortController.signal, undefined, async (msg) => {
          history.push(msg);
          await appendMessage(msg);
          addMessage(msg).catch(() => {});
        }, { taskAlreadyResolved: true, sectioned });

        saveConversation(history, config.provider, getActiveModel(config), { conversationId: conversationId ?? undefined });
        if (sectioned) {
          // LLM özeti yok: görev/brain/değişiklikler workspace store'da kalıcı,
          // eski ham mesajlar sadece arşive taşınır.
          const archived = await archiveOldMessages(maxCtxTokens, config.compressThreshold, 200);
          if (archived) logger.write(chalk.dim('  📦 Eski mesajlar arşivlendi\n'));
        } else {
          const compressed = await autoCompress((msgs) => summarizeForCompression(msgs, config, maxCtxTokens), maxCtxTokens, config.compressThreshold, minHotMessages);
          if (compressed) logger.write(chalk.dim('  📦 Context compressed\n'));
        }
        logger.write(chalk.dim('─'.repeat(50)) + '\n');
      } catch (err: any) { if (!abortController.signal.aborted) logger.error(chalk.red('\n✗ Hata: ') + err.message + '\n'); }
      finally { activeAbortController = null; }
  };

  // Önceki süreçten kalan bekleyen mesajlar (örn. temiz kapanmayan bir oturum)
  // kuyruğa DOĞRUDAN beslenmiyor — kullanıcı seçmeden otomatik işlenmeye
  // başlıyordu (özellikle bracketed-paste'i desteklemeyen terminallerde tek
  // bir yapıştırmanın onlarca parçaya bölünüp arka arkaya çalıştığı durumda,
  // kullanıcı deha'yı kapatıp tekrar açtığında "kendi kendine devam ediyor"
  // gibi görünüyordu). Sadece gösterilir; göndermek için /queue run gerekir.
  const restoredPending = getPendingInputs();
  const queue = new InputQueue({
    initial: [],
    changed: setPendingInputs,
    process: async input => {
      logger.write(chalk.dim(`\n  ▶ İşleniyor: ${input.replace(/\s+/g, ' ').slice(0, 100)}\n`));
      prompt();
      try { await processInput(input); }
      finally { setPendingInputs(queue.pending); }
    },
    idle: prompt,
    error: error => logger.error('Mesaj işlenemedi: ' + (error instanceof Error ? error.message : String(error))),
  });

  let multiline = '';
  rl.on('line', line => {
    // /model gibi bir modal sihirbaz açıkken bu satır bize ait değil — inquirer
    // kendi cevabını zaten işliyor. Yoksay, yoksa sihirbaza yazılan model adı/
    // API key gibi değerler sohbet kuyruğuna "mesaj" olarak sızar.
    if (modalActive) return;
    if (line.endsWith('\\')) {
      multiline += (multiline ? '\n' : '') + line.slice(0, -1);
      rl.setPrompt('... '); rl.prompt(); return;
    }
    const input = pasteInput.expand(multiline + (multiline ? '\n' : '') + line);
    multiline = '';
    const trimmed = input.trim();
    if (!trimmed) { prompt(); return; }
    if (/^\/jobs(?:\s|$)/.test(trimmed)) {
      void handleJobsCommand(trimmed.slice(5).trim())
        .catch(error => logger.error(String(error.message)))
        .finally(prompt);
      return;
    }
    if (/^\/queue(?:\s|$)/.test(trimmed)) {
      const args = trimmed.split(/\s+/).slice(1);
      if (!args.length) {
        const pending = queue.pending;
        logger.write(pending.length
          ? pending.map((message, i) => `  ${i + 1}. ${message.replace(/\s+/g, ' ').slice(0, 150)}`).join('\n')
          : '  Sırada bekleyen mesaj yok.');
        if (restoredPending.length) {
          logger.write(chalk.dim(`  (+ önceki oturumdan ${restoredPending.length} mesaj — henüz yüklenmedi, /queue run ile eklenir)`));
        }
      } else if (args[0] === 'clear' && args.length === 1) {
        queue.clear(); restoredPending.length = 0; logger.write('  Bekleyen mesajlar temizlendi.');
      } else if (args[0] === 'remove' && args.length === 2 && /^\d+$/.test(args[1])) {
        logger.write(queue.remove(Number(args[1]) - 1) ? '  Mesaj sıradan çıkarıldı.' : '  Geçersiz sıra numarası.');
      } else if (args[0] === 'run' && args.length === 1) {
        if (!restoredPending.length) logger.write('  Geri yüklenecek önceki oturum mesajı yok.');
        else { const items = restoredPending.splice(0); items.forEach(i => queue.enqueue(i)); logger.write(`  ✓ ${items.length} önceki mesaj kuyruğa eklendi.`); }
      } else logger.write('  Kullanım: /queue | /queue run | /queue clear | /queue remove <n>');
      prompt(); return;
    }
    if (queue.running) logger.write(chalk.yellow(`  ⏳ Sıraya eklendi (#${queue.pending.length + 1}): ${trimmed.replace(/\s+/g, ' ').slice(0, 100)}`));
    queue.enqueue(input);
    prompt();
  });
  if (restoredPending.length) {
    logger.write(chalk.yellow(`  ↩ Önceki oturumdan ${restoredPending.length} bekleyen mesaj bulundu (otomatik GÖNDERİLMEDİ).\n`) +
      chalk.dim('    Görmek için /queue, göndermek için /queue run, silmek için /queue clear.\n'));
  }

  rl.on('SIGINT', async () => { if (activeAbortController) activeAbortController.abort(); else { await exitCleanup(history, config, conversationId, sessionUsageSnapshot); process.exit(0); } });
  process.once('SIGTERM', async () => { await exitCleanup(history, config, conversationId, sessionUsageSnapshot); process.exit(0); });
  rl.on('close', () => { closed = true; queue.stop(); pasteInput.stream.removeListener('keypress', onGlobalKeypress); process.stdin.unpipe(pasteInput.stream); pasteInput.cleanup(); if (process.stdin.isTTY) { process.stdout.write('\x1b[?2004l'); process.stdin.setRawMode(false); } });
  queue.start();
  if (!queue.running) prompt();
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
  // Temiz çıkışta (crash değil, kullanıcı kendi isteğiyle çıktı) bir sonraki
  // `deha` açılışı otomatik olarak bu sohbeti sürdürmemeli — sohbet zaten
  // yukarıda kaydedildi, "deha resume <id>" ile açıkça geri dönülebilir.
  // Aksi halde kullanıcı seçmediği hâlde eski sohbet otomatik devam ediyordu.
  await resetSession(process.cwd()).catch(() => {});
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
    const content = safeSlice(m.content || '', 0, maxLen);
    if (m.role === 'tool') return `[tool]: ${safeSlice(content, 0, 200)}`;
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
  const { SUMMARIZATION_PROMPT } = await import('../prompts.config');
  return sendMessage([{ role: 'user', content: summaryPrompt }], { ...config, systemPrompt: SUMMARIZATION_PROMPT });
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
          if (start < 0) {
            // Terminal didn't send \x1b[200~/201~ bracketed-paste markers at all
            // (e.g. Colab's exec terminal) — but under raw mode a single real
            // clipboard paste still lands as ONE raw chunk with embedded \n's,
            // while a human keystroke is its own chunk. Without this, every
            // line of a pasted multi-line message became its own readline
            // 'line' event, i.e. its own queued message (one giant instruction
            // exploded into dozens of fragments that then auto-fired in order).
            const newlineCount = (buffer.match(/\n/g) || []).length;
            if (newlineCount >= 2) {
              const lastNewline = buffer.lastIndexOf('\n');
              const content = buffer.slice(0, lastNewline);
              const id = String(nextId++); pasted.set(id, content);
              output += `[Pasted Content ${content.length} chars #${id}]\n`;
              buffer = buffer.slice(lastNewline + 1);
              continue;
            }
            const keep = pasteStartSuffixLength(buffer); if (buffer.length <= keep) break; output += buffer.slice(0, buffer.length - keep); buffer = buffer.slice(buffer.length - keep); break;
          }
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
    case 'custom': return config.customModel;
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
