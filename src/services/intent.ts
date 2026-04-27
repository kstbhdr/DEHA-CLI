import { DehaConfig } from '../config';
import { sendMessage, Message } from './ai-service';
import { duckDuckGoSearch } from '../tools/search';

// ─── Intent detection ─────────────────────────────────────────────────────────

const INTENT_SYSTEM = `You are an intent classifier. Analyze the user message and decide if it requires real-time web search to answer accurately.

Respond with ONLY a JSON object, nothing else:
{"search": true, "keywords": "search query here"}
or
{"search": false}

Search IS needed for:
- Finding products, prices, availability (e.g. "find me a laptop", "where to buy X")
- Current news, events, or recent information
- Specific URLs, addresses, phone numbers
- Comparing real-world items (prices, specs, reviews)
- Anything that changes over time

Search is NOT needed for:
- General coding questions
- Explanations of concepts
- Math, logic, or reasoning
- Generating code, text, or creative content
- Questions answerable from training knowledge`;

interface IntentResult {
  search: boolean;
  keywords?: string;
}

export async function detectIntent(
  message: string,
  config: DehaConfig,
): Promise<IntentResult> {
  try {
    const messages: Message[] = [{ role: 'user', content: message }];
    const raw = await sendMessage(messages, {
      ...config,
      systemPrompt: INTENT_SYSTEM,
      maxTokens: 60,
      temperature: 0,
    });

    // JSON çıkar
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { search: false };
    const parsed = JSON.parse(match[0]) as IntentResult;
    return parsed;
  } catch {
    return { search: false };
  }
}

// ─── Search + inject ──────────────────────────────────────────────────────────

export async function enrichWithSearch(
  message: string,
  keywords: string,
): Promise<string> {
  try {
    const results = await duckDuckGoSearch(keywords, 6);
    if (!results.length) return message;

    const formatted = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return `${message}\n\n---\n[Web search results for: "${keywords}"]\n${formatted}\n---\nUse the above search results to answer accurately.`;
  } catch {
    return message;
  }
}
