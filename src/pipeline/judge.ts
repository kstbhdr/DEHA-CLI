import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { JUDGE_PROMPT } from '../prompts.config';

export interface JudgeVerdict {
  pass: boolean;
  score: string;
  feedback: string;
  raw: string;
}

export async function decideNeedJudge(
  task: string,
  plan: string,
  code: string,
  config: DehaConfig,
): Promise<{ needJudge: boolean; reason: string; raw: string }> {
  const { pipeline } = config;
  const codePreview = code.length > 4000 ? `${code.slice(0, 4000)}\n...` : code;
  const messages: Message[] = [{
    role: 'user',
    content: [
      `TASK:\n${task}`,
      '',
      `PLAN:\n${plan}`,
      '',
      `CODE:\n\`\`\`\n${codePreview}\n\`\`\``,
      '',
      'Does this change need a formal judge review before we stop?',
      'Reply in exactly one line:',
      'JUDGE: <short reason>',
      'or',
      'DONE: <short reason>',
    ].join('\n'),
  }];

  const raw = await callRole(
    pipeline.coder,
    config,
    messages,
    'You are a routing gate for a coding pipeline. Reply with exactly one line: JUDGE: <reason> or DONE: <reason>.',
    undefined,
    'coder',
  );

  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('JUDGE:')) {
    return { needJudge: true, reason: trimmed.slice(6).trim(), raw: trimmed };
  }
  return {
    needJudge: false,
    reason: upper.startsWith('DONE:') ? trimmed.slice(5).trim() : trimmed,
    raw: trimmed,
  };
}

export async function runJudge(
  task: string,
  plan: string,
  code: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
): Promise<JudgeVerdict> {
  const { pipeline } = config;

  const userContent =
    `## ORIGINAL TASK\n${task}\n\n` +
    `## PLANNER'S PLAN\n${plan}\n\n` +
    `## CODER'S OUTPUT\n\`\`\`\n${code}\n\`\`\``;

  const messages: Message[] = [{ role: 'user', content: userContent }];
  const raw = await callRole(pipeline.judge, config, messages, JUDGE_PROMPT, onChunk, 'judge');

  return parseVerdict(raw);
}

function parseVerdict(raw: string): JudgeVerdict {
  const passMatch  = /VERDICT:\s*(PASS|FAIL)/i.exec(raw);
  const scoreMatch = /SCORE:\s*([\d.]+\/10)/i.exec(raw);

  const pass  = passMatch ? passMatch[1].toUpperCase() === 'PASS' : false;
  const score = scoreMatch ? scoreMatch[1] : '?/10';

  const fixSection = raw.match(/## REQUIRED FIXES\n([\s\S]*?)(?=##|$)/i);
  const feedback   = fixSection ? fixSection[1].trim() : raw;

  return { pass, score, feedback, raw };
}
