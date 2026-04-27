import { DehaConfig } from '../config';
import { sendMessage, Message } from './ai-service';
import { duckDuckGoSearch } from '../tools/search';

// ─── Keyword heuristics (instant, no API call) ────────────────────────────────

const SEARCH_KEYWORDS = [
  // Turkish
  'bul', 'bul bana', 'ara', 'araştır', 'nerede', 'nerededir', 'nereden',
  'fiyat', 'fiyatı', 'ücret', 'ne kadar', 'kaç para', 'kaç lira',
  'sat', 'satın', 'sipariş', 'stok', 'mevcut', 'var mı',
  'güncel', 'son', 'şu an', 'şimdi', 'bugün', 'bu hafta', 'son dakika',
  'haber', 'duyuru', 'çıktı mı', 'piyasaya',
  'indir', 'indirme', 'link', 'url', 'site', 'adres',
  'öneri', 'önerir misin', 'hangi', 'karşılaştır', 'vs',
  // English
  'find', 'search', 'look for', 'where', 'buy', 'purchase', 'price',
  'how much', 'cost', 'available', 'in stock', 'shop', 'order',
  'latest', 'current', 'today', 'news', 'recently', 'just released',
  'recommend', 'best', 'compare', 'review',
];

function hasSearchKeyword(message: string): boolean {
  const lower = message.toLowerCase();
  return SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Model-based intent (only called when keyword match is found) ─────────────

const INTENT_SYSTEM = `You are an intent classifier. Does this user message require real-time web search?

Reply ONLY with JSON, nothing else. No markdown, no explanation.
Examples:
{"search":true,"keywords":"Monster Tulpar i7 RTX 5060 laptop fiyat"}
{"search":false}

Search IS needed: finding products/prices, news, current events, specific URLs, real-world comparisons.
Search NOT needed: coding questions, explanations, math, generating code/text.`;

interface IntentResult {
  search: boolean;
  keywords?: string;
}

async function modelIntent(message: string, config: DehaConfig): Promise<IntentResult> {
  try {
    const messages: Message[] = [{ role: 'user', content: message }];
    // Intent check için thinking mode'u kapatmak adına deepseek-chat (non-thinking alias) kullan.
    // Diğer providerlar için mevcut modeli kullan ama token limitini yeterince yüksek tut.
    const intentConfig = { ...config, maxTokens: 512, temperature: 0 };
    if (config.provider === 'deepseek') {
      intentConfig.deepseekModel = 'deepseek-chat'; // non-thinking mode alias
    }
    const raw = await sendMessage(messages, { ...intentConfig, systemPrompt: INTENT_SYSTEM });

    // JSON bul — markdown içinde olabilir
    const match = raw.match(/\{[^}]+\}/);
    if (!match) return { search: false };
    const parsed = JSON.parse(match[0]) as IntentResult;
    return parsed;
  } catch {
    return { search: false };
  }
}

// ─── Extract keywords without model (fast fallback) ──────────────────────────

function extractKeywords(message: string): string {
  // Stop words çıkar, kalan kelimeleri keyword olarak kullan
  const stopWords = new Set([
    've', 'veya', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki',
    'için', 'bana', 'beni', 'benim', 'ben', 'sen', 'sana', 'onu',
    'the', 'a', 'an', 'and', 'or', 'for', 'me', 'my', 'i', 'you',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
  ]);
  return message
    .replace(/[?!.,;]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 8)
    .join(' ');
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export async function detectIntent(
  message: string,
  config: DehaConfig,
): Promise<IntentResult> {
  // 1. Keyword check — hızlı ve ücretsiz
  if (!hasSearchKeyword(message)) return { search: false };

  // 2. Keyword match varsa modele sor (doğrulama + keyword extraction)
  const result = await modelIntent(message, config);

  // Model yanlış döndürdüyse keyword'leri kendimiz çıkaralım
  if (result.search && !result.keywords) {
    result.keywords = extractKeywords(message);
  }

  return result;
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
      .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return (
      `${message}\n\n` +
      `---\n` +
      `[Real-time web search results for: "${keywords}"]\n` +
      `${formatted}\n` +
      `---\n` +
      `Use the search results above to give an accurate, up-to-date answer. Include relevant URLs.`
    );
  } catch {
    return message;
  }
}
