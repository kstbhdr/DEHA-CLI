/**
 * Token Counter — Basit token tahmini
 *
 * Tiktoken bağımlılığı olmadan yaklaşık token sayısı hesaplar.
 * Kural: İngilizce ~4 karakter/token, Türkçe ~3.5 karakter/token
 * Ortalama 3.5 kullanıyoruz çünkü DEHA çoğunlukla Türkçe konuşuyor.
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHARS_PER_TOKEN = 3.5;

// Mesaj başına overhead: role tag + formatting (~4 token)
const MSG_OVERHEAD_TOKENS = 4;

/**
 * Bir metin parçasının yaklaşık token sayısını döner.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Bir mesaj dizisinin toplam yaklaşık token sayısını döner.
 * Her mesaj için overhead (role tag vs.) ekler.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + MSG_OVERHEAD_TOKENS,
    0,
  );
}

/**
 * Provider'a göre max context window boyutunu döner.
 */
export function getMaxContextTokens(provider: string, model: string): number {
  // Model adına göre bilinen context window'lar
  const modelLower = model.toLowerCase();

  if (modelLower.includes('claude')) return 200_000;
  if (modelLower.includes('deepseek')) return 128_000;
  if (modelLower.includes('gpt-4o')) return 128_000;
  if (modelLower.includes('gpt-4-turbo')) return 128_000;
  if (modelLower.includes('gpt-4')) return 8_192;
  if (modelLower.includes('gpt-3.5')) return 16_385;
  if (modelLower.includes('grok')) return 131_072;
  if (modelLower.includes('qwen')) return 32_768;
  if (modelLower.includes('llama3')) return 8_192;
  if (modelLower.includes('mistral')) return 32_768;
  if (modelLower.includes('gemma')) return 8_192;

  // Provider bazlı fallback
  switch (provider.toLowerCase()) {
    case 'claude': return 200_000;
    case 'deepseek': return 128_000;
    case 'openai': return 128_000;
    case 'openrouter': return 128_000;
    case 'xai': return 131_072;
    case 'ollama': return 8_192;
    default: return 32_000;
  }
}
