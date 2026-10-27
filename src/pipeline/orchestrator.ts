import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message } from '../services/ai-service';
import { runPlanner } from './planner';
import { runCoder, runCoderAgent } from './coder';
import { JudgeVerdict, runJudge } from './judge';
import { applyCoderOutput, currentFileEvidence, ApplicationResult } from './apply-output';
import { logger } from '../services/logger';
import { buildStaticContextMessages, getWorkDir, setActiveTask, updateActiveTask, completeActiveTask } from '../services/session-memory';
import { TaskPlan, createPlan, loadLatestPlan, pendingSteps, planPath, savePlan } from './task-plan';

export interface PipelineOptions {
  planner?: boolean; judge?: boolean; coderMode?: 'blocks' | 'agent';
  planOnly?: boolean; useSavedPlan?: boolean;
}
export interface PipelineResult {
  plan: string; finalCode: string; verdict: JudgeVerdict; iterations: number;
  success: boolean; judgeRan: boolean; status: 'planned' | 'applied' | 'reviewed' | 'failed'; taskFile: string;
}
export function pipelineHistory(history: Message[], tokens = 2000): string {
  const cap = Math.max(0, Math.floor(tokens * 3.5));
  return cap ? history.map(m => `${m.role}: ${m.content ?? ''}`).join('\n').slice(-cap) : '';
}

export async function runPipeline(task: string, config: DehaConfig, history: Message[] = [], signal?: AbortSignal, options: PipelineOptions = {}): Promise<PipelineResult> {
  signal?.throwIfAborted();
  const root = getWorkDir() || process.cwd();
  const saved = options.useSavedPlan ? loadLatestPlan(root) : undefined;
  if (saved && !pendingSteps(saved) && ['applied', 'reviewed'].includes(saved.status) && (options.judge ?? config.pipeline.judgeEnabled) === false) {
    logger.write(chalk.green('Saved task is already complete; no model requests made.'));
    return { plan: saved.plan, finalCode: '', verdict: { pass: false, score: 'not reviewed', feedback: 'Previously completed plan; Judge was not run again.', raw: '' }, iterations: 0, success: true, judgeRan: false, status: 'applied', taskFile: planPath(saved) };
  }
  const actualTask = saved?.task ?? task;
  if (!actualTask.trim()) throw new Error('A coding task or a saved plan is required.');
  setActiveTask(actualTask, 'Pipeline: prepare task plan');
  try {
    const result = await stages(actualTask, config, history, signal, options, root, saved);
    if (result.success && result.status !== 'planned') completeActiveTask();
    else if (!result.success) updateActiveTask({ taskState: 'INTERRUPTED', lastMeaningfulToolResult: result.verdict.feedback });
    return result;
  } catch (err) {
    updateActiveTask({ taskState: signal?.aborted ? 'CANCELLED' : 'INTERRUPTED' });
    try { const record = saved ?? loadLatestPlan(root); if (record.task === actualTask) { record.status = 'failed'; savePlan(record); } } catch { /* Planning may have failed before a record was created. */ }
    throw err;
  }
}

