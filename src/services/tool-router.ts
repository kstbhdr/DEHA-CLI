import { DehaConfig } from '../config';
import { Message, sendMessage } from './ai-service';

export interface ToolRouteDecision {
  useTools: boolean;
  reason?: string;
}

const TOOL_ROUTER_SYSTEM = `You are DEHA's tool router.

Decide whether the user request needs tools/file system/shell/browser/web search, or can be answered directly from conversation context.

Reply ONLY with JSON:
{"use_tools":true,"reason":"short reason"}
{"use_tools":false,"reason":"short reason"}

Use tools when the user asks to read/list/search files, inspect directories, run commands/tests, edit code, use browser/playwright, crawl/search the web, analyze images, deploy, git operations, or verify current system state.
Do NOT use tools for casual chat, explanations, coding advice, summaries from already loaded conversation context, or questions answerable from visible context.

Examples:
User: "root dizinindeki index.md yi oku" -> {"use_tools":true,"reason":"must read a file"}
User: "projeye bak sorunları tespit et" -> {"use_tools":true,"reason":"must inspect files"}
User: "en son ne yaptık" -> {"use_tools":false,"reason":"answer from loaded conversation context"}
User: "bu fonksiyon ne yapıyor" -> {"use_tools":false,"reason":"can explain if code is already in context"}`;

const OBVIOUS_TOOL_PATTERNS = [
  /\b(oku|aç|listele|ls|cat|grep|araştır|incele|bak|kontrol et|çalıştır|test et|build et|deploy|push|pull|commit)\b/i,
  /\b(read|open|list|search|inspect|check|run|test|build|deploy|push|pull|commit)\b/i,
  /\b(index\.md|\.md|\.ts|\.js|\.json|\.env|package\.json|dosya|klasör|dizin|repo|github|vps|root)\b/i,
  /\b(browser|playwright|screenshot|vision|web search|crawl|duckduckgo)\b/i,
];

export async function decideToolRoute(
  message: string,
  config: DehaConfig,
): Promise<ToolRouteDecision> {
  const normalized = message.trim();
  if (!normalized) return { useTools: false };

  const hasObviousToolSignal = OBVIOUS_TOOL_PATTERNS.some((pattern) => pattern.test(normalized));

  try {
    const routerConfig = {
      ...config,
      maxTokens: 256,
      temperature: 0,
      systemPrompt: TOOL_ROUTER_SYSTEM,
      deepseekThinking: 'disabled' as const,
    };
    if (config.provider === 'deepseek') {
      routerConfig.deepseekModel = 'deepseek-chat';
    }

    const messages: Message[] = [{ role: 'user', content: normalized }];
    const raw = await sendMessage(messages, routerConfig);
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) {
      return { useTools: hasObviousToolSignal, reason: 'router returned no json' };
    }

    const parsed = JSON.parse(match[0]) as { use_tools?: unknown; reason?: unknown };
    return {
      useTools: typeof parsed.use_tools === 'boolean' ? parsed.use_tools : hasObviousToolSignal,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    return { useTools: hasObviousToolSignal, reason: 'router fallback' };
  }
}
