import type { PipelineOptions } from './orchestrator';

/** Only leading flags are options; flags inside the task remain task text. */
export function parsePipelineInput(value: string): { task: string; options: PipelineOptions } {
  let task = value.trim();
  const options: PipelineOptions = {};
  while (task.startsWith('--')) {
    const token = /^(\S+)(?:\s+|$)/.exec(task)!;
    if (token[1] === '--no-planner') options.planner = false;
    else if (token[1] === '--planner') options.planner = true;
    else if (token[1] === '--no-judge') options.judge = false;
    else if (token[1] === '--judge') options.judge = true;
    else if (/^--coder-mode=(agent|blocks)$/.test(token[1])) options.coderMode = token[1].split('=')[1] as 'agent' | 'blocks';
    else throw new Error('Unknown pipeline option: ' + token[1]);
    task = task.slice(token[0].length).trimStart();
  }
  return { task, options };
}
