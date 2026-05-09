import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { runPlanner } from './planner';
import { decideNeedPlan, runCoder } from './coder';
import { JudgeVerdict, runJudge } from './judge';
import { parseEditBlocks, applyEditBlocks } from '../tools/edit';
import { logger } from '../services/logger';

export interface PipelineResult {
  plan: string;
  finalCode: string;
  verdict: JudgeVerdict;
  iterations: number;
}

// ─── Görsel yardımcılar ─────────────────────────────────────────────────────

function roleHeader(role: 'PLANNER' | 'CODER' | 'JUDGE', provider: string, model: string) {
  const colors = { PLANNER: chalk.magenta, CODER: chalk.blue, JUDGE: chalk.yellow };
  const icons  = { PLANNER: '📐', CODER: '💻', JUDGE: '⚖️ ' };
  const color  = colors[role];
  logger.write(
    '\n' + color('─'.repeat(52)) + '\n' +
    color(`${icons[role]}  ${role}`) +
    chalk.dim(`  [${provider} / ${model}]`) + '\n' +
    color('─'.repeat(52)),
  );
}

function iterBadge(n: number, max: number) {
  logger.write(chalk.dim(`\n  ↻ İterasyon ${n}/${max}`));
}

// ─── Ana pipeline döngüsü ───────────────────────────────────────────────────

export async function runPipeline(
  task: string,
  config: DehaConfig,
): Promise<PipelineResult> {
  const { pipeline } = config;
  const maxIterations = Math.max(1, Math.min(pipeline.maxIterations || 5, 5));
  logger.write(chalk.bold('\n╔══ DEHA PIPELINE ══════════════════════════════╗'));
  logger.write(chalk.bold(`║  Görev: `) + chalk.white(task.slice(0, 44).padEnd(44)) + chalk.bold('║'));
  logger.write(chalk.bold('╚═══════════════════════════════════════════════╝'));

  let plan = `## TASK\n${task}`;
  let code = '';
  let verdict: JudgeVerdict = {
    pass: false,
    score: '?/10',
    feedback: 'Judge henüz çalışmadı.',
    raw: '',
  };

  const planDecision = await decideNeedPlan(task, config);
  if (planDecision.needPlan) {
    roleHeader(
      'PLANNER',
      getProviderLabel(pipeline.planner.provider),
      pipeline.planner.model,
    );
    let plannerOutput = '';
    await runPlanner(task, config, (chunk) => {
      process.stdout.write(chalk.magenta(chunk));
      plannerOutput += chunk;
    });
    process.stdout.write('\n');
    plan = plannerOutput.trim() || plan;
  } else {
    logger.write(chalk.dim(`\n  📐 Planner atlandı: ${planDecision.reason || 'coder direkt başlayabilir'}`));
  }

  let judgeFeedback: string | undefined;
  let iteration = 0;

  for (iteration = 1; iteration <= maxIterations; iteration++) {
    iterBadge(iteration, maxIterations);

    roleHeader(
      'CODER',
      getProviderLabel(pipeline.coder.provider),
      pipeline.coder.model,
    );

    let coderOutput = '';
    await runCoder(plan, config, judgeFeedback, code || undefined, (chunk) => {
      process.stdout.write(chalk.blue(chunk));
      coderOutput += chunk;
    });
    process.stdout.write('\n');
    code = coderOutput;

    const editBlocks = parseEditBlocks(coderOutput);
    if (editBlocks.length > 0) {
      logger.write(chalk.dim(`\n  🖊️  ${editBlocks.length} EDIT bloğu uygulanıyor...`));
      const results = applyEditBlocks(editBlocks);
      results.forEach((r) => logger.write(chalk.dim(`     ${r}`)));
    }

    roleHeader(
      'JUDGE',
      getProviderLabel(pipeline.judge.provider),
      pipeline.judge.model,
    );
    let judgeOutput = '';
    verdict = await runJudge(task, plan, code, config, (chunk) => {
      process.stdout.write(chalk.yellow(chunk));
      judgeOutput += chunk;
    });
    process.stdout.write('\n');

    if (verdict.pass) break;
    judgeFeedback = verdict.feedback || judgeOutput || verdict.raw;
  }

  // ── Özet ─────────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold('╔══ PIPELINE SONUCU ════════════════════════════╗'));
  logger.write(chalk.bold('║  ') + (verdict.pass ? chalk.green('✓ BAŞARILI') : chalk.red('✗ JUDGE FAIL')) + chalk.bold(''.padEnd(36) + '  ║'));
  logger.write(chalk.bold(`║  Skor: ${verdict.score}  •  İterasyon: ${Math.min(iteration, maxIterations)}/${maxIterations}`.padEnd(50) + '║'));
  logger.write(chalk.bold('╚═══════════════════════════════════════════════╝\n'));

  return { plan, finalCode: code, verdict, iterations: Math.min(iteration, maxIterations) };
}
