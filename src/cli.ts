import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, Provider, DehaConfig } from './config';
import { interactive } from './commands/interactive';
import { chat } from './commands/chat';
import { setup } from './commands/setup';
import { runPipeline } from './pipeline/orchestrator';
import { runUpdate, checkForUpdates } from './commands/update';
import { handleMcpCommand } from './mcp/commands';
import { handleHistoryCommand } from './conversations/commands';
import { runCommand } from './tools/terminal';
import { runPythonCode } from './tools/python';
import { runSmokeTests, buildQuickChecks, printSmokeReport } from './tools/smoke';
import { takeScreenshot } from './tools/browser';
import { screenshotAndAnalyze } from './tools/vision';
import { doctor } from './commands/doctor';
import { initCommand } from './commands/init';
import { runSystemTest } from './commands/test-runner';
import { loadConversationMessages } from './conversations/manager';

export class DehaCLI {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.init();
  }

  private init(): void {
    this.program
      .name('deha')
      .description(chalk.bold('DEHA') + ' — Akıllı AI Kodlama Asistanı')
      .version('1.0.0', '-v, --version', 'Sürümü göster')
      .option('-p, --provider <provider>', 'Provider: claude|openai|deepseek|ollama|openrouter|xai|custom')
      .option('-k, --api-key <key>', 'API anahtarını doğrudan gir')
      .option('-u, --url <url>', 'Custom API endpoint URL (custom provider için)');

    // ── deha chat "soru" ──────────────────────────────────────────────────
    this.program
      .command('chat <prompt>')
      .description('Tek seferlik streaming soru')
      .action(async (prompt: string) => {
        const config = this.buildConfig();
        try {
          await chat(prompt, config);
        } catch (err: unknown) {
          console.error(chalk.red('Hata: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha build "görev" ────────────────────────────────────────────────
    this.program
      .command('build <task>')
      .description('Plan → Code → Judge pipeline\'ını çalıştır')
      .option('--planner-provider <p>', 'Planner provider')
      .option('--planner-model <m>',    'Planner model')
      .option('--planner-key <k>',      'Planner API key')
      .option('--coder-provider <p>',   'Coder provider')
      .option('--coder-model <m>',      'Coder model')
      .option('--coder-key <k>',        'Coder API key')
      .option('--judge-provider <p>',   'Judge provider')
      .option('--judge-model <m>',      'Judge model')
      .option('--judge-key <k>',        'Judge API key')
      .option('--judge-url <u>',        'Judge custom API URL')
      .option('--planner-url <u>',      'Planner custom API URL')
      .option('--coder-url <u>',        'Coder custom API URL')
      .option('--iterations <n>',       'Max iterasyon sayısı', '200')
      .action(async (task: string, opts) => {
        const config = this.buildConfig();

        // CLI flag'leri pipeline config'ini override eder
        if (opts.plannerProvider) config.pipeline.planner.provider = opts.plannerProvider as Provider;
        if (opts.plannerModel)    config.pipeline.planner.model    = opts.plannerModel;
        if (opts.plannerKey)      config.pipeline.planner.apiKey   = opts.plannerKey;
        if (opts.coderProvider)   config.pipeline.coder.provider   = opts.coderProvider as Provider;
        if (opts.coderModel)      config.pipeline.coder.model      = opts.coderModel;
        if (opts.coderKey)        config.pipeline.coder.apiKey     = opts.coderKey;
        if (opts.judgeProvider)   config.pipeline.judge.provider   = opts.judgeProvider as Provider;
        if (opts.judgeModel)      config.pipeline.judge.model      = opts.judgeModel;
        if (opts.judgeKey)        config.pipeline.judge.apiKey     = opts.judgeKey;
        if (opts.judgeUrl)        config.pipeline.judge.apiUrl     = opts.judgeUrl;
        if (opts.plannerUrl)      config.pipeline.planner.apiUrl   = opts.plannerUrl;
        if (opts.coderUrl)        config.pipeline.coder.apiUrl     = opts.coderUrl;
        if (opts.iterations)      config.pipeline.maxIterations    = parseInt(opts.iterations, 10);

        try {
          await runPipeline(task, config);
        } catch (err: unknown) {
          console.error(chalk.red('\nPipeline hatası: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha judge <file> <task...> ──────────────────────────────────────────
    this.program
      .command('judge <file> <task...>')
      .description('Sadece Judge rolünü çalıştırarak bir dosyayı değerlendir')
      .action(async (file: string, taskParts: string[]) => {
        const config = this.buildConfig();
        const task = taskParts.join(' ');
        const fs = await import('fs');
        if (!fs.existsSync(file)) {
          console.error(chalk.red(`✗ Dosya bulunamadı: ${file}`));
          process.exit(1);
        }
        const code = fs.readFileSync(file, 'utf-8');
        try {
          console.log(chalk.bold(`\n⚖️  JUDGE çalışıyor... [Dosya: ${file}]`));
          const { runJudge } = await import('./pipeline/judge');
          const verdict = await runJudge(task, 'Manuel Değerlendirme (No Plan)', code, config, (chunk) => {
            process.stdout.write(chalk.yellow(chunk));
          });
          console.log('\n' + chalk.bold('─'.repeat(40)));
          if (verdict.pass) {
            console.log(chalk.bgGreen.black(` ✓ PASS `) + chalk.green(` • Skor: ${verdict.score}`));
          } else {
            console.log(chalk.bgRed.white(` ✗ FAIL `) + chalk.red(` • Skor: ${verdict.score}`));
          }
        } catch (err: unknown) {
          console.error(chalk.red('\nJudge hatası: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha setup ────────────────────────────────────────────────────────
    this.program
      .command('setup')
      .description('Bağlantıları test et ve kurulumu doğrula')
      .action(async () => {
        const config = this.buildConfig();
        await setup(config);
      });

    // ── deha update ───────────────────────────────────────────────────────
    this.program
      .command('update')
      .description('Güncelleme kontrol et ve kur')
      .action(async () => { await runUpdate(); });

    // ── deha mcp <alt-komut> ──────────────────────────────────────────────
    this.program
      .command('mcp [args...]')
      .description('MCP sunucu yönetimi (list, install, add, remove, catalog)')
      .action(async (args: string[]) => {
        await handleMcpCommand(args.join(' '));
      });

    // ── deha history [args] ───────────────────────────────────────────────
    this.program
      .command('history [args...]')
      .description('Eski sohbetleri listele veya görüntüle')
      .action(async (args: string[]) => {
        await handleHistoryCommand(args.join(' '));
      });

    // ── deha run <komut> ─────────────────────────────────────────────────
    this.program
      .command('run <command...>')
      .description('Terminal komutu çalıştır (streaming output)')
      .option('-d, --dir <path>', 'Çalışma dizini')
      .option('-t, --timeout <sec>', 'Timeout saniye', '60')
      .action(async (cmdParts: string[], opts) => {
        const cmd = cmdParts.join(' ');
        try {
          const r = await runCommand(cmd, {
            cwd: opts.dir,
            timeout: parseInt(opts.timeout, 10) * 1000,
            stream: true, shell: true,
          });
          process.exit(r.exitCode);
        } catch (err: unknown) {
          console.error(chalk.red('Hata: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha python <dosya veya -c kod> ─────────────────────────────────
    this.program
      .command('python [file]')
      .description('Python dosyası veya satır içi kodu çalıştır')
      .option('-c, --code <code>', 'Çalıştırılacak Python kodu')
      .option('-p, --packages <pkgs>', 'Kurulacak pip paketleri (virgülle)')
      .option('--venv', 'Sanal ortam kullan')
      .action(async (file: string | undefined, opts) => {
        const { runPythonCode: rpc, detectPython } = await import('./tools/python');
        const python = await detectPython();
        if (!python) { console.error(chalk.red('Python bulunamadı')); process.exit(1); }
        const code = opts.code ?? (file ? require('fs').readFileSync(file, 'utf-8') : '');
        if (!code) { console.error(chalk.red('Kod veya dosya gerekli')); process.exit(1); }
        const packages = opts.packages ? opts.packages.split(',').map((s: string) => s.trim()) : [];
        const r = await rpc(code, { installPackages: packages });
        if (r.stdout) process.stdout.write(r.stdout);
        if (r.stderr) process.stderr.write(r.stderr);
        process.exit(r.exitCode);
      });

    // ── deha smoketest <url> ─────────────────────────────────────────────
    this.program
      .command('smoketest <url>')
      .description('HTTP smoke testleri çalıştır')
      .option('-r, --routes <routes>', 'Test edilecek rotalar (virgülle)', '/')
      .option('-s, --status <code>', 'Beklenen status kodu')
      .option('-m, --max-ms <ms>', 'Maksimum yanıt süresi')
      .action(async (url: string, opts) => {
        const routes = opts.routes.split(',').map((r: string) => r.trim());
        const checks = buildQuickChecks(url, routes);
        if (opts.status) checks.forEach((c) => { c.expectedStatus = parseInt(opts.status, 10); });
        if (opts.maxMs)  checks.forEach((c) => { c.maxMs = parseInt(opts.maxMs, 10); });
        const report = await runSmokeTests(checks);
        printSmokeReport(report);
        process.exit(report.failed > 0 ? 1 : 0);
      });

    // ── deha screenshot <url> ────────────────────────────────────────────
    this.program
      .command('screenshot <url>')
      .description('Web sayfasının ekran görüntüsünü al')
      .option('-o, --output <path>', 'Kayıt yolu')
      .option('--full-page', 'Tüm sayfayı yakala')
      .option('-w, --wait <ms>', 'Sayfa yükleme bekleme (ms)', '1500')
      .action(async (url: string, opts) => {
        try {
          process.stdout.write(chalk.dim('Screenshot alınıyor... '));
          const p = await takeScreenshot(url, {
            fullPage: opts.fullPage,
            outputPath: opts.output,
            waitMs: parseInt(opts.wait, 10),
          });
          console.log(chalk.green('✓'));
          console.log(chalk.dim(`Kaydedildi: ${p}`));
        } catch (err: unknown) {
          console.error(chalk.red('\nHata: ') + (err instanceof Error ? err.message : String(err)));
          console.log(chalk.dim('Playwright için: npx playwright install chromium'));
          process.exit(1);
        }
      });

    // ── deha vision <url veya dosya> ─────────────────────────────────────
    this.program
      .command('vision <target>')
      .description('URL veya görüntü dosyasını vision model ile analiz et')
      .option('-q, --prompt <text>', 'Vision modele özel soru')
      .option('--full-page', 'Tam sayfa screenshot')
      .action(async (target: string, opts) => {
        const config = this.buildConfig();
        try {
          if (target.startsWith('http')) {
            process.stdout.write(chalk.dim('Screenshot + analiz yapılıyor...\n\n'));
            const { screenshotPath, analysis } = await screenshotAndAnalyze(target, config, {
              prompt: opts.prompt, fullPage: opts.fullPage,
            });
            console.log(chalk.dim(`Screenshot: ${screenshotPath}\n`));
            console.log(analysis);
          } else {
            const { analyzeExistingImage } = await import('./tools/vision');
            const analysis = await analyzeExistingImage(target, config, opts.prompt);
            console.log(analysis);
          }
        } catch (err: unknown) {
          console.error(chalk.red('Hata: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha stats ────────────────────────────────────────────────────────
    this.program
      .command('stats')
      .description('Token usage and cost statistics (daily/weekly/monthly)')
      .action(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { printStats } = require('./services/usage-tracker');
        printStats();
      });

    // ── deha init ─────────────────────────────────────────────────────────
    this.program
      .command('init')
      .description('Proje başlatma: .env, API keys, MCP, Playwright kurulumu')
      .action(async () => {
        await initCommand();
      });

    // ── deha resume <id> ──────────────────────────────────────────────────
    this.program
      .command('resume <id>')
      .description('Önceki bir sohbeti ID ile devam ettir')
      .action(async (id: string) => {
        const config = this.buildConfig();
        const messages = loadConversationMessages(id);
        if (!messages) {
          console.error(chalk.red(`✗ Sohbet bulunamadı: ${id}`));
          process.exit(1);
        }
        await interactive(config, messages);
      });

    // ── deha test ─────────────────────────────────────────────────────────
    this.program
      .command('test')
      .description('API bağlantı ve pipeline entegrasyon testleri')
      .action(async () => {
        const config = this.buildConfig();
        try {
          await runSystemTest(config);
        } catch (err: unknown) {
          console.error(chalk.red('\nTest hatası: ') + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      });

    // ── deha doctor ──────────────────────────────────────────────────────
    this.program
      .command('doctor')
      .description('Sistem tanılaması: bağımlılık, config ve ortam kontrolleri')
      .action(async () => {
        await doctor();
      });

    // ── deha (default: interaktif mod) ────────────────────────────────────
    this.program.action(async () => {
      const config = this.buildConfig();
      await interactive(config);
    });
  }

  private buildConfig(): DehaConfig {
    const opts = this.program.opts();
    const overrides: Partial<DehaConfig> = {};
    if (opts.provider) overrides.provider = opts.provider as Provider;
    if (opts.url)      overrides.customApiUrl = opts.url;
    if (opts.apiKey) {
      const p = (opts.provider as Provider) || (process.env.DEHA_PROVIDER as Provider) || 'claude';
      if (p === 'claude')      overrides.anthropicApiKey  = opts.apiKey;
      if (p === 'openai')      overrides.openaiApiKey     = opts.apiKey;
      if (p === 'deepseek')    overrides.deepseekApiKey   = opts.apiKey;
      if (p === 'openrouter')  overrides.openrouterApiKey = opts.apiKey;
      if (p === 'xai')         overrides.xaiApiKey        = opts.apiKey;
      if (p === 'custom')      overrides.customApiKey     = opts.apiKey;
    }
    return getConfig(overrides);
  }

  async run(): Promise<void> {
    if (process.argv.length === 2) {
      const config = this.buildConfig();
      await interactive(config);
      return;
    }
    await this.program.parseAsync(process.argv);
  }
}
