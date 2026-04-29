/**
 * DEHA System Test — /test komutu
 *
 * 1. API bağlantı testleri (Chat / Planner / Coder / Judge / Vision)
 * 2. Pipeline entegrasyon testi (hardcoded prompt → Planner → Coder → Judge)
 */

import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { sendMessage } from '../services/ai-service';
import { callRole } from '../services/ai-service';
import { runPlanner } from '../pipeline/planner';
import { runCoder }   from '../pipeline/coder';
import { runJudge }   from '../pipeline/judge';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const TEST_PROMPT = 'Write a TypeScript function called `add` that takes two numbers and returns their sum. Include a JSDoc comment.';

const PASS  = chalk.bgGreen.black(' PASS ');
const FAIL  = chalk.bgRed.white(' FAIL ');
const SKIP  = chalk.bgGray.white(' SKIP ');
const ARROW = chalk.dim('  →  ');

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function header(title: string) {
  console.log('\n' + chalk.bold.cyan('━'.repeat(54)));
  console.log(chalk.bold.cyan(`  ${title}`));
  console.log(chalk.bold.cyan('━'.repeat(54)));
}

function result(label: string, ok: boolean | null, detail = '') {
  const badge = ok === null ? SKIP : ok ? PASS : FAIL;
  const text  = detail ? chalk.dim(ARROW + detail) : '';
  console.log(`  ${badge}  ${label}${text}`);
}

function ms(start: number) {
  return chalk.dim(`${Date.now() - start}ms`);
}

// ─── 1. API bağlantı testleri ─────────────────────────────────────────────────

async function testApi(
  label: string,
  fn: () => Promise<string>,
): Promise<{ ok: boolean; detail: string }> {
  const t = Date.now();
  try {
    const res = await fn();
    const preview = res.trim().slice(0, 60).replace(/\n/g, ' ');
    return { ok: true, detail: `${ms(t)}  "${preview}…"` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80);
    return { ok: false, detail: `${ms(t)}  ${msg}` };
  }
}

