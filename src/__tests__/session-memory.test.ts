import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Redis mock
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

// Token counter mock — plain functions (vi.fn kullanma, mock sorunu çıkarıyor)
vi.mock('../services/token-counter', () => ({
  estimateTokens: (text: string) => Math.ceil((text?.length || 0) / 3.5),
  estimateMessagesTokens: (msgs: any[]) =>
    msgs.reduce((sum: number, m: any) => sum + Math.ceil((m.content?.length || 0) / 3.5) + 4, 0),
  getMaxContextTokens: () => 128_000,
}));

import * as session from '../services/session-memory';

const ORIGINAL_ENV = { ...process.env };

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

describe('session-memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // ─── appendMessage ────────────────────────────────────────────────────

  describe('appendMessage', () => {
    it('mesaj ekler ve getSessionMessages ile okunabilir', async () => {
      await session.appendMessage({ role: 'user', content: 'test mesajı' });
      const msgs = session.getSessionMessages();
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      expect(msgs[msgs.length - 1].content).toBe('test mesajı');
    });

    it('birden çok mesaj eklenebilir', async () => {
      await session.appendMessage({ role: 'user', content: 'msg1' });
      await session.appendMessage({ role: 'assistant', content: 'reply1' });
      await session.appendMessage({ role: 'user', content: 'msg2' });

      expect(session.getSessionMessages().length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── buildContextMessages ─────────────────────────────────────────────

  describe('buildContextMessages', () => {
    it('özet yokken mesajları döndürür', () => {
      const ctx = session.buildContextMessages();
      expect(Array.isArray(ctx)).toBe(true);
    });

    it('pendingUserMessage eklenebilir', () => {
      const ctx = session.buildContextMessages('bekleyen mesaj');
      const last = ctx[ctx.length - 1];
      expect(last.content).toBe('bekleyen mesaj');
    });
  });

  // ─── workDir ──────────────────────────────────────────────────────────

  describe('setWorkDir / getWorkDir', () => {
    it('getWorkDir varsayılan değer döndürür', () => {
      expect(session.getWorkDir()).toBeTruthy();
    });

    it('setWorkDir ile güncellenir', () => {
      session.setWorkDir('/fake/path');
      expect(session.getWorkDir()).toBe('/fake/path');
    });
  });

  // ─── Context Compression ──────────────────────────────────────────────

  describe('summarizeOld', () => {
    it('yeterli mesaj yoksa false döndürür', async () => {
      const result = await session.summarizeOld(vi.fn(), 50);
      expect(result).toBe(false);
    });

    it('özetleme başarısız olursa false döndürür', async () => {
      const summarizeFn = vi.fn().mockRejectedValue(new Error('API hatası'));
      const result = await session.summarizeOld(summarizeFn, 5);
      expect(result).toBe(false);
    });
  });

  // ─── getContextStats ──────────────────────────────────────────────────

  describe('getContextStats', () => {
    it('geçerli istatistik döndürür', () => {
      const stats = session.getContextStats(128_000);
      expect(stats).toHaveProperty('messages');
      expect(stats).toHaveProperty('hasSummary');
      expect(stats).toHaveProperty('compressCount');
      expect(stats).toHaveProperty('totalTokens');
    });
  });

  // ─── flushOnExit ──────────────────────────────────────────────────────

  describe('flushOnExit', () => {
    it('hata fırlatmadan çalışır', async () => {
      await expect(session.flushOnExit()).resolves.toBeUndefined();
    });
  });

  // ─── getSessionStats ──────────────────────────────────────────────────

  describe('getSessionStats', () => {
    it('temel istatistikleri döndürür', () => {
      const stats = session.getSessionStats();
      expect(stats).toHaveProperty('messages');
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('workDir');
    });
  });
});
