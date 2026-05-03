import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { CODER_PROMPT } from '../prompts.config';

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
