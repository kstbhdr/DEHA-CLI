import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { runPlanner } from './planner';
import { decideNeedPlan, runCoder } from './coder';
import { decideNeedJudge, runJudge, JudgeVerdict } from './judge';
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

  let plan = `Task: ${task}\n\nImplement directly without a separate planner pass unless the task proves more complex during coding.`;
  const planDecision = await decideNeedPlan(task, config);
  console.log(chalk.dim(`\n  🧭 Coder routing: ${planDecision.raw}`));

  if (planDecision.needPlan) {
    roleHeader(
      'PLANNER',
      getProviderLabel(pipeline.planner.provider),
      pipeline.planner.model,
    );

    plan = '';
    await runPlanner(task, config, (chunk) => {
      process.stdout.write(chalk.magenta(chunk));
      plan += chunk;
    });
    process.stdout.write('\n');
  } else {
    console.log(chalk.dim('  ↳ Planner atlandı, coder doğrudan çalışacak.'));
  }

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

    const judgeForced = isJudgeRequired(task, code);
    const judgeDecision = judgeForced
      ? { needJudge: true, reason: 'Risk heuristic triggered.', raw: 'JUDGE: Risk heuristic triggered.' }
      : await decideNeedJudge(task, plan, code, config);

    console.log(chalk.dim(`\n  ⚖ Routing: ${judgeDecision.raw}`));

    if (!judgeDecision.needJudge) {
      verdict = {
        pass: true,
        score: 'SKIPPED',
        feedback: judgeDecision.reason || 'Coder marked the task as complete without formal judge review.',
        raw: judgeDecision.raw,
      };
      console.log(chalk.bgGreen.black(` ✓ DONE `) + chalk.green(' • Judge atlandı'));
      break;
    }

    // JUDGE
    roleHeader(
      'JUDGE',
      getProviderLabel(pipeline.judge.provider),
      pipeline.judge.model,
    );

    verdict = await runJudge(task, plan, code, config, (chunk) => {
      process.stdout.write(chalk.yellow(chunk));
    });
    process.stdout.write('\n');
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

function isJudgeRequired(task: string, code: string): boolean {
  const text = `${task}\n${code}`.toLowerCase();
  const riskyPatterns = [
    /\bauth\b.*\b(token|password|secret|jwt|oauth|session)\b/,
    /\b(authorization|authentication)\b/,
    /\b(hardcoded|plaintext)\b.*\b(secret|password|token|key)\b/,
    /\bpayment\b/,
    /\bbilling\b/,
    /\bdrop table\b/,
    /\bdatabase\b.*\b(migration|schema|drop|truncate)\b/,
    /\brm\s+-rf\b/,
    /\bsudo\b/,
    /\beval\s*\(/,
    /\bexec\s*\(/,
    /\bchild_process\b/,
    /\bshell\s*\(/,
    /\bunsafe\b/,
    /\bsql\s*=\s*.*\+/,
  ];

  return riskyPatterns.some((pattern) => pattern.test(text));
}

