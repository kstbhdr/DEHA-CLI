import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { CODER_PROMPT } from '../prompts.config';
import { PIPELINE_CODER_PROMPT } from '../prompts.config';
import { runAgent } from '../commands/agent';
import { configForRole } from './role-config';
import { TaskPlan, TASK_PLAN_TOOL, planTool, planPath, pendingSteps, checkpointContext } from './task-plan';
import { getActiveTask } from '../services/session-memory';
import { ApplicationResult, projectFilePath } from './apply-output';
import * as path from 'path';

export const CODER_TOOL_NAMES = ['read_file', 'cat', 'list_dir', 'ls', 'search_in_files', 'grep', 'find_files', 'write_file', 'edit_file', 'insert_lines', 'delete_lines', 'run_shell', 'run_terminal', 'run_python', 'git', 'start_job', 'wait_job', 'list_jobs', 'cancel_job', 'brain'];

export async function decideNeedPlan(
  task: string,
  config: DehaConfig,
): Promise<{ needPlan: boolean; reason: string; raw: string }> {
  const { pipeline } = config;
  const messages: Message[] = [{
    role: 'user',
    content: [
      'Task:',
      task,
      '',
      'Do you need a detailed implementation plan before coding?',
      'Reply in exactly one line:',
      'PLAN: <short reason>',
      'or',
      'CODE: <short reason>',
    ].join('\n'),
  }];

  const raw = await callRole(
    pipeline.coder,
    config,
    messages,
    'You are a routing gate for a coding pipeline. Reply with exactly one line: PLAN: <reason> or CODE: <reason>.',
    undefined,
    'coder',
  );

  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('PLAN:')) {
    return { needPlan: true, reason: trimmed.slice(5).trim(), raw: trimmed };
  }
  return {
    needPlan: false,
    reason: upper.startsWith('CODE:') ? trimmed.slice(5).trim() : trimmed,
    raw: trimmed,
  };
}

export async function runCoder(
  plan: string,
  config: DehaConfig,
  judgeFeedback?: string,
  previousCode?: string,
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  staticContext: Message[] = [],
): Promise<string> {
  const { pipeline } = config;

  let userContent = `## PLAN\n${plan}`;

  if (previousCode && judgeFeedback) {
    userContent +=
      `\n\n## PREVIOUS CODE\n\`\`\`\n${previousCode}\n\`\`\`` +
      `\n\n## JUDGE FEEDBACK — Fix only the issues below, use EDIT blocks for unchanged parts:\n${judgeFeedback}`;
  }

  const messages: Message[] = [...staticContext, { role: 'user', content: userContent }];
  return callRole(pipeline.coder, config, messages, CODER_PROMPT + '\nWhen the plan contains a checklist, report completed steps after the code as STEP_DONE: <1-based index> | <concrete file/test evidence>. Never mark incomplete work done.', onChunk, 'coder', undefined, abortSignal);
}

export async function runCoderAgent(record: TaskPlan, config: DehaConfig, feedback: string | undefined, signal?: AbortSignal, context: Message[] = [], checkpointIndex?: number): Promise<{ code: string; applications: ApplicationResult[]; toolEvidence: string }> {
  const changes = new Map<string, ApplicationResult>();
  const evidence: string[] = [];
  const phase = checkpointIndex === undefined ? undefined : record.checkpoints![checkpointIndex];
  const checks = new Map<string, boolean>();
  let executed = false;
  const coderConfig = configForRole(config, config.pipeline.coder, 'coder');
  if (phase && config.pipeline.coder.maxToolRounds === undefined) coderConfig.maxToolRounds = Math.min(coderConfig.maxToolRounds, 20);
  const result = await runAgent(
    (phase ? checkpointContext(record, checkpointIndex!) + '\nImplement ONLY this checkpoint. Submit evidence using task_plan update_step done; Planner decides approval. Run each declared command with run_shell using the project root as cwd. Commands and mutation paths must match the checkpoint scope exactly.' : `Implement the saved task.\nTASK: ${record.task}\nPLAN FILE: ${planPath(record)}\nPLAN:\n${record.plan}\nPENDING STEPS:\n${pendingSteps(record) || 'Address the review feedback.'}`) +
      (feedback ? `\nREQUIRED FIXES:\n${feedback}` : ''),
    coderConfig, context, signal,
    PIPELINE_CODER_PROMPT + '\n[CODER STAGE] Your COMPLETE tag finishes only this stage; the pipeline checks pending task_plan steps separately.',
    undefined,
    { taskAlreadyResolved: true, completeTask: false, sectioned: true, implementationGuard: true, appendUserMessage: true, stage: {
      allowedTools: phase ? CODER_TOOL_NAMES.filter(n => !['run_terminal', 'run_python', 'git', 'start_job', 'wait_job', 'list_jobs', 'cancel_job', 'brain'].includes(n)) : CODER_TOOL_NAMES,
      beforeTool: (name, input) => {
        if (!phase) return undefined;
        try {
          if (['write_file', 'edit_file', 'insert_lines', 'delete_lines'].includes(name)) {
            const target = projectFilePath(record.root, String(input.path ?? ''));
            if (!phase.files.some(f => projectFilePath(record.root, f) === target)) return 'HATA: File is outside the current checkpoint scope. Ask Planner to revise the scope.';
          }
          if (name === 'run_shell' && (!phase.commands.includes(String(input.command)) || path.resolve(String(input.cwd ?? record.root)) !== path.resolve(record.root))) return 'HATA: Run only an exact declared checkpoint command in the project root. Ask Planner for missing commands.';
        } catch (err) { return 'HATA: ' + String(err); }
        return undefined;
      },
      tools: [{ definition: TASK_PLAN_TOOL, execute: input => planTool(record, input) }],
      onToolResult: (name, input, output) => {
        const ok = !/^HATA:/i.test(output);
        if (['write_file', 'edit_file', 'insert_lines', 'delete_lines'].includes(name) && typeof input.path === 'string') {
          const file = path.resolve(record.root, input.path);
          changes.set(file, { file, success: ok, result: `[${name}] ${output}` });
          if (ok) { executed = true; if (phase) checks.clear(); }
        }
        if (['run_shell', 'run_terminal', 'run_python', 'smoke_test', 'start_job', 'wait_job'].includes(name)) {
          if (phase && name === 'run_shell') checks.set(String(input.command), ok);
          if (ok) executed = true;
          evidence.push(`[${name}] ${output.slice(0, 1500)}`);
          if (evidence.length > 12) evidence.shift();
        }
      },
    } },
  );
  signal?.throwIfAborted();
  const applications = [...changes.values()];
  if (!executed) applications.push({ file: '', success: false, result: 'HATA: Coder did not execute any implementation or validation action.' });
  if (['INTERRUPTED', 'BLOCKED', 'CANCELLED'].includes(getActiveTask()?.taskState || '')) applications.push({ file: '', success: false, result: 'HATA: Coder stage was interrupted or blocked.' });
  if (phase) {
    if (phase.status !== 'review') applications.push({ file: '', success: false, result: 'HATA: Submit concrete checkpoint evidence using task_plan before review.' });
    for (const command of phase.commands) if (checks.get(command) !== true) applications.push({ file: '', success: false, result: 'HATA: Required checkpoint check did not pass: ' + command });
  } else if (pendingSteps(record)) applications.push({ file: '', success: false, result: 'HATA: Saved task plan still has open steps:\n' + pendingSteps(record) });
  if (!applications.length) applications.push({ file: '', success: true, result: 'Coder execution completed; see tool evidence.' });
  return { code: result.response, applications, toolEvidence: evidence.join('\n').slice(-10000) };
}
