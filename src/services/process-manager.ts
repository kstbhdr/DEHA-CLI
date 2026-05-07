/**
 * Redis ve ChromaDB'yi otomatik başlatır.
 *
 * Redis   → redis-memory-server (npm ile binary indirilir, kurulum gerekmez)
 * ChromaDB → Python varsa: pip install chromadb (ilk çalışmada) + chroma run
 *             Python yoksa: dosya tabanlı vektör store'a sessizce düşer
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const REDIS_PORT   = parseInt(process.env.REDIS_PORT   || '6379', 10);
const CHROMA_PORT  = parseInt(process.env.CHROMA_PORT  || '8000', 10);
const CHROMA_DATA  = path.join(os.homedir(), '.deha', 'chromadb');
const CHROMA_FLAG  = path.join(os.homedir(), '.deha', '.chroma-installed'); // ilk kurulum bitti mi?

let _redisProc:  ChildProcess | null = null;
let _chromaProc: ChildProcess | null = null;

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    // Önce IPv4 sonra IPv6 dene (VPS'te Chroma genelde ::1'de çalışır)
    const tryConnect = (host: string) => {
      const s = net.createConnection({ port, host });
      s.setTimeout(500);
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error',   () => {
        if (host === '127.0.0.1') tryConnect('::1');
        else resolve(false);
      });
      s.on('timeout', () => { s.destroy(); if (host === '127.0.0.1') tryConnect('::1'); else resolve(false); });
    };
    tryConnect('127.0.0.1');
  });
}

function which(cmd: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function waitPort(port: number, maxMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const start = Date.now();
    const iv = setInterval(async () => {
      if (await isPortOpen(port)) { clearInterval(iv); resolve(true); return; }
      if (Date.now() - start > maxMs) { clearInterval(iv); resolve(false); }
    }, 300);
  });
}

// ─── Redis (redis-memory-server) ─────────────────────────────────────────────

export async function ensureRedis(): Promise<'running' | 'started' | 'unavailable'> {
  if (await isPortOpen(REDIS_PORT)) return 'running';

  try {
    const { RedisMemoryServer } = await import('redis-memory-server');
    const server = new RedisMemoryServer({
      instance: { port: REDIS_PORT },
      binary: { downloadDir: path.join(os.homedir(), '.deha', 'redis-bin') },
    });
    await server.start();
    process.env.REDIS_URL = `redis://localhost:${REDIS_PORT}`;

    process.once('exit', () => server.stop().catch(() => {}));
    return 'started';
  } catch {
    if (!which('redis-server')) return 'unavailable';

    _redisProc = spawn('redis-server', ['--port', String(REDIS_PORT), '--loglevel', 'warning'], {
      stdio: 'ignore',
    });
    _redisProc.on('error', () => {});

    const ok = await waitPort(REDIS_PORT, 3000);
    if (ok) {
      process.env.REDIS_URL = `redis://localhost:${REDIS_PORT}`;
      return 'started';
    }
    return 'unavailable';
  }
}

// ─── ChromaDB (Python auto-install) ──────────────────────────────────────────

export async function ensureChroma(): Promise<'running' | 'started' | 'unavailable'> {
  if (await isPortOpen(CHROMA_PORT)) return 'running';

  const py = which('python3') ? 'python3' : 'python';

  if (!fs.existsSync(CHROMA_FLAG)) {
    try {
      execSync(`${py} -m pip install chromadb --quiet --disable-pip-version-check --break-system-packages`, {
        stdio: 'pipe',
        timeout: 120_000,
      });
      fs.mkdirSync(path.dirname(CHROMA_FLAG), { recursive: true });
      fs.writeFileSync(CHROMA_FLAG, new Date().toISOString());
    } catch {
      return 'unavailable';
    }
  }

  fs.mkdirSync(CHROMA_DATA, { recursive: true });

  const chromaBin = which('chroma') ? 'chroma' : null;

  if (chromaBin) {
    _chromaProc = spawn(
      chromaBin,
      ['run', '--path', CHROMA_DATA, '--port', String(CHROMA_PORT), '--host', 'localhost'],
      { stdio: 'ignore', env: { ...process.env, ANONYMIZED_TELEMETRY: 'False' } },
    );
  } else {
    const startScript = `from chromadb.cli.cli import app; import sys; sys.argv=['chroma','run','--path',r'${CHROMA_DATA}','--port','${CHROMA_PORT}','--host','localhost']; app()`;
    _chromaProc = spawn(
      py,
      ['-c', startScript],
      { stdio: 'ignore', env: { ...process.env, ANONYMIZED_TELEMETRY: 'False' } },
    );
  }
  
  _chromaProc.on('error', () => {});

  const ok = await waitPort(CHROMA_PORT, 15_000); // VPS'te biraz daha sabırlı olalım
  if (ok) {
    process.env.CHROMA_URL = `http://localhost:${CHROMA_PORT}`;
    return 'started';
  }
  return 'unavailable';
}

// ─── Her ikisini paralel başlat ───────────────────────────────────────────────

export interface ServicesStatus {
  redis:   'running' | 'started' | 'unavailable';
  chromadb:'running' | 'started' | 'unavailable';
  vectorStore: string;
}

export async function startServices(): Promise<ServicesStatus> {
  const [redis, chromadb, vs] = await Promise.all([
    ensureRedis(),
    ensureChroma(),
    import('./vector-store').then(m => m.getVectorStore().then(v => v.constructor.name === 'ChromaVectorStore' ? 'ChromaDB' : 'JSON')),
  ]);
  return { redis, chromadb, vectorStore: vs };
}

// ─── Kapat (sadece biz başlattıysak) ─────────────────────────────────────────

export function stopServices(): void {
  _redisProc?.kill('SIGTERM');
  _chromaProc?.kill('SIGTERM');
  _redisProc  = null;
  _chromaProc = null;
}
