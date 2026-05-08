import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { calcCost, recordUsage, getStats } from '../services/usage-tracker';
import type { DehaConfig } from '../config';

function makeConfig(overrides: Partial<DehaConfig> = {}): DehaConfig {
  return {
    provider: 'openai',
    anthropicApiKey: '',
    openaiApiKey: '',
    deepseekApiKey: '',
    openrouterApiKey: '',
    xaiApiKey: '',
    customApiKey: '',
    deepseekThinking: 'disabled',
    deepseekReasoningEffort: 'high',
    claudeModel: 'claude-opus-4-6',
    openaiModel: 'gpt-4o',
    deepseekModel: 'deepseek-chat',
    openrouterModel: 'anthropic/claude-opus-4',
    xaiModel: 'grok-3',
    customModel: 'local-model',
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'llama3',
    customApiUrl: 'http://localhost:8080/v1',
    visionProvider: 'claude',
    visionModel: 'claude-opus-4-6',
    chatInputPrice: 3,
    chatOutputPrice: 15,
    plannerInputPrice: 3,
    plannerOutputPrice: 15,
    coderInputPrice: 0.27,
    coderOutputPrice: 1.10,
    judgeInputPrice: 5,
    judgeOutputPrice: 15,
    visionInputPrice: 3,
    visionOutputPrice: 15,
    agentInputPrice: 3,
    agentOutputPrice: 15,
    systemPrompt: '',
    maxTokens: 4096,
    temperature: 0.7,
    maxToolRounds: 5,
    toolMaxTokens: 49152,
    maxContextTokens: 0,
    compressThreshold: 0.75,
    minHotMessages: 10,
    pipeline: {} as any,
    ...overrides,
  };
}

describe('calcCost', () => {
  const config = makeConfig();

  it('chat rolunde dogru maliyeti hesaplar', () => {
    const cost = calcCost('chat', 1_000_000, 500_000, config);
    // 1M input * $3/M + 0.5M output * $15/M = 3 + 7.5 = 10.5
    expect(cost).toBeCloseTo(10.5, 4);
  });

  it('coder rolunde dogru maliyeti hesaplar', () => {
    const cost = calcCost('coder', 1_000_000, 200_000, config);
    // 1M * $0.27/M + 0.2M * $1.10/M = 0.27 + 0.22 = 0.49
    expect(cost).toBeCloseTo(0.49, 4);
  });

  it('judge rolunde dogru maliyeti hesaplar', () => {
    const cost = calcCost('judge', 500_000, 100_000, config);
    // 0.5M * $5/M + 0.1M * $15/M = 2.5 + 1.5 = 4.0
    expect(cost).toBeCloseTo(4.0, 4);
  });

  it('sifir token icin 0 maliyet', () => {
    expect(calcCost('chat', 0, 0, config)).toBe(0);
  });
});

describe('recordUsage', () => {
  const config = makeConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: [] }));
  });

  it('kullanim kaydeder', () => {
    recordUsage('openai', 'gpt-4o', 'chat', 1000, 500, config);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1] as string);
    expect(written.entries).toHaveLength(1);
    expect(written.entries[0].role).toBe('chat');
    expect(written.entries[0].provider).toBe('openai');
    expect(written.entries[0].costUsd).toBeGreaterThan(0);
  });

  it('sifir token icin kayit yapilmaz', () => {
    recordUsage('openai', 'gpt-4o', 'chat', 0, 0, config);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('mevcut girdilere ekleme yapar', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      entries: [{ timestamp: '2024-01-01', provider: 'old', model: 'x', role: 'chat', inputTokens: 100, outputTokens: 50, costUsd: 0.01 }],
    }));

    recordUsage('openai', 'gpt-4o', 'coder', 200, 100, config);
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1] as string);
    expect(written.entries).toHaveLength(2);
  });

  it('10000 girdi sinirini korur', () => {
    const oldEntries = Array.from({ length: 10000 }, (_, i) => ({
      timestamp: new Date(2020, 0, 1 + i).toISOString(),
      provider: 'test', model: 'm', role: 'chat' as const,
      inputTokens: 1, outputTokens: 1, costUsd: 0.001,
    }));
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: oldEntries }));

    recordUsage('openai', 'gpt-4o', 'chat', 100, 50, config);
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1] as string);
    expect(written.entries.length).toBeLessThanOrEqual(10000);
    // En son eklenen kayit en sonda olmali
    expect(written.entries[written.entries.length - 1].inputTokens).toBe(100);
  });
});

describe('getStats', () => {
  const config = makeConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('hic kayit yoksa tum periodlar 0 olur', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: [] }));
    const stats = getStats();
    expect(stats.today.calls).toBe(0);
    expect(stats.week.calls).toBe(0);
    expect(stats.month.calls).toBe(0);
    expect(stats.allTime.calls).toBe(0);
  });

  it('birden cok kayit icin dogru istatistik hesaplar', () => {
    const now = new Date();
    const today = now.toISOString();
    // lastWeek: ayin 1'inden sonra (month icinde)
    const lastWeek = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    // lastMonthStart: ayin 1'inden once (month disinda)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const beforeMonth = new Date(monthStart.getTime() - 86_400_000).toISOString();

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      entries: [
        { timestamp: today,       provider: 'openai', model: 'gpt-4o', role: 'chat', inputTokens: 1000, outputTokens: 500, costUsd: 0.01 },
        { timestamp: lastWeek,    provider: 'deepseek', model: 'ds-chat', role: 'coder', inputTokens: 2000, outputTokens: 1000, costUsd: 0.005 },
        { timestamp: beforeMonth, provider: 'claude', model: 'opus-4', role: 'planner', inputTokens: 500, outputTokens: 200, costUsd: 0.02 },
      ],
    }));

    const stats = getStats();
    expect(stats.allTime.calls).toBe(3);
    expect(stats.today.calls).toBe(1);
    expect(stats.today.totalTokens).toBe(1500);
    expect(stats.week.calls).toBe(2); // today + lastWeek (3 gun once hala bu hafta)
    expect(stats.month.calls).toBe(2); // today + lastWeek (beforeMonth onceki ayda)
  });

  it('byModel ve byRole gruplamasi calisir', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      entries: [
        { timestamp: new Date().toISOString(), provider: 'openai', model: 'gpt-4o', role: 'chat', inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
        { timestamp: new Date().toISOString(), provider: 'openai', model: 'gpt-4o', role: 'coder', inputTokens: 200, outputTokens: 100, costUsd: 0.02 },
      ],
    }));

    const stats = getStats();
    expect(Object.keys(stats.allTime.byModel)).toContain('openai/gpt-4o');
    expect(Object.keys(stats.allTime.byRole)).toContain('chat');
    expect(Object.keys(stats.allTime.byRole)).toContain('coder');
    expect(stats.allTime.byModel['openai/gpt-4o'].calls).toBe(2);
  });
});
