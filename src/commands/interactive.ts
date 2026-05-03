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
import { saveConversation } from '../conversations/manager';
import { handleHistoryCommand } from '../conversations/commands';
import { runCommand } from '../tools/terminal';
import { runPythonCode, detectPython } from '../tools/python';
import { runSmokeTests, buildQuickChecks, printSmokeReport } from '../tools/smoke';
import { takeScreenshot } from '../tools/browser';
import { screenshotAndAnalyze } from '../tools/vision';
import { modelSetup } from './model-setup';
import { printStats } from '../services/usage-tracker';
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
  loadSession,
  getContextStats,
  getSessionMessages,
} from '../services/session-memory';
import { getMaxContextTokens } from '../services/token-counter';
import { startServices, stopServices } from '../services/process-manager';
import { runSystemTest } from './test-runner';
import { DEHA_VERSION, DEHA_VERSION_LABEL } from '../version';

const BANNER = `
${chalk.bold.cyan('╔══════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}  ${chalk.bold.white('DEHA')} ${chalk.dim('— Akıllı Kodlama Asistanı')}         ${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')}  ${chalk.dim(`v${DEHA_VERSION}  •  github.com/deha-cli`)}         ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════════╝')}
`;

const HELP_TEXT = `
${chalk.bold('Komutlar:')}
  ${chalk.cyan('/help')}                    Bu yardım mesajını göster
  ${chalk.cyan('/clear')}                   Sohbet geçmişini temizle
  ${chalk.cyan('/model')}                   Model & provider ayarlarını düzenle (Chat/Planner/Coder/Judge/Vision)
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

export async function interactive(config: DehaConfig, initialHistory: Message[] = []): Promise<void> {
  console.log(BANNER);
  console.log(
    chalk.dim('Provider: ') + chalk.green(getProviderLabel(config.provider)) +
    chalk.dim('  |  Model: ') + chalk.yellow(getActiveModel(config)) + '\n',
  );
  console.log(chalk.dim('Çıkmak için /exit  •  Yardım için /help\n'));

  // Redis + ChromaDB'yi otomatik başlat
  startServices().then(s => {
    const parts: string[] = [];
    if (s.redis !== 'unavailable') parts.push(`Redis ${s.redis === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (s.chromadb !== 'unavailable') parts.push(`ChromaDB ${s.chromadb === 'started' ? chalk.green('↑') : chalk.dim('✓')}`);
    if (parts.length) process.stdout.write(chalk.dim('  ') + parts.join(chalk.dim('  ')) + '\n\n');
  }).catch(() => {});

  // Session memory'yi yükle (önceki session'dan devam edebilmek için)
  await loadSession().catch(() => {});

  // MCP sunucularına bağlan (arka planda, hata sessiz geç)
  mcpManager.connectAll(true).catch(() => {});

  // Güncelleme kontrolü (sessiz, sadece yeni sürüm varsa bildir)
  checkForUpdates(true).catch(() => {});

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Geriye dönük uyumluluk için boş history (session-memory bunu yönetiyor artık)
  const history: Message[] = [...initialHistory];
  if (initialHistory.length > 0) {
    console.log(chalk.dim(`  ↩ ${initialHistory.length} mesaj yüklendi\n`));
  } else {
    // Session memory'den gelenleri göster
    const sessionMsgs = getSessionMessages();
    if (sessionMsgs.length > 0) {
      console.log(chalk.dim(`  ↩ Önceki oturumdan ${sessionMsgs.length} mesaj yüklendi.\n`));
      
      const last5 = sessionMsgs.slice(-5);
      console.log(chalk.dim('─── Son Konuşmalar ─────────────────────────────────'));
      for (const msg of last5) {
        const role = msg.role === 'user' ? 'Sen' : 'DEHA';
        const color = msg.role === 'user' ? chalk.green : chalk.cyan;
        let content = msg.content;
        if (content.length > 100) content = content.slice(0, 100).replace(/\n/g, ' ') + '...';
        console.log(color(role + ': ') + chalk.dim(content));
      }
      console.log(chalk.dim('────────────────────────────────────────────────────\n'));
    }
  }

  const prompt = async () => {
    const input = await new Promise<string>((resolve) => {
      let buffer = '';

      rl.setPrompt(chalk.bold.cyan('DEHA ❯ '));
      rl.prompt();

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
        await exitCleanup(history, config);
        rl.close(); process.exit(0);
      }

      if (trimmed === '/help') { console.log(HELP_TEXT); prompt(); return; }

      if (trimmed === '/clear') {
        history.length = 0;
        console.clear();
        console.log(BANNER);
        console.log(chalk.green('✓ Sohbet geçmişi temizlendi.\n'));
        prompt(); return;
      }

      if (trimmed === '/stats') {
        printStats();
        prompt(); return;
      }

      if (trimmed === '/version' || isVersionQuestion(trimmed)) {
        console.log(chalk.cyan(`${DEHA_VERSION_LABEL}\n`));
        prompt(); return;
      }

      if (trimmed === '/model') {
        rl.pause();
        try {
          await modelSetup(config);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).name !== 'ExitPromptError') {
            console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)));
          }
        }
        rl.resume();
        prompt(); return;
      }

      if (trimmed.startsWith('/judge ')) {
        const parts = trimmed.slice(7).trim().split(/\s+/);
        const filePath = parts[0];
        const task = parts.slice(1).join(' ').trim();

        if (!filePath || !task) {
          console.log(chalk.yellow('ℹ Kullanım: /judge <dosya> <görev>\n'));
          prompt(); return;
        }

        if (!fs.existsSync(filePath)) {
          console.log(chalk.red(`✗ Dosya bulunamadı: ${filePath}\n`));
          prompt(); return;
        }

        const code = fs.readFileSync(filePath, 'utf-8');
        try {
          console.log(chalk.bold(`\n⚖️  JUDGE çalışıyor... [Dosya: ${filePath}]`));
          const { runJudge } = await import('../pipeline/judge');
          const verdict = await runJudge(task, 'Manuel Değerlendirme (No Plan)', code, config, (chunk) => {
            process.stdout.write(chalk.yellow(chunk));
          });
          console.log('\n' + chalk.bold('─'.repeat(40)));
          if (verdict.pass) {
            console.log(chalk.bgGreen.black(` ✓ PASS `) + chalk.green(` • Skor: ${verdict.score}`));
          } else {
            console.log(chalk.bgRed.white(` ✗ FAIL `) + chalk.red(` • Skor: ${verdict.score}`));
          }
          console.log('\n');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.red('\n✗ Hata: ') + message + '\n');
        }
        prompt(); return;
      }

      // ── /file <yol> ───────────────────────────────────────────────────────
      if (trimmed.startsWith('/file ')) {
        const filePath = trimmed.slice(6).trim();
        const injected = injectFile(filePath);
        if (injected) {
          console.log(chalk.green(`✓ Bağlama eklendi: ${filePath} (${injected.length} karakter)\n`));
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
      if (trimmed.startsWith('/oldconversations') || trimmed === '/history') {
        await handleHistoryCommand(trimmed.replace(/^\/oldconversations\s*|^\/history\s*/, ''));
        prompt(); return;
      }

      // ── /run <komut> ──────────────────────────────────────────────────────
      if (trimmed.startsWith('/run ')) {
        const cmd = trimmed.slice(5).trim();
        try {
          const r = await runCommand(cmd, { stream: true, shell: true, timeout: 60_000 });
          console.log(chalk.dim(`\nExit: ${r.exitCode}  (${r.duration}ms)\n`));
        } catch (err: unknown) {
          console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /python <kod> ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/python ')) {
        const code = trimmed.slice(8).trim();
        const python = await detectPython();
        if (!python) {
          console.log(chalk.red('\n✗ Python bulunamadı. python veya python3 yüklü olmalı.\n'));
          prompt(); return;
        }
        try {
          const r = await runPythonCode(code, { timeout: 30 });
          if (r.stdout) console.log('\n' + chalk.cyan(r.stdout.trim()));
          if (r.stderr) console.log(chalk.red(r.stderr.trim()));
          console.log(chalk.dim(`\nExit: ${r.exitCode}\n`));
        } catch (err: unknown) {
          console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
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
          console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /screenshot <url> ─────────────────────────────────────────────────
      if (trimmed.startsWith('/screenshot ')) {
        const url = trimmed.slice(12).trim();
        try {
          process.stdout.write(chalk.dim('Screenshot alınıyor... '));
          const p = await takeScreenshot(url, { fullPage: false, waitMs: 1500 });
          console.log(chalk.green('✓'));
          console.log(chalk.dim(`  Kaydedildi: ${p}\n`));
        } catch (err: unknown) {
          console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)));
          console.log(chalk.dim('  Playwright yüklü değilse: npx playwright install chromium\n'));
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
            console.log(chalk.dim(`Screenshot: ${screenshotPath}\n`));
            console.log(chalk.bold.cyan('Vision Analizi:'));
            console.log(formatResponse(analysis) + '\n');
          } else {
            process.stdout.write(chalk.dim('Görüntü analiz ediliyor...\n\n'));
            const { analyzeExistingImage } = await import('../tools/vision');
            const analysis = await analyzeExistingImage(target, config);
            console.log(chalk.bold.cyan('Vision Analizi:'));
            console.log(formatResponse(analysis) + '\n');
          }
        } catch (err: unknown) {
          console.error(chalk.red('\n✗ ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /test ─────────────────────────────────────────────────────────────
      if (trimmed === '/test') {
        try {
          await runSystemTest(config);
        } catch (err: unknown) {
          console.error(chalk.red('\n✗ Test hatası: ') + (err instanceof Error ? err.message : String(err)) + '\n');
        }
        prompt(); return;
      }

      // ── /agent <soru> ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/agent ')) {
        const agentPrompt = trimmed.slice(7).trim();
        
        const abortController = new AbortController();
        const onKeypress = (str: string, key: any) => {
          if (key && key.name === 'escape') {
            abortController.abort();
            process.stdout.write(chalk.red('\n[İptal edildi - ESC]\n'));
          }
        };
        process.stdin.on('keypress', onKeypress);

        try {
          const response = await runAgent(agentPrompt, config, history, abortController.signal);
          history.push({ role: 'user', content: agentPrompt });
          history.push({ role: 'assistant', content: response });
          // Session memory'ye de ekle
          await appendMessage({ role: 'user', content: agentPrompt });
          await appendMessage({ role: 'assistant', content: response });
          console.log(chalk.dim('\n' + '─'.repeat(50)) + '\n');
        } catch (err: unknown) {
          if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError') || (err instanceof Error && err.message.includes('canceled'))) {
            // İptal edildi, hata yazdırma
          } else {
            const message = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('\n✗ Hata: ') + message + '\n');
          }
        } finally {
          process.stdin.removeListener('keypress', onKeypress);
        }
        prompt(); return;
      }

      // ── @dosya.ts sözdizimi ───────────────────────────────────────────────
      const userMessage = resolveAtFiles(trimmed);

      // ── WorkDir tespiti — kullanıcı dizin verdi mi? ───────────────────────
      const detectedDir = detectWorkDir(trimmed);
      if (detectedDir) {
        setWorkDir(detectedDir);
        console.log(chalk.dim(`  📁 Çalışma dizini: ${detectedDir}\n`));
      }

      // ── Chat (araç çağrısı destekli, session-memory ile) ─────────────────
      try {
        // Intent detection — web search gerekiyor mu?
        let enrichedMessage = userMessage;
        const intent = await detectIntent(userMessage, config);
        if (intent.search && intent.keywords) {
          process.stdout.write(chalk.dim(`\n  🌍 Searching: "${intent.keywords}"... `));
          enrichedMessage = await enrichWithSearch(userMessage, intent.keywords);
          console.log(chalk.green('✓'));
        }

        // Bağlamı session-memory'den oluştur. Yeni mesajı runAgent ekleyecek;
        // burada tekrar eklersek model aynı isteği iki kez görür.
        const contextHistory = buildContextMessages();

        const abortController = new AbortController();
        const onKeypress = (str: string, key: any) => {
          if (key && key.name === 'escape') {
            abortController.abort();
            process.stdout.write(chalk.red('\n[İptal edildi - ESC]\n'));
          }
        };
        process.stdin.on('keypress', onKeypress);

        let fullResponse = '';
        try {
          fullResponse = await runAgent(enrichedMessage, config, contextHistory, abortController.signal);
        } finally {
          process.stdin.removeListener('keypress', onKeypress);
        }

        // history array'ine ekle (agent ve /file uyumluluğu için)
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: fullResponse });

        // Session memory'ye ekle (context compression için)
        await appendMessage({ role: 'user', content: userMessage });
        await appendMessage({ role: 'assistant', content: fullResponse });

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
          console.log(
            chalk.dim('  📦 Context compressed') +
            chalk.dim(` — ${stats.messages} mesaj korundu, `) +
            chalk.dim(`~${Math.round(stats.usagePercent)}% kullanım\n`),
          );
        }

        console.log(chalk.dim('─'.repeat(50)) + '\n');
      } catch (err: unknown) {
        if ((err instanceof Error && err.name === 'AbortError') || (err instanceof Error && err.message.includes('canceled'))) {
          // İptal edildi sessizce yut (hata catch dışında handle edildi)
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.red('\n✗ Hata: ') + message + '\n');
        }
      }

      prompt();
  };

  rl.on('SIGINT', async () => {
    await exitCleanup(history, config);
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    await closeMemory().catch(() => {});
    process.exit(0);
  });

  prompt();
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

async function exitCleanup(history: Message[], config: DehaConfig): Promise<void> {
  await closeMemory().catch(() => {});
  stopServices();

  let sessionId: string | null = null;
  if (history.length >= 2) {
    const filePath = saveConversation(history, config.provider, getActiveModel(config));
    if (filePath) {
      sessionId = path.basename(filePath, '.md');
    }
  }

  await mcpManager.disconnectAll().catch(() => {});
  console.log(chalk.dim('Görüşürüz! 👋'));
  if (sessionId) {
    console.log(chalk.dim('To continue this session, run: ') + chalk.cyan(`deha resume ${sessionId}`) + '\n');
  } else {
    console.log();
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
    console.error(chalk.red(`✗ Dosya okunamadı: ${filePath}\n`));
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

