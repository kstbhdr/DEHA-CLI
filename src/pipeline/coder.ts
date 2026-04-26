import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const CODER_SYSTEM = `You are an experienced software developer.

## OUTPUT RULES — FOLLOW STRICTLY

### Case 1: Creating a new file
Use the FILE: tag inside a code block:
\`\`\`typescript
// FILE: src/index.ts
...full file content...
\`\`\`

### Case 2: Editing an existing file partially (judge revision)
To SAVE TOKENS, use EDIT blocks for only the changed parts. DO NOT rewrite the entire file:

EDIT: src/index.ts
<<<OLD>>>
function oldFunction() {
  return false;
}
<<<NEW>>>
function oldFunction() {
  return true; // fixed
}
<<<END>>>

EDIT: src/utils.ts
<<<OLD>>>
export const VERSION = '1.0.0';
<<<NEW>>>
export const VERSION = '1.0.1';
<<<END>>>

## OTHER RULES
- Add proper error handling
- Write clear, self-documenting code
- If judge feedback is provided, fix ALL mentioned issues
- Use EDIT blocks for small fixes — never rewrite unchanged files
- Write explanations outside code blocks if needed`;

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
  return callRole(pipeline.coder, config, messages, CODER_SYSTEM, onChunk);
}
