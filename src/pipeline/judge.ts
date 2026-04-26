import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const JUDGE_SYSTEM = `You are a senior code reviewer and software quality engineer. You will be given a task, a plan, and the code written by the Coder.

Evaluate the code against these criteria:
1. Does it fully satisfy the task requirements?
2. Are there syntax or logic errors?
3. Are edge cases handled?
4. Is error handling sufficient?
5. Is the code readable and maintainable?
6. Are there any security vulnerabilities?

Your response MUST follow this exact format:

VERDICT: PASS
(or)
VERDICT: FAIL

SCORE: 8/10

## STRENGTHS
- [what was done well]

## ISSUES
- [problems found, if any]

## REQUIRED FIXES
- [specific changes the Coder must make — only if FAIL]
- [leave empty if PASS]

## SUMMARY
[One paragraph overall assessment]

IMPORTANT: The first line MUST be exactly "VERDICT: PASS" or "VERDICT: FAIL".`;

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
  const raw = await callRole(pipeline.judge, config, messages, JUDGE_SYSTEM, onChunk);

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
