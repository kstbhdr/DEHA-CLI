import { describe, it, expect, vi, beforeEach } from 'vitest';

// ai-service.sendMessage mock
vi.mock('../services/ai-service', () => ({
  sendMessage: vi.fn(),
}));

// tools/search.duckDuckGoSearch mock
vi.mock('../tools/search', () => ({
  duckDuckGoSearch: vi.fn(),
}));

import { detectIntent, enrichWithSearch } from '../services/intent';
import { sendMessage } from '../services/ai-service';
import { duckDuckGoSearch } from '../tools/search';

const mockConfig: any = {
  provider: 'openai',
  openaiModel: 'gpt-4o',
  maxTokens: 4096,
  temperature: 0.7,
};

describe('detectIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('search keywordu yoksa false dondurur (model cagrilmaz)', async () => {
    const result = await detectIntent('Merhaba, nasilsin?', mockConfig);
    expect(result).toEqual({ search: false });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('search keywordu varsa model cagrilir ve sonuc doner', async () => {
    vi.mocked(sendMessage).mockResolvedValue('{"search":true,"keywords":"laptop fiyat"}');

    const result = await detectIntent('En iyi laptop hangisi?', mockConfig);
    expect(result).toEqual({ search: true, keywords: 'laptop fiyat' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('model search=true ama keywords yoksa extractKeywords kullanilir', async () => {
    vi.mocked(sendMessage).mockResolvedValue('{"search":true}');

    const result = await detectIntent('Bana en iyi laptopu bul', mockConfig);
    expect(result.search).toBe(true);
    expect(result.keywords).toBeTruthy();
    expect(result.keywords?.length).toBeGreaterThan(0);
  });

  it('model hatasinda false doner', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('API error'));

    const result = await detectIntent('En iyi laptop fiyati nedir?', mockConfig);
    expect(result).toEqual({ search: false });
  });

  it('model gecersiz JSON donerse false doner', async () => {
    vi.mocked(sendMessage).mockResolvedValue('bu bir json degil');

    const result = await detectIntent('araba fiyatlari', mockConfig);
    expect(result).toEqual({ search: false });
  });

  it('Turkce search keywordlerini tanir', async () => {
    vi.mocked(sendMessage).mockResolvedValue('{"search":true,"keywords":"test"}');

    const testCases = [
      'bunu ara bul',
      'Bugun haber ne?',
      'fiyati ne kadar?',
      'son dakika haber',
      'site adresini ver',
    ];

    for (const msg of testCases) {
      const result = await detectIntent(msg, mockConfig);
      expect(result.search).toBe(true);
    }
  });

  it('Ingilizce search keywordlerini tanir', async () => {
    vi.mocked(sendMessage).mockResolvedValue('{"search":true,"keywords":"test"}');

    const testCases = [
      'find me the best laptop',
      'what is the price of iPhone',
      'latest news today',
      'where can I buy this?',
    ];

    for (const msg of testCases) {
      const result = await detectIntent(msg, mockConfig);
      expect(result.search).toBe(true);
    }
  });

  it('oturum hafizasi sorularini searche gondermez', async () => {
    const testCases = [
      'En son ne yaptik?',
      'Az once ne demistim?',
      'Gecen sohbette ne konustuk?',
      'What did we do last conversation?',
    ];

    for (const msg of testCases) {
      const result = await detectIntent(msg, mockConfig);
      expect(result).toEqual({ search: false });
    }

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('enrichWithSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sonuclari mesaja ekler', async () => {
    vi.mocked(duckDuckGoSearch).mockResolvedValue([
      { title: 'Test Result', url: 'https://example.com', snippet: 'Test snippet' },
    ]);

    const result = await enrichWithSearch('Orijinal mesaj', 'test keyword');
    expect(result).toContain('[WEB ARAMA SONUÇLARI - "test keyword"]');
    expect(result).toContain('Test Result');
    expect(result).toContain('https://example.com');
    expect(result).toContain('KULLANARAK');
  });

  it('sonuc yoksa orijinal mesaji doner', async () => {
    vi.mocked(duckDuckGoSearch).mockResolvedValue([]);

    const result = await enrichWithSearch('Orijinal mesaj', 'test');
    expect(result).toBe('Orijinal mesaj');
  });

  it('arama hatasinda orijinal mesaji doner', async () => {
    vi.mocked(duckDuckGoSearch).mockRejectedValue(new Error('Search failed'));

    const result = await enrichWithSearch('Orijinal mesaj', 'test');
    expect(result).toBe('Orijinal mesaj');
  });
});
