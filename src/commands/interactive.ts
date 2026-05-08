import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message, sendMessage } from '../services/ai-service';
import { formatResponse } from './chat';
import { runAgent } from './agent';
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
import { detectIntent, enrichWithSearch } from '../services/intent';
import {
  addMessage,
  closeMemory,
} from '../services/memory';
import {
  detectWorkDir,
  setWorkDir,
  appendMessage,
  buildContextMessages,
  autoCompress,
  getContextStats,
  flushOnExit,
  hydrateSession,
  resetSession,
} from '../services/session-memory';
import { getMaxContextTokens } from '../services/token-counter';
import { startServices, stopServices } from '../services/process-manager';
import { runSystemTest } from './test-runner';
import { DEHA_VERSION, DEHA_VERSION_LABEL } from '../version';
import { logger } from '../services/logger';

const BANNER = `
${chalk.bold.cyan('╔══════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}  ${chalk.bold.white('DEHA')} ${chalk.dim('— Akıllı Kodlama Asistanı')}         ${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')}  ${chalk.dim(`v${DEHA_VERSION}  •  github.com/deha-cli`)}         ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════════╝')}
`;

const HELP_TEXT = `
${chalk.bold('Komutlar:')}
  ${chalk.cyan('/help')}                    Bu yardım mesajını göster
  ${chalk.cyan('/new')}                     Yeni sohbet başlat
  ${chalk.cyan('/clear')}                   Sohbet geçmişini temizle
  ${chalk.cyan('/model')}                   Model & provider ayarlarını düzenle (Chat/Planner/Coder/Judge/Vision)
  ${chalk.cyan('/thinking [on|off] [effort]')} DeepSeek thinking mode'u aç/kapat
  ${chalk.cyan('/agent <soru>')}            Araç çağırabilen ajan modu (Claude)
  ${chalk.cyan('/file <yol>')}              Dosyayı bağlama ekle
  ${chalk.cyan('/mcp <list|status|...>')}        MCP sunucu yönetimi
  ${chalk.cyan('/oldconversations [n|search]')}  Eski sohbetleri görüntüle
  ${chalk.cyan('/run <komut>')}                  Terminal komutu çalıştır
  ${chalk.cyan('/python <kod>')}                 Python kodu çalıştır
  ${chalk.cyan('/smoketest <url>')}              HTTP smoke testi yap
  ${chalk.cyan('/screenshot <url>')}             Ekran görüntüsü al
  ${chalk.cyan('/vision <url>')}                 Screenshot + AI analizi
  ${chalk.cyan('/stats')}                        Token kullanımı ve maliyet istatistikleri
  ${chalk.cyan('/test')}                         API ve pipeline sistem testi
  ${chalk.cyan('/judge <dosya> <görev>')}   Sadece Judge rolünü çalıştırarak bir dosyayı değerlendir
  ${chalk.cyan('/exit')}                         Çıkış yap

${chalk.bold('@dosya.ts sözdizimi:')}
  Mesajın içine ${chalk.yellow('@./src/index.ts')} yazarak dosya içeriğini otomatik ekle.

${chalk.bold('MCP kısayolları:')}
  /mcp list    → sunucular   /mcp catalog → kurulabilecekler
  /mcp install filesystem   → dosya sistemi sunucusunu kur
`;

