import { DehaConfig } from '../config';
import { buildStaticContextMessages, getActiveTask } from '../services/session-memory';
import { configForRole } from './role-config';
import { PLANNER_PROMPT } from '../prompts.config';
import { runAgent } from '../commands/agent';

export async function runPlanner(
  task: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  pipelineStage = false,
): Promise<string> {
  // Use the runAgent engine to allow the Planner to use tools before finishing the plan
  // Limit maxToolRounds based on config or a safe fallback to prevent infinite tool loops
  const role = config.pipeline.planner;
  abortSignal?.throwIfAborted();
  const plannerConfig = configForRole(config, role);
  
  // NOTE: runAgent uses logger.write internally to stream the response and tool outputs to the terminal.
  const result = await runAgent(
    task,
    plannerConfig,
    buildStaticContextMessages(),
    abortSignal,
    PLANNER_PROMPT + (pipelineStage ? '\n[PIPELINE PLANNING STAGE] Return the complete implementation plan, exact existing snippets for edits, and validation commands. Do not implement files yourself: the configured Coder will implement your plan next. Plan completion only completes this stage, not the whole user task.' : ''),
    undefined,
    { taskAlreadyResolved: pipelineStage, completeTask: !pipelineStage },
  );
  abortSignal?.throwIfAborted();
  if (pipelineStage && (!result.response.trim() || ['INTERRUPTED', 'BLOCKED', 'CANCELLED'].includes(getActiveTask()?.taskState || ''))) {
    throw new Error('Planner did not finish a usable plan; Coder was not started.');
  }
  
  // We can still trigger onChunk with the final response if needed by the orchestrator.
  if (onChunk && result.response) {
    onChunk(result.response);
  }

  return result.response;
}
