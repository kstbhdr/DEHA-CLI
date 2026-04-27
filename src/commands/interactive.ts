import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message, streamMessage } from '../services/ai-service';
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

const BANNER = `
${chalk.bold.cyan('╔══════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}  ${chalk.bold.white('DEHA')} ${chalk.dim('— Akıllı Kodlama Asistanı')}         ${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')}  ${chalk.dim('v1.0.0  •  github.com/deha-cli')}         ${chalk.bold.cyan('║')}
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
  ${chalk.cyan('/exit')}                         Çıkış yap

${chalk.bold('@dosya.ts sözdizimi:')}
  Mesajın içine ${chalk.yellow('@./src/index.ts')} yazarak dosya içeriğini otomatik ekle.

${chalk.bold('MCP kısayolları:')}
  /mcp list    → sunucular   /mcp catalog → kurulabilecekler
  /mcp install filesystem   → dosya sistemi sunucusunu kur
`;

export async function interactive(config: DehaConfig): Promise<void> {
  console.log(BANNER);
  console.log(
    chalk.dim('Provider: ') + chalk.green(getProviderLabel(config.provider)) +
    chalk.dim('  |  Model: ') + chalk.yellow(getActiveModel(config)) + '\n',
  );
  console.log(chalk.dim('Çıkmak için /exit  •  Yardım için /help\n'));

  // MCP sunucularına bağlan (arka planda, hata sessiz geç)
  mcpManager.connectAll(true).catch(() => {});

  // Güncelleme kontrolü (sessiz, sadece yeni sürüm varsa bildir)
  checkForUpdates(true).catch(() => {});

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const history: Message[] = [];

  const prompt = () => {
    rl.question(chalk.bold.cyan('DEHA ❯ '), async (input) => {
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

      // ── /agent <soru> ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/agent ')) {
        const agentPrompt = trimmed.slice(7).trim();
        try {
          const response = await runAgent(agentPrompt, config, history);
          history.push({ role: 'user', content: agentPrompt });
          history.push({ role: 'assistant', content: response });
          if (history.length > 20) history.splice(0, 2);
          console.log(chalk.dim('\n' + '─'.repeat(50)) + '\n');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.red('\n✗ Hata: ') + message + '\n');
        }
        prompt(); return;
      }

      // ── @dosya.ts sözdizimi ───────────────────────────────────────────────
      const userMessage = resolveAtFiles(trimmed);

      // ── Normal streaming chat ─────────────────────────────────────────────
      try {
        // Intent detection — web search gerekiyor mu?
        let enrichedMessage = userMessage;
        const intent = await detectIntent(userMessage, config);
        if (intent.search && intent.keywords) {
          process.stdout.write(chalk.dim(`\n  🌍 Searching: "${intent.keywords}"... `));
          enrichedMessage = await enrichWithSearch(userMessage, intent.keywords);
          console.log(chalk.green('✓'));
        }

        const messages: Message[] = [...history, { role: 'user', content: enrichedMessage }];

        console.log('\n' + chalk.bold.cyan('DEHA:'));

        let fullResponse = '';
        await streamMessage(messages, config, (chunk) => {
          process.stdout.write(formatChunkLive(chunk));
          fullResponse += chunk;
        });
        process.stdout.write('\n');

        history.push({ role: 'user', content: userMessage }); // orijinal mesaj kaydedilir
        history.push({ role: 'assistant', content: fullResponse });
        if (history.length > 20) history.splice(0, 2);

        console.log(chalk.dim('─'.repeat(50)) + '\n');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red('\n✗ Hata: ') + message + '\n');
      }

      prompt();
    });
  };

  rl.on('SIGINT', async () => {
    await exitCleanup(history, config);
    process.exit(0);
  });

  prompt();
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

async function exitCleanup(history: Message[], config: DehaConfig): Promise<void> {
  if (history.length >= 2) {
    const filePath = saveConversation(history, config.provider, getActiveModel(config));
    if (filePath) {
      console.log(chalk.dim(`\n💾 Sohbet kaydedildi → ${filePath}`));
    }
  }
  await mcpManager.disconnectAll().catch(() => {});
  console.log(chalk.dim('Görüşürüz! 👋\n'));
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

/** Streaming sırasında kod bloğu header'larını renklendirir */
let _codeBlockOpen = false;
function formatChunkLive(chunk: string): string {
  // Basit live renklendirme: kod bloğu içindeyken cyan, değilse default
  let out = '';
  for (const ch of chunk) {
    if (chunk.includes('```')) _codeBlockOpen = !_codeBlockOpen;
    out += _codeBlockOpen ? chalk.cyan(ch) : ch;
  }
  return out;
}
