import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { runCoder } from './coder';
import { JudgeVerdict } from './judge';
import { parseEditBlocks, applyEditBlocks } from '../tools/edit';
import { logger } from '../services/logger';

export interface PipelineResult {
  plan: string;
  finalCode: string;
  verdict: JudgeVerdict;
  iterations: number;
}

// ─── Görsel yardımcılar ─────────────────────────────────────────────────────

function roleHeader(role: 'CODER', provider: string, model: string) {
  const colors = { CODER: chalk.blue };
  const icons  = { CODER: '💻' };
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
  logger.write(chalk.bold('\n╔══ DEHA PIPELINE ══════════════════════════════╗'));
  logger.write(chalk.bold(`║  Görev: `) + chalk.white(task.slice(0, 44).padEnd(44)) + chalk.bold('║'));
  logger.write(chalk.bold('╚═══════════════════════════════════════════════╝'));

  const plan = `## TASK\n${task}`;
  let code = '';
  const iteration = 1;
  iterBadge(iteration, 1);

  roleHeader(
    'CODER',
    getProviderLabel(pipeline.coder.provider),
    pipeline.coder.model,
  );

  let coderOutput = '';
  await runCoder(plan, config, undefined, undefined, (chunk) => {
    process.stdout.write(chalk.blue(chunk));
    coderOutput += chunk;
  });
  process.stdout.write('\n');

  const editBlocks = parseEditBlocks(coderOutput);
  if (editBlocks.length > 0) {
    logger.write(chalk.dim(`\n  🖊️  ${editBlocks.length} EDIT bloğu uygulanıyor...`));
    const results = applyEditBlocks(editBlocks);
    results.forEach((r) => logger.write(chalk.dim(`     ${r}`)));
  }
  code = coderOutput;

  const verdict: JudgeVerdict = {
    pass: true,
    score: 'SKIPPED',
    feedback: 'Planner ve judge devre dışı; coder çıktısı nihai sonuç olarak kabul edildi.',
    raw: 'DONE: coder-only pipeline',
  };

  // ── Özet ─────────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold('╔══ PIPELINE SONUCU ════════════════════════════╗'));
  logger.write(chalk.bold('║  ') + chalk.green('✓ BAŞARILI') + chalk.bold(''.padEnd(36) + '  ║'));
  logger.write(chalk.bold(`║  Skor: ${verdict.score}  •  İterasyon: ${iteration}/1`.padEnd(50) + '║'));
  logger.write(chalk.bold('╚═══════════════════════════════════════════════╝\n'));

  return { plan, finalCode: code, verdict, iterations: iteration };
}
