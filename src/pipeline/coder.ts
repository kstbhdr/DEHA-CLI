import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { CODER_PROMPT } from '../prompts.config';

export async function runCoder(
  plan: string,
  config: DehaConfig,
  judgeFeedback?: string,
  previousCode?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { pipeline } = config;

  let userContent = `## PLAN\n${plan}`;

  if (previousCode && judgeFeedback) {
    userContent +=
      `\n\n## PREVIOUS CODE\n\`\`\`\n${previousCode}\n\`\`\`` +
      `\n\n## JUDGE FEEDBACK — Fix only the issues below, use EDIT blocks for unchanged parts:\n${judgeFeedback}`;
  }

  const messages: Message[] = [{ role: 'user', content: userContent }];
  return callRole(pipeline.coder, config, messages, CODER_PROMPT, onChunk, 'coder');
}
