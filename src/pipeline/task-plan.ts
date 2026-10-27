import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { ToolDefinition } from '../services/ai-service';

export interface Checkpoint {
  title: string; instructions: string; files: string[]; commands: string[]; acceptance: string[];
  status: 'pending' | 'coding' | 'review' | 'changes_requested' | 'approved';
  attempts: number; feedback?: string;
  reviews: { decision: 'approve' | 'revise'; feedback: string; at: string }[];
}
export interface TaskPlan {
  version: 1; id: string; root: string; task: string; plan: string;
  status: 'planned' | 'coding' | 'applied' | 'reviewed' | 'failed';
  steps: { text: string; status: 'todo' | 'doing' | 'done'; evidence?: string }[];
  checkpoints?: Checkpoint[];
}

export function planPath(record: TaskPlan): string { return path.join(record.root, '.deha', 'tasks', record.id, 'task.md'); }
function atomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', text, 'utf8'); fs.renameSync(file + '.tmp', file);
}
export function savePlan(record: TaskPlan): void {
  let checklistIndex = 0;
  const renderedPlan = record.plan.replace(/^(\s*(?:[-*]|\d+[.)])\s+)\[[ x~]\]/gim, (_match, prefix) => `${prefix}[${record.steps[checklistIndex++]?.status === 'done' ? 'x' : ' '}]`);
  const markdown = `# Task\n\n${record.task}\n\nStatus: ${record.status}\n\n## Progress\n` +
    record.steps.map((s, i) => `${i + 1}. [${s.status === 'done' ? 'x' : s.status === 'doing' ? '~' : ' '}] ${s.text}${s.evidence ? '\n   Evidence: ' + s.evidence : ''}`).join('\n') +
    '\n\n## Implementation plan\n' + renderedPlan + '\n' +
    (record.checkpoints ? '\n## Planner checkpoints\n' + record.checkpoints.map((c, i) =>
      `\n### ${i + 1}. ${c.title} (${c.status}; attempts: ${c.attempts})\n${c.instructions}\nFiles: ${c.files.join(', ')}\nChecks: ${c.commands.join('; ') || '(none)'}\nAcceptance:\n${c.acceptance.map(a => '- ' + a).join('\n')}\nFeedback: ${c.feedback ?? '(none)'}\n` + c.reviews.map(r => `- ${r.at}: ${r.decision}: ${r.feedback}`).join('\n')).join('\n') : '');
  atomic(path.join(path.dirname(planPath(record)), 'state.json'), JSON.stringify(record, null, 2));
  atomic(planPath(record), markdown);
  atomic(path.join(record.root, '.deha', 'tasks', 'latest.json'), JSON.stringify({ id: record.id }));
  atomic(path.join(record.root, '.deha', 'task.md'), markdown);
}
export function createPlan(root: string, task: string, plan: string, checkpoints?: Checkpoint[]): TaskPlan {
  const clean = plan.replace(/\[STATUS:\s*\w+\]/gi, '').trim();
  const steps = [...clean.matchAll(/^\s*(?:[-*]|\d+[.)])\s+\[[ x~]\]\s+(.+)$/gim)].map(m => ({ text: m[1].trim(), status: 'todo' as const }));
  const record: TaskPlan = { version: 1, id: randomUUID(), root: path.resolve(root), task, plan: clean, status: 'planned', steps: steps.length ? steps : [{ text: 'Implement and verify the complete requested task', status: 'todo' }] };
  if (checkpoints) { record.checkpoints = checkpoints; record.steps = checkpoints.map(c => ({ text: c.title, status: 'todo' })); }
  savePlan(record); return record;
}
export function loadLatestPlan(root: string): TaskPlan {
  const pointer = JSON.parse(fs.readFileSync(path.join(root, '.deha', 'tasks', 'latest.json'), 'utf8'));
  if (!/^[a-f0-9-]{36}$/.test(pointer.id)) throw new Error('Invalid task plan pointer.');
  const record: TaskPlan = JSON.parse(fs.readFileSync(path.join(root, '.deha', 'tasks', pointer.id, 'state.json'), 'utf8'));
  if (record.version !== 1 || record.id !== pointer.id || path.resolve(record.root) !== path.resolve(root) || !record.steps.length) throw new Error('Task plan does not belong to this project.');
  return record;
}
export function pendingSteps(record: TaskPlan): string {
  return record.steps.map((s, i) => s.status === 'done' ? '' : `${i + 1}. ${s.text}`).filter(Boolean).join('\n');
}
export function checkpointContext(record: TaskPlan, index: number): string {
  const phase = record.checkpoints![index];
  return `TASK: ${record.task}\nOVERVIEW:\n${record.plan}\nCURRENT CHECKPOINT ${index + 1}:\n${JSON.stringify({ ...phase, reviews: phase.reviews.slice(-2) })}\nAPPROVED CHECKPOINTS:\n` +
    record.checkpoints!.slice(0, index).map(c => `${c.title}: ${c.status}`).join('\n');
}

export const TASK_PLAN_TOOL: ToolDefinition = {
  name: 'task_plan', description: 'View the saved task plan progress or update a step. Step numbers are 1-based. Completing a step requires concrete evidence (file/test/result). This updates task.md locally without calling Planner.',
  input_schema: { type: 'object', properties: {
    action: { type: 'string', enum: ['view', 'update_step'] },
    index: { type: 'number' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] },
    evidence: { type: 'string' }, include_plan: { type: 'boolean' },
  }, required: ['action'] },
};
export function planTool(record: TaskPlan, input: Record<string, unknown>): string {
  if (input.action === 'update_step') {
    const index = Number(input.index) - 1;
    if (!Number.isInteger(index) || !record.steps[index] || !['todo', 'doing', 'done'].includes(String(input.status))) return 'HATA: Invalid step index or status.';
    if (record.checkpoints && index !== record.checkpoints.findIndex(c => c.status !== 'approved')) return 'HATA: Only the current checkpoint may be updated. Planner approval is required to advance.';
    const evidence = String(input.evidence ?? '').trim().slice(0, 600);
    if (input.status === 'done' && evidence.length < 10) return 'HATA: Give concrete file/test/result evidence before marking done.';
    record.steps[index] = { ...record.steps[index], status: record.checkpoints ? 'doing' : input.status as 'todo' | 'doing' | 'done', evidence };
    if (record.checkpoints && input.status === 'done') record.checkpoints[index].status = 'review';
    savePlan(record);
  } else if (input.action !== 'view') return 'HATA: Unknown task_plan action.';
  const current = record.checkpoints?.findIndex(c => c.status !== 'approved');
  return JSON.stringify({ task_file: planPath(record), status: record.status, steps: record.steps.map((s, i) => ({ index: i + 1, ...s })), ...(input.include_plan ? { plan: current !== undefined && current >= 0 ? checkpointContext(record, current) : record.plan } : {}) });
}
