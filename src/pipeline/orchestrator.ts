import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message } from '../services/ai-service';
import { runPlanner } from './planner';
import { decideNeedPlan, runCoder } from './coder';
import { JudgeVerdict, runJudge } from './judge';
import { parseEditBlocks, applyEditBlocks, parseNewFileBlocks, applyNewFileBlocks } from '../tools/edit';
import { logger } from '../services/logger';
import { buildStaticContextMessages } from '../services/session-memory';

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
  logger.write('\n' + colors[role](`${icons[role]} ${role} `) + chalk.dim(`[${provider} / ${model}]`) + '\n' + chalk.dim('─'.repeat(50)) + '\n');
}

function iterBadge(i: number, max: number) {
  logger.write(chalk.bgBlue.white(` ↻ İterasyon ${i}/${max} `) + '\n');
}

// ─── Ana Pipeline ───────────────────────────────────────────────────────────

export async function runPipeline(
  task: string,
  config: DehaConfig,
  history: Message[] = [],
  abortSignal?: AbortSignal,
): Promise<PipelineResult> {
  const { pipeline } = config;
  const maxIterations = Math.max(1, Math.min(pipeline.maxIterations || 5, 5));
  const staticContext = buildStaticContextMessages();
  
  logger.write(chalk.bold('\n╔══ DEHA TEAM PIPELINE ═════════════════════════╗'));
  logger.write(chalk.bold(`║  Task: `) + chalk.white(task.slice(0, 44).padEnd(44)) + chalk.bold('║'));
  logger.write(chalk.bold('╚═══════════════════════════════════════════════╝\n'));

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
    logger.write(chalk.magenta.bold('\n[1/3] 📐 PLANNER » CODER : ' + chalk.dim('Mimari plan hazırlanıyor...')));
    roleHeader(
      'PLANNER',
      getProviderLabel(pipeline.planner.provider),
      pipeline.planner.model,
    );
    let plannerOutput = '';
    
    // Planner'a tüm geçmişi (history) ve görevi (task) gönder
    const plannerTask = `Interactive Session Context:\n${history.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent Mission:\n${task}`;

    await runPlanner(plannerTask, config, (chunk) => {
      process.stdout.write(chalk.magenta(chunk));
      plannerOutput += chunk;
    }, abortSignal);
    process.stdout.write('\n');
    plan = plannerOutput.trim() || plan;
  } else {
    logger.write(chalk.dim(`\n  📐 Planner atlandı: ${planDecision.reason || 'coder direkt başlayabilir'}`));
  }

  let judgeFeedback: string | undefined;
  let iteration = 0;

  for (iteration = 1; iteration <= maxIterations; iteration++) {
    if (abortSignal?.aborted) throw new Error('Pipeline aborted by user.');

    if (iteration > 1) {
      logger.write(chalk.yellow.bold(`\n[RE-ITERATION] ⚖️  JUDGE » CODER : ` + chalk.dim('Hatalar gideriliyor...')));
    } else {
      logger.write(chalk.blue.bold(`\n[2/3] 💻 CODER » JUDGE : ` + chalk.dim('Kod yazılıyor...')));
    }
    
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
    }, abortSignal, staticContext);
    process.stdout.write('\n');
    code = coderOutput;

    // Apply New Files
    const newFiles = parseNewFileBlocks(coderOutput);
    if (newFiles.length > 0) {
      logger.write(chalk.dim(`\n  📂 ${newFiles.length} yeni dosya oluşturuluyor...`));
      const results = applyNewFileBlocks(newFiles);
      results.forEach((r) => logger.write(chalk.dim(`     ${r}`)));
    }

    // Apply Edits
    const editBlocks = parseEditBlocks(coderOutput);
    if (editBlocks.length > 0) {
      logger.write(chalk.dim(`\n  🖊️  ${editBlocks.length} EDIT bloğu uygulanıyor...`));
      const results = applyEditBlocks(editBlocks);
      results.forEach((r) => logger.write(chalk.dim(`     ${r}`)));
    }

    logger.write(chalk.yellow.bold(`\n[3/3] ⚖️  JUDGE » TEAM : ` + chalk.dim('Kod denetleniyor...')));
    roleHeader(
      'JUDGE',
      getProviderLabel(pipeline.judge.provider),
      pipeline.judge.model,
    );
    let judgeOutput = '';
    verdict = await runJudge(task, plan, code, config, (chunk) => {
      process.stdout.write(chalk.yellow(chunk));
      judgeOutput += chunk;
    }, abortSignal, staticContext);
    process.stdout.write('\n');

    if (verdict.pass) break;
    judgeFeedback = verdict.feedback || judgeOutput || verdict.raw;
  }

  // ── Özet ─────────────────────────────────────────────────────────────────
  if (verdict.pass) {
    logger.successBox('PIPELINE BAŞARILI', `Skor: ${verdict.score} • İterasyon: ${Math.min(iteration, maxIterations)}/${maxIterations}`);
  } else {
    logger.warningBox('PIPELINE TAMAMLANDI (Fail)', `Skor: ${verdict.score} • İterasyon: ${Math.min(iteration, maxIterations)}/${maxIterations}`);
  }

  return { plan, finalCode: code, verdict, iterations: Math.min(iteration, maxIterations) };
}
