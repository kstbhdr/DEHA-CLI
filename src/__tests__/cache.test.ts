import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { getCached, setCache, clearCache, cacheStats } from '../services/cache';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setCache / getCached', () => {
    it('setCache sonrasi getCached ayni degeri dondurur', () => {
      const msgs: Message[] = [{ role: 'user', content: 'merhaba' }];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setCache('system', msgs, 'gpt-4o', 'Merhaba!');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        response: 'Merhaba!',
        ts: Date.now(),
      }));

      const result = getCached('system', msgs, 'gpt-4o');
      expect(result).toBe('Merhaba!');
    });

    it('cache yoksa null dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = getCached('system', [], 'gpt-4o');
      expect(result).toBeNull();
    });

    it('suresi gecmis cache null dondurur ve dosyayi siler', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        response: 'eski',
        ts: Date.now() - 7200_000,
      }));
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      const result = getCached('system', [], 'gpt-4o');
      expect(result).toBeNull();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('bozuk JSON cache durumunda null dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{bozuk json');
      const result = getCached('system', [], 'gpt-4o');
      expect(result).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('cache dizini yoksa 0 dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(clearCache()).toBe(0);
    });

    it('.json dosyalarini siler ve sayisini dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'abc123.json',
        'def456.json',
        'readme.txt',
      ] as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      expect(clearCache()).toBe(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cacheStats', () => {
    it('cache dizini yoksa sifir dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const stats = cacheStats();
      expect(stats.fileCount).toBe(0);
      expect(stats.sizeBytes).toBe(0);
    });

    it('.json dosyalarinin sayisini ve boyutunu dondurur', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'a.json',
        'b.json',
      ] as any);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

      const stats = cacheStats();
      expect(stats.fileCount).toBe(2);
      expect(stats.sizeBytes).toBe(2048);
    });
  });

  describe('hash farkliligi', () => {
    it('farkli mesajlar farkli cache anahtari uretir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setCache('sys', [{ role: 'user', content: 'a' }], 'model1', 'y1');
      setCache('sys', [{ role: 'user', content: 'b' }], 'model1', 'y2');

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
