import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { runPlanner } from './planner';
import { runCoder } from './coder';
import { runJudge, JudgeVerdict } from './judge';
import { parseEditBlocks, applyEditBlocks } from '../tools/edit';

export interface PipelineResult {
  plan: string;
  finalCode: string;
  verdict: JudgeVerdict;
  iterations: number;
}

// ─── Görsel yardımcılar ─────────────────────────────────────────────────────

function roleHeader(role: 'PLANNER' | 'CODER' | 'JUDGE', provider: string, model: string) {
  const colors = { PLANNER: chalk.magenta, CODER: chalk.blue, JUDGE: chalk.yellow };
  const icons  = { PLANNER: '🧠', CODER: '💻', JUDGE: '⚖️' };
  const color  = colors[role];
  console.log(
    '\n' + color('─'.repeat(52)) + '\n' +
    color(`${icons[role]}  ${role}`) +
    chalk.dim(`  [${provider} / ${model}]`) + '\n' +
    color('─'.repeat(52)),
  );
}

function iterBadge(n: number, max: number) {
  console.log(chalk.dim(`\n  ↻ İterasyon ${n}/${max}`));
}

function verdictLine(verdict: JudgeVerdict) {
  if (verdict.pass) {
    console.log('\n' + chalk.bgGreen.black(` ✓ PASS `) + chalk.green(` • ${verdict.score}`));
  } else {
    console.log('\n' + chalk.bgRed.white(` ✗ FAIL `) + chalk.red(` • ${verdict.score}`));
    console.log(chalk.dim('  Judge geri bildirimi:'));
    console.log(chalk.red(indent(verdict.feedback, 4)));
  }
}

function indent(text: string, n: number): string {
  return text.split('\n').map((l) => ' '.repeat(n) + l).join('\n');
}

// ─── Ana pipeline döngüsü ───────────────────────────────────────────────────

export async function runPipeline(
  task: string,
  config: DehaConfig,
): Promise<PipelineResult> {
  const { pipeline } = config;
  console.log(chalk.bold('\n╔══ DEHA PIPELINE ══════════════════════════════╗'));
  console.log(chalk.bold(`║  Görev: `) + chalk.white(task.slice(0, 44).padEnd(44)) + chalk.bold('║'));
  console.log(chalk.bold('╚═══════════════════════════════════════════════╝'));

  // ── PLANNER ──────────────────────────────────────────────────────────────
  roleHeader(
    'PLANNER',
    getProviderLabel(pipeline.planner.provider),
    pipeline.planner.model,
  );

  let plan = '';
  await runPlanner(task, config, (chunk) => {
    process.stdout.write(chalk.magenta(chunk));
    plan += chunk;
  });
  process.stdout.write('\n');

  // ── CODER + JUDGE döngüsü ─────────────────────────────────────────────
  let code = '';
  let verdict: JudgeVerdict = { pass: false, score: '0/10', feedback: '', raw: '' };
  let iteration = 0;
  let judgeFeedback: string | undefined;

  while (iteration < pipeline.maxIterations) {
    iteration++;
    iterBadge(iteration, pipeline.maxIterations);

    // CODER
    roleHeader(
      'CODER',
      getProviderLabel(pipeline.coder.provider),
      pipeline.coder.model,
    );

    const previousCode = iteration > 1 ? code : undefined;
    let coderOutput = '';
    await runCoder(plan, config, judgeFeedback, previousCode, (chunk) => {
      process.stdout.write(chalk.blue(chunk));
      coderOutput += chunk;
    });
    process.stdout.write('\n');

    // EDIT bloklarını uygula (revizyon turlarında token tasarrufu)
    const editBlocks = parseEditBlocks(coderOutput);
    if (editBlocks.length > 0) {
      console.log(chalk.dim(`\n  🖊️  ${editBlocks.length} EDIT bloğu uygulanıyor...`));
      const results = applyEditBlocks(editBlocks);
      results.forEach((r) => console.log(chalk.dim(`     ${r}`)));
      // code değişkenini EDIT'lerle güncellenmiş haliyle güncelle
      // (judge'a tüm kodu değil, diff'i göster)
      code = coderOutput;
    } else {
      code = coderOutput;
    }

    // JUDGE
    roleHeader(
      'JUDGE',
      getProviderLabel(pipeline.judge.provider),
      pipeline.judge.model,
    );

    let judgeRaw = '';
    await runJudge(task, plan, code, config, (chunk) => {
      process.stdout.write(chalk.yellow(chunk));
      judgeRaw += chunk;
    });
    process.stdout.write('\n');

    verdict = parseVerdictFromRaw(judgeRaw);
    verdictLine(verdict);

    if (verdict.pass) break;

    judgeFeedback = verdict.feedback;
  }

  // ── Özet ─────────────────────────────────────────────────────────────────
  console.log('\n' + chalk.bold('╔══ PIPELINE SONUCU ════════════════════════════╗'));
  console.log(chalk.bold('║  ') + (verdict.pass ? chalk.green('✓ BAŞARILI') : chalk.red('✗ BAŞARISIZ (max iterasyon doldu)')) + chalk.bold(''.padEnd(verdict.pass ? 36 : 19) + '  ║'));
  console.log(chalk.bold(`║  Skor: ${verdict.score}  •  İterasyon: ${iteration}/${pipeline.maxIterations}`.padEnd(50) + '║'));
  console.log(chalk.bold('╚═══════════════════════════════════════════════╝\n'));

  return { plan, finalCode: code, verdict, iterations: iteration };
}

function parseVerdictFromRaw(raw: string): JudgeVerdict {
  const passMatch  = /VERDICT:\s*(PASS|FAIL)/i.exec(raw);
  const scoreMatch = /SCORE:\s*([\d.]+\/10)/i.exec(raw);
  const pass  = passMatch ? passMatch[1].toUpperCase() === 'PASS' : false;
  const score = scoreMatch ? scoreMatch[1] : '?/10';
  const fixSection = raw.match(/## GEREKLİ DÜZELTİMLER\n([\s\S]*?)(?=##|$)/i);
  const feedback = fixSection ? fixSection[1].trim() : raw;
  return { pass, score, feedback, raw };
}
