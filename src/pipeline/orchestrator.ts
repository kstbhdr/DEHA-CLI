import chalk from 'chalk';
import { DehaConfig, getProviderLabel } from '../config';
import { Message } from '../services/ai-service';
import { runPlanner } from './planner';
import { runCoder } from './coder';
import { JudgeVerdict, runJudge } from './judge';
import { applyCoderOutput, currentFileEvidence } from './apply-output';
import { logger } from '../services/logger';
import { buildStaticContextMessages, getWorkDir, setActiveTask, updateActiveTask, completeActiveTask } from '../services/session-memory';

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
  abortSignal?.throwIfAborted();
  setActiveTask(task, 'Planner: prepare implementation plan');
  try {
    const result = await runPipelineStages(task, config, history, abortSignal);
    if (result.verdict.pass) completeActiveTask();
    else updateActiveTask({ taskState: 'INTERRUPTED', lastMeaningfulToolResult: result.verdict.feedback });
    return result;
  } catch (err) {
    updateActiveTask({ taskState: abortSignal?.aborted ? 'CANCELLED' : 'INTERRUPTED' });
    throw err;
  }
}

async function runPipelineStages(task: string, config: DehaConfig, history: Message[], abortSignal?: AbortSignal): Promise<PipelineResult> {
  const { pipeline } = config;
  const maxIterations = Math.max(1, Math.min(pipeline.maxIterations || 5, 5));
  const staticContext = [...buildStaticContextMessages(), ...history];
  const root = getWorkDir() || process.cwd();
  const touchedFiles = new Set<string>();
  const coderOutputs: string[] = [];
  
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

  {
    logger.write(chalk.magenta.bold('\n[1/3] 📐 PLANNER » CODER : ' + chalk.dim('Mimari plan hazırlanıyor...')));
    roleHeader(
      'PLANNER',
      getProviderLabel(pipeline.planner.provider),
      pipeline.planner.model,
    );
    let plannerOutput = '';
    
    // Planner'a tüm geçmişi (history) ve görevi (task) gönder
    const plannerTask = `Interactive Session Context:\n${history.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent Mission:\n${task}`;

    const returnedPlan = await runPlanner(plannerTask, config, (chunk) => {
      process.stdout.write(chalk.magenta(chunk));
      plannerOutput += chunk;
    }, abortSignal, true);
    process.stdout.write('\n');
    plan = returnedPlan.trim() || plannerOutput.trim();
    if (!plan) throw new Error('Planner returned an empty plan.');
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
    updateActiveTask({ currentObjective: `Coder: iteration ${iteration}/${maxIterations}`, taskState: 'ACTIVE' });

    let coderOutput = '';
    const returnedCode = await runCoder(plan, config, judgeFeedback, code || undefined, (chunk) => {
      process.stdout.write(chalk.blue(chunk));
      coderOutput += chunk;
    }, abortSignal, staticContext);
    abortSignal?.throwIfAborted();
    process.stdout.write('\n');
    coderOutput = returnedCode || coderOutput;
    coderOutputs.push(coderOutput);
    code = coderOutputs.map((output, i) => `## CODER ITERATION ${i + 1}\n${output}`).join('\n\n');

    const applications = await applyCoderOutput(coderOutput, root, config, abortSignal);
    for (const applied of applications) {
      logger.write(chalk.dim(`     ${applied.result}`));
      if (applied.file) touchedFiles.add(applied.file);
    }
    const failures = applications.filter(r => !r.success);
    const applicationReport = applications.map(r => r.result).join('\n') +
      '\n\nCURRENT FILES (disk evidence, not test execution):\n' + currentFileEvidence(touchedFiles);

    logger.write(chalk.yellow.bold(`\n[3/3] ⚖️  JUDGE » TEAM : ` + chalk.dim('Kod denetleniyor...')));
    roleHeader(
      'JUDGE',
      getProviderLabel(pipeline.judge.provider),
      pipeline.judge.model,
    );
    let judgeOutput = '';
    updateActiveTask({ currentObjective: `Judge: review iteration ${iteration}/${maxIterations}` });
    verdict = await runJudge(task, plan, code, config, (chunk) => {
      process.stdout.write(chalk.yellow(chunk));
      judgeOutput += chunk;
    }, abortSignal, staticContext, applicationReport);
    abortSignal?.throwIfAborted();
    if (failures.length) {
      verdict = { ...verdict, pass: false, feedback: failures.map(r => r.result).join('\n') + '\n' + verdict.feedback };
    }
    process.stdout.write('\n');

    if (verdict.pass) break;
    judgeFeedback = (verdict.feedback || judgeOutput || verdict.raw) + '\n\n' + applicationReport;
  }

  // ── Özet ─────────────────────────────────────────────────────────────────
  if (verdict.pass) {
    logger.successBox('PIPELINE BAŞARILI', `Skor: ${verdict.score} • İterasyon: ${Math.min(iteration, maxIterations)}/${maxIterations}`);
  } else {
    logger.warningBox('PIPELINE TAMAMLANDI (Fail)', `Skor: ${verdict.score} • İterasyon: ${Math.min(iteration, maxIterations)}/${maxIterations}`);
  }

  return { plan, finalCode: code, verdict, iterations: Math.min(iteration, maxIterations) };
}