const COMMAND_SUGGESTIONS = [
  '/help',
  '/new',
  '/clear',
  '/model',
  '/thinking',
  '/agent',
  '/file',
  '/mcp',
  '/history',
  '/oldconversations',
  '/run',
  '/python',
  '/smoketest',
  '/screenshot',
  '/vision',
  '/stats',
  '/test',
  '/judge',
  '/exit',
];

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

  // Redis + ChromaDB'yi otomatik başlat
  startServices().then(s => {
    const parts: string[] = [];
    if (s.redis !== 'unavailable') parts.push(`Redis ${s.redis === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (s.chromadb !== 'unavailable') parts.push(`ChromaDB ${s.chromadb === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    const vsLabel = s.vectorStore || (s.chromadb !== 'unavailable' ? 'ChromaDB' : 'JSON');
    if (s.chromadb === 'unavailable') parts.push(`VectorStore ${chalk.dim('✓')} [${vsLabel}]`);
    if (parts.length) process.stdout.write(chalk.dim('  ') + parts.join(chalk.dim('  ')) + '\n\n');
  }).catch(() => {});

  setWorkDir(process.cwd());

  // MCP sunucularına bağlan (arka planda, hata sessiz geç)
  mcpManager.connectAll(true).catch(() => {});

  // Güncelleme kontrolü (sessiz, sadece yeni sürüm varsa bildir)
  checkForUpdates(true).catch(() => {});

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: completeCommand,
  });
  const sessionUsageSnapshot = getUsageSnapshot();
  let activeAbortController: AbortController | null = null;
  let lastSuggestion = '';

  const onGlobalKeypress = (_str: string, key: { name?: string } | undefined) => {
    if (key?.name === 'escape' && activeAbortController) {
      activeAbortController.abort();
      process.stdout.write(chalk.red('\n[İptal edildi - ESC]\n'));
      return;
    }

    if (!activeAbortController) {
      const suggestion = getInlineSuggestion(rl.line);
      if (suggestion !== lastSuggestion) {
        lastSuggestion = suggestion;
        if (suggestion) {
          process.stdout.write('\n' + chalk.dim(`Öneri: ${suggestion}`) + '\n');
          rl.prompt(true);
        }
      }
    }
  };
  process.stdin.on('keypress', onGlobalKeypress);

  // Geriye dönük uyumluluk için boş history (session-memory bunu yönetiyor artık)
  const history: Message[] = [...initialHistory];
  let conversationId: string | null = initialConversationId ?? null;
  if (initialHistory.length > 0) {
    await hydrateSession(initialHistory, { workDir: process.cwd() }).catch(() => {});
    logger.write(chalk.dim(`  ↩ ${initialHistory.length} mesaj yüklendi\n`));
  } else {
    conversationId = createConversationId();
    await resetSession(process.cwd()).catch(() => {});
  }

  const prompt = async () => {
    const input = await new Promise<string>((resolve) => {
      let buffer = '';

      rl.setPrompt(chalk.bold.cyan('DEHA ❯ '));
      rl.prompt();
      lastSuggestion = getInlineSuggestion(rl.line);

      const onLine = (line: string) => {
        // Satır \ ile bitiyorsa manuel multi-line (alt satıra geç)
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

    const trimmed = input.trim();

    if (!trimmed) { prompt(); return; }

      // ── Dahili komutlar ───────────────────────────────────────────────────
      if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
        await exitCleanup(history, config, conversationId, sessionUsageSnapshot);
        rl.close(); process.exit(0);
      }

      if (trimmed === '/help') { logger.write(HELP_TEXT); prompt(); return; }

      if (trimmed === '/new') {
        if (history.length >= 2) {
          const filePath = saveConversation(history, config.provider, getActiveModel(config), {
            conversationId: conversationId ?? undefined,
          });
          if (filePath) {
            conversationId = path.basename(filePath, '.md');
          }
        }
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        setWorkDir(process.cwd());
        logger.write(chalk.green('✓ Yeni sohbet başlatıldı.'));
        logger.write(chalk.dim('  ID: ') + chalk.cyan(conversationId));
        logger.write(chalk.dim('  Devam: ') + chalk.cyan(`deha resume ${conversationId}`) + '\n');
        prompt(); return;
      }

      if (trimmed === '/clear') {
        history.length = 0;
        conversationId = createConversationId();
        await resetSession(process.cwd()).catch(() => {});
        console.clear();
        logger.write(BANNER);
        logger.write(chalk.green('✓ Sohbet geçmişi temizlendi.'));
        logger.write(chalk.dim('  Yeni ID: ') + chalk.cyan(conversationId) + '\n');
        prompt(); return;
      }

      if (trimmed === '/stats') {
        printStats();
        prompt(); return;
      }

      if (trimmed === '/version' || isVersionQuestion(trimmed)) {
        logger.write(chalk.cyan(`${DEHA_VERSION_LABEL}\n`));
        prompt(); return;
      }

      if (trimmed === '/model') {
        rl.pause();
        try {
          await modelSetup(config);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).name !== 'ExitPromptError') {
            logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)));
          }
        }
        rl.resume();
        prompt(); return;
      }

      if (trimmed.startsWith('/thinking')) {
        const parts = trimmed.split(/\s+/).slice(1);
        if (parts.length === 0) {
          logger.write(
            chalk.cyan('DeepSeek thinking: ') +
            chalk.yellow(config.deepseekThinking) +
            chalk.dim('  effort=') +
            chalk.yellow(config.deepseekReasoningEffort) +
            '\n',
          );
          prompt(); return;
        }

        const state = normalizeThinkingState(parts[0]);
        if (!state) {
          logger.write(chalk.yellow('ℹ Kullanım: /thinking <on|off> [high|max]\n'));
          prompt(); return;
        }

        config.deepseekThinking = state;
        if (state === 'enabled' && parts[1]) {
          config.deepseekReasoningEffort = normalizeThinkingEffort(parts[1]);
        }

        logger.write(
          chalk.green('✓ DeepSeek thinking güncellendi: ') +
          chalk.cyan(config.deepseekThinking) +
          chalk.dim('  effort=') +
          chalk.cyan(config.deepseekReasoningEffort) +
          '\n',
        );
        prompt(); return;
      }

      if (trimmed.startsWith('/judge ')) {
        const parts = trimmed.slice(7).trim().split(/\s+/);
        const filePath = parts[0];
        const task = parts.slice(1).join(' ').trim();

        if (!filePath || !task) {
          logger.write(chalk.yellow('ℹ Kullanım: /judge <dosya> <görev>\n'));
          prompt(); return;
        }

        if (!fs.existsSync(filePath)) {
          logger.write(chalk.red(`✗ Dosya bulunamadı: ${filePath}\n`));
          prompt(); return;
        }

        const code = fs.readFileSync(filePath, 'utf-8');
        try {
          logger.write(chalk.bold(`\n⚖️  JUDGE çalışıyor... [Dosya: ${filePath}]`));
          const { runJudge } = await import('../pipeline/judge');
          const verdict = await runJudge(task, 'Manuel Değerlendirme (No Plan)', code, config, (chunk) => {
            process.stdout.write(chalk.yellow(chunk));
          });
          logger.write('\n' + chalk.bold('─'.repeat(40)));
          if (verdict.pass) {
            logger.write(chalk.bgGreen.black(` ✓ PASS `) + chalk.green(` • Skor: ${verdict.score}`));
          } else {
            logger.write(chalk.bgRed.white(` ✗ FAIL `) + chalk.red(` • Skor: ${verdict.score}`));
          }
          logger.write('\n');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(chalk.red('\n✗ Hata: ') + message + '\n');
        }
        prompt(); return;
      }

      // ── /file <yol> ───────────────────────────────────────────────────────
      if (trimmed.startsWith('/file ')) {
        const filePath = trimmed.slice(6).trim();
        const injected = injectFile(filePath);
        if (injected) {
          logger.write(chalk.green(`✓ Bağlama eklendi: ${filePath} (${injected.length} karakter)\n`));
          history.push({ role: 'user', content: injected });
          history.push({ role: 'assistant', content: `Tamam, ${filePath} dosyasını okudum ve bağlama ekledim.` });
        }
        prompt(); return;
      }

      // ── /mcp <...> ────────────────────────────────────────────────────────
      if (trimmed.startsWith('/mcp')) {
        await handleMcpCommand(trimmed.slice(4).trim());
        prompt(); return;
      }

      // ── /oldconversations ─────────────────────────────────────────────────
      if (trimmed.startsWith('/oldconversations') || trimmed.startsWith('/history')) {
        await handleHistoryCommand(trimmed.replace(/^\/oldconversations\s*|^\/history\s*/, ''));
        prompt(); return;
      }

      // ── /run <komut> ──────────────────────────────────────────────────────
      if (trimmed.startsWith('/run ')) {
        const cmd = trimmed.slice(5).trim();
        try {
          const r = await runCommand(cmd, { stream: true, shell: true, timeout: 60_000 });
          logger.write(chalk.dim(`\nExit: ${r.exitCode}  (${r.duration}ms)\n`));
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /python <kod> ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/python ')) {
        const code = trimmed.slice(8).trim();
        const python = await detectPython();
        if (!python) {
          logger.write(chalk.red('\n✗ Python bulunamadı. python veya python3 yüklü olmalı.\n'));
          prompt(); return;
        }
        try {
          const r = await runPythonCode(code, { timeout: 30 });
          if (r.stdout) logger.write('\n' + chalk.cyan(r.stdout.trim()));
          if (r.stderr) logger.write(chalk.red(r.stderr.trim()));
          logger.write(chalk.dim(`\nExit: ${r.exitCode}\n`));
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /smoketest <url> ──────────────────────────────────────────────────
      if (trimmed.startsWith('/smoketest ')) {
        const url = trimmed.slice(11).trim();
        try {
          const checks = buildQuickChecks(url, ['/', '/health', '/api', '/api/health']);
          const report = await runSmokeTests(checks);
          printSmokeReport(report);
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /screenshot <url> ─────────────────────────────────────────────────
      if (trimmed.startsWith('/screenshot ')) {
        const url = trimmed.slice(12).trim();
        try {
          process.stdout.write(chalk.dim('Screenshot alınıyor... '));
          const p = await takeScreenshot(url, { fullPage: false, waitMs: 1500 });
          logger.write(chalk.green('✓'));
          logger.write(chalk.dim(`  Kaydedildi: ${p}\n`));
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)));
          logger.write(chalk.dim('  Playwright yüklü değilse: npx playwright install chromium\n'));
        }
        prompt(); return;
      }

      // ── /vision <url veya dosya yolu> ─────────────────────────────────────
      if (trimmed.startsWith('/vision ')) {
        const target = trimmed.slice(8).trim();
        try {
          if (target.startsWith('http')) {
            process.stdout.write(chalk.dim('Screenshot + Vision analizi yapılıyor...\n\n'));
            const { screenshotPath, analysis } = await screenshotAndAnalyze(target, config);
            logger.write(chalk.dim(`Screenshot: ${screenshotPath}\n`));
            logger.write(chalk.bold.cyan('Vision Analizi:'));
            logger.write(formatResponse(analysis) + '\n');
          } else {
            process.stdout.write(chalk.dim('Görüntü analiz ediliyor...\n\n'));
            const { analyzeExistingImage } = await import('../tools/vision');
            const analysis = await analyzeExistingImage(target, config);
            logger.write(chalk.bold.cyan('Vision Analizi:'));
            logger.write(formatResponse(analysis) + '\n');
          }
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /test ─────────────────────────────────────────────────────────────
      if (trimmed === '/test') {
        try {
          await runSystemTest(config);
        } catch (err: unknown) {
          logger.error(chalk.red('\n✗ Test hatası: ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /agent <soru> ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/agent ')) {
        const agentPrompt = trimmed.slice(7).trim();
        
        const abortController = new AbortController();
        activeAbortController = abortController;

        try {
          const response = await runAgent(agentPrompt, config, history, abortController.signal);
          history.push({ role: 'user', content: agentPrompt });
          history.push({ role: 'assistant', content: response });
        // Session memory'ye de ekle
        await appendMessage({ role: 'user', content: agentPrompt });
        await appendMessage({ role: 'assistant', content: response });
        const autosavedPath = saveConversation(history, config.provider, getActiveModel(config), {
          conversationId: conversationId ?? undefined,
        });
        if (autosavedPath) {
          conversationId = path.basename(autosavedPath, '.md');
        }
        logger.write(chalk.dim('\n' + '─'.repeat(50)) + '\n');
        } catch (err: unknown) {
          if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError') || (err instanceof Error && err.message.includes('canceled'))) {
            // İptal edildi, hata yazdırma
          } else {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(chalk.red('\n✗ Hata: ') + message + '\n');
          }
        } finally {
          activeAbortController = null;
        }
        prompt(); return;
      }

      // ── @dosya.ts sözdizimi ───────────────────────────────────────────────
      const userMessage = resolveAtFiles(trimmed);

      // ── WorkDir tespiti — kullanıcı dizin verdi mi? ───────────────────────
      const detectedDir = detectWorkDir(trimmed);
      if (detectedDir) {
        setWorkDir(detectedDir);
        logger.write(chalk.dim(`  📁 Çalışma dizini: ${detectedDir}\n`));
      }

      // ── Chat (normal LLM yanıtı, tool loop yok) ───────────────────────────
      try {
        // Intent detection — web search gerekiyor mu?
        let enrichedMessage = userMessage;
        let searchSystemAddendum = '';
        const intent = await detectIntent(userMessage, config);
        if (intent.search && intent.keywords) {
          process.stdout.write(chalk.dim(`\n  🌍 Searching: "${intent.keywords}"... `));
          enrichedMessage = await enrichWithSearch(userMessage, intent.keywords);
          searchSystemAddendum = [
            '',
            '=== WEB ARAMA SONUÇLARI MEVCUT ===',
            'Kullanıcının sorusunu cevaplamak için yukarıdaki [WEB ARAMA SONUÇLARI] bölümündeki verileri KULLAN.',
            'Bu veriler gerçek zamanlıdır. Bunları kullanarak cevap ver.',
            'Kesinlikle "veriye erişimim yok", "canlı verim yok", "üzgünüm" gibi ifadeler KULLANMA.',
            'Verileri oku, özetle ve kaynaklarıyla birlikte sun.',
          ].join('\n');
          logger.write(chalk.green('✓'));
        }

        // Search yapıldıysa config'in system prompt'una ekle
        const activeConfig = searchSystemAddendum
          ? { ...config, systemPrompt: (config.systemPrompt || '') + '\n' + searchSystemAddendum }
          : config;

        // Bağlamı session-memory'den oluştur. Yeni mesajı runAgent ekleyecek;
        // burada tekrar eklersek model aynı isteği iki kez görür.
        const contextHistory = buildContextMessages();

        process.stdout.write('\n' + chalk.bold.cyan('DEHA:'));
        const fullResponse = await sendMessage(
          [...contextHistory, { role: 'user', content: enrichedMessage }],
          activeConfig,
        );
        logger.write(formatResponse(fullResponse) + '\n');

        // history array'ine ekle (agent ve /file uyumluluğu için)
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: fullResponse });

        // Session memory'ye ekle (context compression için)
        await appendMessage({ role: 'user', content: userMessage });
        await appendMessage({ role: 'assistant', content: fullResponse });

        const autosavedPath = saveConversation(history, config.provider, getActiveModel(config), {
          conversationId: conversationId ?? undefined,
        });
        if (autosavedPath) {
          conversationId = path.basename(autosavedPath, '.md');
        }

        // Redis/ChromaDB'ye de yaz (long-term memory, semantic search)
        addMessage({ role: 'user', content: userMessage }).catch(() => {});
        addMessage({ role: 'assistant', content: fullResponse }).catch(() => {});

        // Context sınıra yaklaştıysa compress et
        const maxCtxTokens = config.maxContextTokens > 0
          ? config.maxContextTokens
          : getMaxContextTokens(config.provider, getActiveModel(config));

        const compressed = await autoCompress(
          async (msgs) => {
            const summaryPrompt = [
              'Aşağıdaki teknik konuşmayı bir "Mühendislik Özeti" (Engineering Summary) olarak özetle.',
              'ÖNEMLİ: Aşağıdaki bilgileri ASLA KAYBETME:',
              `- Aktif Çalışma Dizini (WorkDir: ${getContextStats(maxCtxTokens).workDir})`,
              '- Üzerinde çalışılan kritik dosya yolları ve bağımlılıklar.',
              '- Mimari kararlar ve "Neden?" sorusunun cevapları.',
              '- Henüz çözülmemiş teknik borçlar veya bekleyen alt görevler.',
              'Gereksiz nezaket cümlelerini ve tekrarlanan hata mesajlarını çıkar.',
              'Özet teknik, yoğun ve Türkçe olsun.\n\n---\n',
              ...msgs.map(m => `${m.role === 'user' ? 'Kullanıcı' : 'DEHA'}: ${m.content.slice(0, 1500)}`),
            ].join('\n');
            return sendMessage([{ role: 'user', content: summaryPrompt }], config);
          },
          maxCtxTokens,
          config.compressThreshold,
          config.minHotMessages,
        );

        if (compressed) {
          const stats = getContextStats(maxCtxTokens);
          logger.write(
            chalk.dim('  📦 Context compressed') +
            chalk.dim(` — ${stats.messages} mesaj korundu, `) +
            chalk.dim(`~${Math.round(stats.usagePercent)}% kullanım\n`),
          );
        }

        logger.write(chalk.dim('─'.repeat(50)) + '\n');
      } catch (err: unknown) {
        if ((err instanceof Error && err.name === 'AbortError') || (err instanceof Error && err.message.includes('canceled'))) {
          // İptal edildi sessizce yut (hata catch dışında handle edildi)
        } else {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(chalk.red('\n✗ Hata: ') + message + '\n');
        }
      }

      prompt();
  };

  rl.on('SIGINT', async () => {
    await exitCleanup(history, config, conversationId, sessionUsageSnapshot);
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    await flushOnExit().catch(() => {});
    await closeMemory().catch(() => {});
    process.exit(0);
  });

  rl.on('close', () => {
    process.stdin.removeListener('keypress', onGlobalKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  });

  prompt();
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

async function exitCleanup(
  history: Message[],
  config: DehaConfig,
  conversationId?: string | null,
  sessionUsageSnapshot = 0,
): Promise<void> {
  // Session memory'yi kalıcı depolamaya yaz (cold storage + warm buffer temizliği)
  await flushOnExit().catch(() => {});
  await closeMemory().catch(() => {});
  stopServices();

  let sessionId: string | null = null;
  if (history.length >= 2) {
    const filePath = saveConversation(history, config.provider, getActiveModel(config), {
      conversationId: conversationId ?? undefined,
    });
    if (filePath) {
      sessionId = path.basename(filePath, '.md');
    }
  }

  await mcpManager.disconnectAll().catch(() => {});
  printSessionSummary(getUsageSince(sessionUsageSnapshot));
  logger.write(chalk.dim('Görüşürüz! 👋'));
  if (sessionId) {
    logger.write(chalk.dim('To continue this session, run: ') + chalk.cyan(`deha resume ${sessionId}`) + '\n');
  } else {
    logger.write('');
  }
}

function getActiveModel(config: DehaConfig): string {
  switch (config.provider) {
    case 'claude':      return config.claudeModel;
    case 'openai':      return config.openaiModel;
    case 'deepseek':    return config.deepseekModel;
    case 'ollama':      return config.ollamaModel;
    case 'openrouter':  return config.openrouterModel;
    case 'xai':         return config.xaiModel;
    default:            return config.provider;
  }
}

function injectFile(filePath: string): string | null {
  try {
    const resolved = path.resolve(filePath);
    const content = fs.readFileSync(resolved, 'utf-8');
    const ext = path.extname(filePath).slice(1) || 'text';
    return `Aşağıdaki dosya içeriğini sana gönderiyorum:\n\`\`\`${ext}\n// ${resolved}\n${content}\n\`\`\``;
  } catch {
    logger.error(chalk.red(`✗ Dosya okunamadı: ${filePath}\n`));
    return null;
  }
}

/** Mesaj içindeki @./path.ts referanslarını dosya içeriğiyle değiştirir */
function resolveAtFiles(message: string): string {
  return message.replace(/@([\S]+)/g, (_match, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      const content = fs.readFileSync(resolved, 'utf-8');
      const ext = path.extname(filePath).slice(1) || 'text';
      return `\n\`\`\`${ext}\n// ${resolved}\n${content}\n\`\`\`\n`;
    } catch {
      return _match; // değiştirmeden bırak
    }
  });
}

function isVersionQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /\bversion\b/,
    /\bversiyon\b/,
    /\bsürüm\b/,
    /\bhangi sürüm\b/,
    /\bhangi versiyon\b/,
    /\bkaçıncı sürüm\b/,
    /\bkaçıncı versiyon\b/,
    /\bsenin versiyonun\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function normalizeThinkingState(value: string): 'enabled' | 'disabled' | null {
  const normalized = value.trim().toLowerCase();
  if (['on', 'enable', 'enabled', 'true', '1'].includes(normalized)) return 'enabled';
  if (['off', 'disable', 'disabled', 'false', '0'].includes(normalized)) return 'disabled';
  return null;
}

function normalizeThinkingEffort(value: string): 'high' | 'max' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'max' || normalized === 'xhigh') return 'max';
  return 'high';
}

function completeCommand(line: string): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  const hits = COMMAND_SUGGESTIONS.filter((cmd) => cmd.startsWith(line));
  return [hits.length ? hits : COMMAND_SUGGESTIONS, line];
}

function getInlineSuggestion(line: string): string {
  if (!line.startsWith('/')) return '';
  if (COMMAND_SUGGESTIONS.includes(line)) return '';
  const match = COMMAND_SUGGESTIONS.find((cmd) => cmd.startsWith(line));
  return match ?? '';
}
