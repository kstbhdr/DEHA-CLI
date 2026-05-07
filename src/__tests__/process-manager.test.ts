import { describe, it, expect, vi, beforeEach } from 'vitest';

// child_process mock
const mockExecSync = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn(() => ({ on: vi.fn(), kill: vi.fn() })));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
}));

// net mock — createConnection direkt vi.fn() ile
const mockCreateConnection = vi.hoisted(() => vi.fn());

vi.mock('net', () => ({
  createConnection: mockCreateConnection,
}));

// fs mock
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// redis-memory-server mock
vi.mock('redis-memory-server', () => ({
  RedisMemoryServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { ensureRedis, ensureChroma, startServices, stopServices } from '../services/process-manager';
import * as fs from 'fs';

function makeSocket(events: Record<string, Function>): any {
  const sock = { destroy: vi.fn(), setTimeout: vi.fn(), on: vi.fn() };
  sock.on.mockImplementation((evt: string, cb: Function) => {
    if (events[evt]) setTimeout(() => events[evt](cb), 5);
    return sock;
  });
  return sock;
}

function mockPortOpen(isOpen: boolean) {
  mockCreateConnection.mockImplementation((opts: any) => {
    if (isOpen) {
      return makeSocket({ connect: (cb: Function) => cb() });
    }
    return makeSocket({
      error: (cb: Function) => cb(new Error('refused')),
      timeout: (cb: Function) => cb(),
    });
  });
}

describe('process-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureRedis', () => {
    it('port aciksa running doner', async () => {
      mockPortOpen(true);
      const result = await ensureRedis();
      expect(result).toBe('running');
    });

    it('port kapali ve redis-server yoksa unavailable doner', async () => {
      mockPortOpen(false);
      mockExecSync.mockImplementation(() => { throw new Error('not found'); });
      // redis-memory-server da hata firlatir
      const { RedisMemoryServer } = await import('redis-memory-server');
      (RedisMemoryServer as any).mockImplementationOnce(() => ({
        start: vi.fn().mockRejectedValue(new Error('install failed')),
      }));

      const result = await ensureRedis();
      expect(result).toBe('unavailable');
    });

    it('redis-server binary ile baslatilabilir', async () => {
      mockPortOpen(false);

      // IsPortOpen: ilk cagrı false, waitPort icin true
      let callCount = 0;
      mockCreateConnection.mockImplementation((opts: any) => {
        callCount++;
        const isConnected = callCount >= 3; // ilk 2 deneme (IPv4+IPv6) basarisiz
        if (isConnected) {
          return makeSocket({ connect: (cb: Function) => cb() });
        }
        return makeSocket({
          error: (cb: Function) => cb(new Error('refused')),
          timeout: (cb: Function) => cb(),
        });
      });

      // redis-server exists
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('which') || cmd.includes('where')) return '/usr/bin/redis-server\n';
        throw new Error('not found');
      });

      const result = await ensureRedis();
      expect(result).toBe('started');
      expect(mockSpawn).toHaveBeenCalledWith('redis-server', expect.any(Array), expect.any(Object));
    });
  });

  describe('ensureChroma', () => {
    it('port aciksa running doner', async () => {
      mockPortOpen(true);
      const result = await ensureChroma();
      expect(result).toBe('running');
    });

    it('Python yoksa unavailable doner', async () => {
      mockPortOpen(false);
      mockExecSync.mockImplementation(() => { throw new Error('not found'); });
      const result = await ensureChroma();
      expect(result).toBe('unavailable');
    });
  });

  describe('startServices', () => {
    it('her iki servis running doner', async () => {
      mockPortOpen(true);
      const status = await startServices();
      expect(status.redis).toBe('running');
      expect(status.chromadb).toBe('running');
    });
  });

  describe('stopServices', () => {
    it('hata firlatmaz', () => {
      expect(() => stopServices()).not.toThrow();
    });
  });
});
