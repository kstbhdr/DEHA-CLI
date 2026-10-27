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
  abortSignal?: AbortSignal,
  staticContext: Message[] = [],
  applicationReport?: string,
  agentExecution = false,
): Promise<JudgeVerdict> {
  const { pipeline } = config;

  const userContent =
    `## ORIGINAL TASK\n${task}\n\n` +
    `## PLANNER'S PLAN\n${plan}\n\n` +
    `## CODER'S OUTPUT\n\`\`\`\n${code}\n\`\`\`` +
    (applicationReport ? `\n\n## APPLICATION RESULTS AND CURRENT FILES\n${applicationReport}\nReview the whole task against the current files, including earlier iterations. Failed writes/edits or an incomplete task must FAIL. Model review alone is not evidence that tests ran.` : '');

  const messages: Message[] = [...staticContext, { role: 'user', content: userContent }];
  const prompt = JUDGE_PROMPT + (agentExecution ? '\n[AGENT CODER REVIEW] This Coder executed tools directly. FILE/EDIT blocks are not required. Review the provided tool execution evidence and current file snapshots. Do not reject a tool-based implementation solely because the final report contains no code blocks.' : '');
  const raw = await callRole(pipeline.judge, config, messages, prompt, onChunk, 'judge', undefined, abortSignal);

  return parseVerdict(raw);
}

function parseVerdict(raw: string): JudgeVerdict {
  const passMatch  = /^\s*VERDICT:\s*(PASS|FAIL)\b/im.exec(raw);
  const scoreMatch = /^\s*SCORE:\s*(\d+(?:\.\d+)?\s*\/\s*10)\s*$/im.exec(raw);

  const numericScore = scoreMatch ? Number.parseFloat(scoreMatch[1]) : NaN;
  const pass = passMatch?.[1].toUpperCase() === 'PASS' && numericScore >= 7 && numericScore <= 10;
  const score = scoreMatch ? scoreMatch[1] : '?/10';

  const fixSection = raw.match(/## REQUIRED FIXES\s*\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
  const feedback   = fixSection ? fixSection[1].trim() : raw;

  return { pass, score, feedback, raw };
}
