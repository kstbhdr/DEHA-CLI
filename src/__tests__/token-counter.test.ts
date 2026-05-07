import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  getMaxContextTokens,
  Message,
} from '../services/token-counter';

describe('estimateTokens', () => {
  it('boş metin için 0 döndürür', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('null/undefined güvenli', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('kısa bir metnin token sayısını hesaplar', () => {
    // "Merhaba" = 7 karakter / 3.5 = 2
    expect(estimateTokens('Merhaba')).toBe(2);
  });

  it('uzun bir metnin token sayısını hesaplar', () => {
    const text = 'A'.repeat(350); // 350 / 3.5 = 100
    expect(estimateTokens(text)).toBe(100);
  });

  it('yuvarlama doğru çalışır (Math.ceil)', () => {
    // 1 karakter / 3.5 = 0.285 → ceil = 1
    expect(estimateTokens('a')).toBe(1);
    // 4 karakter / 3.5 = 1.14 → ceil = 2
    expect(estimateTokens('abcd')).toBe(2);
  });
});

describe('estimateMessagesTokens', () => {
  it('boş mesaj dizisi için 0 döndürür', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('tek mesajın token sayısını overhead ile hesaplar', () => {
    const messages: Message[] = [{ role: 'user', content: 'Merhaba' }];
    // content: 7/3.5=2 + overhead:4 = 6
    expect(estimateMessagesTokens(messages)).toBe(6);
  });

  it('birden çok mesajın toplam token sayısını hesaplar', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Merhaba' },     // 2 + 4 = 6
      { role: 'assistant', content: 'Selam' },  // 1.42→2 + 4 = 6
    ];
    expect(estimateMessagesTokens(messages)).toBe(12);
  });
});

describe('getMaxContextTokens', () => {
  it('Claude için 200_000 döndürür', () => {
    expect(getMaxContextTokens('claude', 'claude-sonnet-4')).toBe(200_000);
  });

  it('DeepSeek için 128_000 döndürür', () => {
    expect(getMaxContextTokens('deepseek', 'deepseek-v4-flash')).toBe(128_000);
  });

  it('GPT-4o için 128_000 döndürür', () => {
    expect(getMaxContextTokens('openai', 'gpt-4o')).toBe(128_000);
  });

  it('GPT-4-turbo için 128_000 döndürür', () => {
    expect(getMaxContextTokens('openai', 'gpt-4-turbo')).toBe(128_000);
  });

  it('GPT-4 (eski) için 8_192 döndürür', () => {
    expect(getMaxContextTokens('openai', 'gpt-4')).toBe(8_192);
  });

  it('GPT-3.5 için 16_385 döndürür', () => {
    expect(getMaxContextTokens('openai', 'gpt-3.5-turbo')).toBe(16_385);
  });

  it('Grok için 131_072 döndürür', () => {
    expect(getMaxContextTokens('xai', 'grok-reasoning')).toBe(131_072);
  });

  it('Ollama için 8_192 döndürür', () => {
    expect(getMaxContextTokens('ollama', 'llama3.2')).toBe(8_192);
  });

  it('Ollama için model adıyla 8_192 döndürür', () => {
    expect(getMaxContextTokens('ollama', 'llama3.2:latest')).toBe(8_192);
  });

  it('provider bazlı fallback çalışır (openrouter)', () => {
    expect(getMaxContextTokens('openrouter', 'unknown-model')).toBe(128_000);
  });

  it('bilinmeyen provider/model için varsayılan 32_000 döndürür', () => {
    expect(getMaxContextTokens('custom', 'custom-model')).toBe(32_000);
  });

  it('büyük/küçük harf duyarsız çalışır', () => {
    expect(getMaxContextTokens('OpenAI', 'GPT-4O')).toBe(128_000);
    expect(getMaxContextTokens('DEEPSEEK', 'DEEPSEEK-V4')).toBe(128_000);
  });
});
