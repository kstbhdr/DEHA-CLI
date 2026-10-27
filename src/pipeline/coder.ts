import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { CODER_PROMPT } from '../prompts.config';
import { PIPELINE_CODER_PROMPT } from '../prompts.config';
import { runAgent } from '../commands/agent';
import { configForRole } from './role-config';
import { TaskPlan, TASK_PLAN_TOOL, planTool, planPath, pendingSteps } from './task-plan';
import { getActiveTask } from '../services/session-memory';
import { ApplicationResult } from './apply-output';
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

export async function runCoderAgent(record: TaskPlan, config: DehaConfig, feedback: string | undefined, signal?: AbortSignal, context: Message[] = []): Promise<{ code: string; applications: ApplicationResult[]; toolEvidence: string }> {
  const changes = new Map<string, ApplicationResult>();
  const evidence: string[] = [];
  let executed = false;
  const result = await runAgent(
    `Implement the saved task.\nTASK: ${record.task}\nPLAN FILE: ${planPath(record)}\nPLAN:\n${record.plan}\nPENDING STEPS:\n${pendingSteps(record) || 'Address the review feedback.'}` +
      (feedback ? `\nREQUIRED FIXES:\n${feedback}` : ''),
    configForRole(config, config.pipeline.coder, 'coder'), context, signal,
    PIPELINE_CODER_PROMPT + '\n[CODER STAGE] Your COMPLETE tag finishes only this stage; the pipeline checks pending task_plan steps separately.',
    undefined,
    { taskAlreadyResolved: true, completeTask: false, sectioned: true, implementationGuard: true, appendUserMessage: true, stage: {
      allowedTools: CODER_TOOL_NAMES,
      tools: [{ definition: TASK_PLAN_TOOL, execute: input => planTool(record, input) }],
      onToolResult: (name, input, output) => {
        const ok = !/^HATA:/i.test(output);
        if (['write_file', 'edit_file', 'insert_lines', 'delete_lines'].includes(name) && typeof input.path === 'string') {
          const file = path.resolve(record.root, input.path);
          changes.set(file, { file, success: ok, result: `[${name}] ${output}` });
          if (ok) executed = true;
        }
        if (['run_shell', 'run_terminal', 'run_python', 'smoke_test', 'start_job', 'wait_job'].includes(name)) {
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
  if (pendingSteps(record)) applications.push({ file: '', success: false, result: 'HATA: Saved task plan still has open steps:\n' + pendingSteps(record) });
  if (!applications.length) applications.push({ file: '', success: true, result: 'Coder execution completed; see tool evidence.' });
  return { code: result.response, applications, toolEvidence: evidence.join('\n').slice(-10000) };
}