export async function runSystemTest(config: DehaConfig): Promise<void> {
  const summary: { label: string; ok: boolean | null }[] = [];

  // ── 1. API Testleri ────────────────────────────────────────────────────────
  header('1 / 2  —  API Bağlantı Testleri');

  const ping = [{ role: 'user' as const, content: 'Reply with exactly: OK' }];

  // Chat provider
  {
    const label = `Chat  [${getProviderLabel(config.provider)} / ${_chatModel(config)}]`;
    process.stdout.write(`  ⏳ ${label}…\r`);
    const r = await testApi(label, () => sendMessage(ping, config));
    result(label, r.ok, r.detail);
    summary.push({ label: 'Chat API', ok: r.ok });
  }

  // Planner
  {
    const p = config.pipeline.planner;
    const label = `Planner  [${getProviderLabel(p.provider)} / ${p.model}]`;
    process.stdout.write(`  ⏳ ${label}…\r`);
    const r = await testApi(label, () =>
      callRole(p, config, ping, 'Reply with exactly: OK'),
    );
    result(label, r.ok, r.detail);
    summary.push({ label: 'Planner API', ok: r.ok });
  }

  // Coder
  {
    const p = config.pipeline.coder;
    const label = `Coder  [${getProviderLabel(p.provider)} / ${p.model}]`;
    process.stdout.write(`  ⏳ ${label}…\r`);
    const r = await testApi(label, () =>
      callRole(p, config, ping, 'Reply with exactly: OK'),
    );
    result(label, r.ok, r.detail);
    summary.push({ label: 'Coder API', ok: r.ok });
  }

  // Judge
  {
    const p = config.pipeline.judge;
    const label = `Judge  [${getProviderLabel(p.provider)} / ${p.model}]`;
    process.stdout.write(`  ⏳ ${label}…\r`);
    const r = await testApi(label, () =>
      callRole(p, config, ping, 'Reply with exactly: OK'),
    );
    result(label, r.ok, r.detail);
    summary.push({ label: 'Judge API', ok: r.ok });
  }

  // ── 2. Pipeline Entegrasyon Testi ─────────────────────────────────────────
  header('2 / 2  —  Pipeline Entegrasyon Testi');
  console.log(chalk.dim(`  Prompt: "${TEST_PROMPT}"\n`));

  // PLANNER
  let plan = '';
  {
    const t = Date.now();
    process.stdout.write(chalk.magenta('  🧠 Planner çalışıyor…\r'));
    try {
      await runPlanner(TEST_PROMPT, config, chunk => { plan += chunk; });
      const preview = plan.trim().slice(0, 80).replace(/\n/g, ' ');
      result('Planner  → plan üretildi', true, `${ms(t)}  "${preview}…"`);
      summary.push({ label: 'Planner (pipeline)', ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
      result('Planner  → plan üretildi', false, msg);
      summary.push({ label: 'Planner (pipeline)', ok: false });
      plan = 'Write a TypeScript add() function.'; // fallback — devam et
    }
  }

  // CODER
  let code = '';
  {
    const t = Date.now();
    process.stdout.write(chalk.blue('  💻 Coder çalışıyor…\r'));
    try {
      await runCoder(plan, config, undefined, undefined, chunk => { code += chunk; });
      const hasFunction = /function\s+add|const\s+add|=>\s*\w+/.test(code);
      result(
        'Coder  → kod yazıldı',
        hasFunction,
        `${ms(t)}  ${hasFunction ? chalk.green('add() fonksiyonu bulundu') : chalk.red('add() fonksiyonu bulunamadı')}`,
      );
      summary.push({ label: 'Coder (pipeline)', ok: hasFunction });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
      result('Coder  → kod yazıldı', false, msg);
      summary.push({ label: 'Coder (pipeline)', ok: false });
      code = 'function add(a: number, b: number): number { return a + b; }';
    }
  }

  // JUDGE
  {
    const t = Date.now();
    process.stdout.write(chalk.yellow('  ⚖️  Judge çalışıyor…\r'));
    try {
      const verdict = await runJudge(TEST_PROMPT, plan, code, config);
      const verdictOk = verdict.pass || verdict.score !== '?/10';
      result(
        'Judge  → değerlendirme yapıldı',
        verdictOk,
        `${ms(t)}  ${chalk.bold(verdict.score)}  ${verdict.pass ? chalk.green('PASS') : chalk.red('FAIL')}  ${chalk.dim(verdict.feedback.slice(0, 60))}`,
      );
      summary.push({ label: 'Judge (pipeline)', ok: verdictOk });

      // Judge FAIL dönerse geri bildirimi göster
      if (!verdict.pass) {
        console.log(chalk.dim('\n  Judge geri bildirimi:'));
        console.log(chalk.yellow(verdict.feedback.split('\n').map(l => '    ' + l).join('\n')));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
      result('Judge  → değerlendirme yapıldı', false, msg);
      summary.push({ label: 'Judge (pipeline)', ok: false });
    }
  }

  // ── Özet ───────────────────────────────────────────────────────────────────
  header('Test Özeti');

  let passed = 0, failed = 0;
  for (const s of summary) {
    const ok = s.ok === null ? null : s.ok;
    if (ok === true)  passed++;
    if (ok === false) failed++;
    result(s.label, ok);
  }

  const total = passed + failed;
  const color = failed === 0 ? chalk.green : chalk.red;
  console.log('\n' + color(`  ${passed}/${total} test geçti`) + (failed > 0 ? chalk.red(`  (${failed} başarısız)`) : '') + '\n');
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function _chatModel(config: DehaConfig): string {
  const m: Record<string, string> = {
    claude: config.claudeModel, openai: config.openaiModel,
    deepseek: config.deepseekModel, openrouter: config.openrouterModel,
    xai: config.xaiModel, ollama: config.ollamaModel, custom: config.customModel,
  };
  return m[config.provider] ?? config.provider;
}
