import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';
import { JUDGE_PROMPT } from '../prompts.config';

export interface JudgeVerdict {
  pass: boolean;
  score: string;
  feedback: string;
  raw: string;
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
  const raw = await callRole(pipeline.judge, config, messages, JUDGE_PROMPT, onChunk);

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
