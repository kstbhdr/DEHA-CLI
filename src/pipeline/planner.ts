import { DehaConfig } from '../config';
import { Message } from '../services/ai-service';
import { PLANNER_PROMPT } from '../prompts.config';
import { runAgent } from '../commands/agent';

export async function runPlanner(
  task: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Use the runAgent engine to allow the Planner to use tools before finishing the plan
  // Limit maxToolRounds based on config or a safe fallback to prevent infinite tool loops
  const plannerConfig = { ...config, maxToolRounds: config.maxToolRounds || 50 };
  
  // NOTE: runAgent uses logger.write internally to stream the response and tool outputs to the terminal.
  const result = await runAgent(
    task,
    plannerConfig,
    [],
    abortSignal,
    PLANNER_PROMPT
  );
  
  // We can still trigger onChunk with the final response if needed by the orchestrator.
  if (onChunk && result.response) {
    onChunk(result.response);
  }

  return result.response;
}