async function stages(task: string, config: DehaConfig, history: Message[], signal: AbortSignal | undefined, options: PipelineOptions, root: string, saved?: TaskPlan): Promise<PipelineResult> {
  const p = config.pipeline;
  const planner = options.planOnly || (!saved && (options.planner ?? p.plannerEnabled ?? true));
  const judge = !options.planOnly && (options.judge ?? p.judgeEnabled ?? true);
  const mode = options.coderMode ?? p.coderMode ?? 'blocks';
  const max = Math.max(1, Math.min(p.maxIterations || 5, 5));
  const context = buildStaticContextMessages();
  const relevant = pipelineHistory(history, p.historyTokens ?? 2000);
  let plan = saved?.plan ?? `## TASK\n${task}` + (relevant ? `\n\n## RELEVANT SESSION CONTEXT\n${relevant}` : '');
  logger.write(chalk.cyan(`\nPipeline: Planner ${planner ? 'on' : saved ? 'saved' : 'off'} / Coder ${mode} / Judge ${judge ? 'on' : 'off'}`));
  if (planner) {
    logger.write(chalk.magenta(`PLANNER: ${p.planner.provider} / ${p.planner.model}`));
    plan = await runPlanner(`Current mission:\n${task}\n\nRelevant session context:\n${relevant || '(none)'}\n\nReturn a complete plan with actionable Markdown checklist items (- [ ]). Include constraints, necessary references, and verification criteria; workers will not receive the session history.`, config, undefined, signal, true, mode === 'agent');
  }
  const record = saved ?? createPlan(root, task, plan);
  logger.write(chalk.dim(`Task plan: ${planPath(record)}`));
  let verdict: JudgeVerdict = { pass: false, score: 'not reviewed', feedback: 'Judge was not run.', raw: '' };
  let judgeRan = false, code = '', feedback: string | undefined;
  const outputs: string[] = [], touched = new Set<string>();
  function finish(status: PipelineResult['status'], iterations: number): PipelineResult {
    record.status = status; savePlan(record);
    const success = status !== 'failed';
    logger.write(chalk[success ? 'green' : 'yellow'](`Pipeline: ${status}${judgeRan ? ` / Judge ${verdict.pass ? 'PASS' : 'FAIL'}` : ' / Judge not run'}`));
    return { plan: record.plan, finalCode: outputs.join('\n\n'), verdict, iterations, success, status, judgeRan, taskFile: planPath(record) };
  }
  if (options.planOnly) return finish('planned', 0);
  for (let iteration = 1; iteration <= max; iteration++) {
    signal?.throwIfAborted(); record.status = 'coding'; savePlan(record);
    updateActiveTask({ currentObjective: `Coder: ${iteration}/${max}`, taskState: 'ACTIVE' });
    logger.write(chalk.blue(`CODER: ${p.coder.provider} / ${p.coder.model} (${iteration}/${max})`));
    let applications: ApplicationResult[], tools = '';
    if (mode === 'agent') {
      const result = await runCoderAgent(record, config, feedback, signal, context);
      code = result.code; applications = result.applications; tools = result.toolEvidence;
    } else {
      code = await runCoder(record.plan, config, feedback, code || undefined, chunk => logger.raw(chunk), signal, context);
      signal?.throwIfAborted(); applications = await applyCoderOutput(code, root, config, signal);
      for (const match of code.matchAll(/^STEP_DONE:\s*(\d+)\s*\|\s*(.+)$/gim)) {
        const step = record.steps[Number(match[1]) - 1];
        if (step && match[2].trim().length >= 10 && applications.every(r => r.success)) { step.status = 'done'; step.evidence = match[2].trim().slice(0, 600); }
      }
    }
    outputs.push(code);
    for (const a of applications) { logger.write(chalk.dim(a.result)); if (a.file) touched.add(a.file); }
    const failures = applications.filter(r => !r.success);
    const report = applications.map(r => r.result).join('\n') + '\n\nTOOL EXECUTION EVIDENCE:\n' + tools + '\n\nCURRENT FILES (not proof that tests ran):\n' + currentFileEvidence(touched);
    if (!judge && pendingSteps(record) && !failures.some(r => r.result.includes('open steps'))) failures.push({ file: '', success: false, result: 'HATA: Saved plan has open steps:\n' + pendingSteps(record) });
    if (judge && (mode === 'blocks' || !failures.length)) {
      updateActiveTask({ currentObjective: `Judge: ${iteration}/${max}` });
      logger.write(chalk.yellow(`JUDGE: ${p.judge.provider} / ${p.judge.model}`));
      const reviewCode = mode === 'agent' ? `## EXECUTED CODER ACTIONS\n${report}\n\n## CODER REPORT\n${code}` : code;
      verdict = await runJudge(task, record.plan, reviewCode, config, chunk => logger.raw(chunk), signal, context, report, mode === 'agent');
      judgeRan = true;
      if (failures.length) verdict = { ...verdict, pass: false, feedback: failures.map(r => r.result).join('\n') + '\n' + verdict.feedback };
      if (verdict.pass) {
        for (const step of record.steps) if (step.status !== 'done') { step.status = 'done'; step.evidence = 'Judge reviewed the complete applied task: ' + verdict.score; }
        signal?.throwIfAborted(); return finish('reviewed', iteration);
      }
      feedback = verdict.feedback + '\n\n' + report;
      if (mode === 'agent' && !pendingSteps(record)) record.steps.push({ text: `Address Judge feedback from iteration ${iteration}`, status: 'todo' });
    } else {
      if (!failures.length) { signal?.throwIfAborted(); return finish('applied', iteration); }
      verdict.feedback = failures.map(r => r.result).join('\n'); feedback = verdict.feedback + '\n\n' + report;
    }
    savePlan(record);
  }
  return finish('failed', max);
}
