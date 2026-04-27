import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { PLANNER_PROMPT } from '../prompts.config';

export async function runPlanner(
  task: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { pipeline } = config;
  const messages: Message[] = [{ role: 'user', content: `Task: ${task}` }];
  return callRole(pipeline.planner, config, messages, PLANNER_PROMPT, onChunk, 'planner');
}
