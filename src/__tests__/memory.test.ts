import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Redis mock
vi.mock('ioredis', () => {
  const mockRedis = {
    hset: vi.fn().mockResolvedValue(undefined),
    hgetall: vi.fn().mockResolvedValue(null),
    sadd: vi.fn().mockResolvedValue(undefined),
    smembers: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

// ChromaDB mock
vi.mock('chromadb', () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({
    getOrCreateCollection: vi.fn().mockResolvedValue({
      add: vi.fn().mockResolvedValue(undefined),
    }),
  })),
}));

vi.mock('axios');

const ORIGINAL_ENV = { ...process.env };

const memory = await import('../services/memory');

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

describe('memory service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL; // Redis kapalı — in-memory mod
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('addMessage ve getContext (in-memory)', () => {
    it('mesaj ekler ve context olarak geri alır', async () => {
      const msg1: Message = { role: 'user', content: 'Merhaba' };
      const msg2: Message = { role: 'assistant', content: 'Selam, nasıl yardımcı olabilirim?' };

      await memory.addMessage(msg1);
      await memory.addMessage(msg2);

      const ctx = await memory.getContext('yeni soru', [msg1, msg2]);
      expect(ctx.length).toBeGreaterThanOrEqual(2);
      const contents = ctx.map(m => m.content).join(' ');
      expect(contents).toContain('Merhaba');
      expect(contents).toContain('Selam');
    });

    it('boş mesaj listesiyle çağrıldığında boş context döner', async () => {
      const ctx = await memory.getContext('test', []);
      expect(ctx.length).toBe(0);
    });
  });

  describe('closeMemory', () => {
    it('Redis yokken çalışır (hata fırlatmaz)', async () => {
      await expect(memory.closeMemory()).resolves.toBeUndefined();
    });
  });

  describe('getMemoryStatus', () => {
    it('Redis ve ChromaDB kapalıyken false döndürür', async () => {
      const status = await memory.getMemoryStatus();
      expect(status).toHaveProperty('redis', false);
      expect(status).toHaveProperty('chromadb', false);
      expect(typeof status.stored).toBe('number');
    });
  });

  describe('çoklu mesaj ekleme', () => {
    it('10 mesaj eklenip context sorgulanabilir', async () => {
      for (let i = 0; i < 10; i++) {
        await memory.addMessage({ role: 'user', content: `mesaj-${i}` });
        await memory.addMessage({ role: 'assistant', content: `yanıt-${i}` });
      }

      const sonMesajlar: Message[] = [
        { role: 'user', content: 'mesaj-9' },
        { role: 'assistant', content: 'yanıt-9' },
      ];
      const ctx = await memory.getContext('son soru', sonMesajlar);
      expect(ctx.length).toBeGreaterThanOrEqual(2);
    });
  });
});
