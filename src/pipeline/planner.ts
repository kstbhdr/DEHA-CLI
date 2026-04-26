import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const PLANNER_SYSTEM = `You are a software architect. Analyze the user's task and produce a structured implementation plan.

Your output MUST follow this exact format:

## TASK ANALYSIS
[Summarize the task in 2-3 sentences]

## REQUIREMENTS
[Functional and technical requirements as bullet points]

## ARCHITECTURE DECISION
[Which technology/language/pattern to use and why]

## IMPLEMENTATION STEPS
1. [First step]
2. [Second step]
...

## CODE STRUCTURE
[Which files, functions, and classes will be created]

## EDGE CASES
[Special cases and error scenarios to handle]

## INSTRUCTIONS FOR CODER
[Specific, actionable instructions the Coder must follow exactly]`;

export async function runPlanner(
  task: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { pipeline } = config;
  const messages: Message[] = [{ role: 'user', content: `Task: ${task}` }];
  return callRole(pipeline.planner, config, messages, PLANNER_SYSTEM, onChunk);
}
