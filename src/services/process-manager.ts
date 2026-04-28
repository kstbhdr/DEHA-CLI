/**
 * Redis ve ChromaDB'yi CLI başlarken otomatik başlatır,
 * CLI kapanırken (sadece biz başlattıysak) durdurur.
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const CHROMA_DATA_DIR = path.join(os.homedir(), '.deha', 'chromadb');
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CHROMA_PORT = parseInt(process.env.CHROMA_PORT || '8000', 10);

let _redisProc: ChildProcess | null = null;
let _chromaProc: ChildProcess | null = null;

// ─── Port kontrolü ───────────────────────────────────────────────────────────

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

// ─── Komut var mı kontrolü ────────────────────────────────────────────────────

function commandExists(cmd: string): boolean {
  try {
    execSync(
      process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
      { stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Redis ───────────────────────────────────────────────────────────────────

export async function ensureRedis(): Promise<{ started: boolean; alreadyRunning: boolean }> {
  // Zaten çalışıyor mu?
  if (await isPortOpen(REDIS_PORT)) {
    return { started: true, alreadyRunning: true };
  }

  // redis-server var mı?
  if (!commandExists('redis-server')) {
    return { started: false, alreadyRunning: false };
  }

  return new Promise((resolve) => {
    _redisProc = spawn('redis-server', ['--port', String(REDIS_PORT), '--loglevel', 'warning'], {
      detached: false,
      stdio: 'ignore',
    });

    _redisProc.on('error', () => resolve({ started: false, alreadyRunning: false }));

    // Portun açılmasını bekle (max 3 sn)
    let attempts = 0;
    const check = setInterval(async () => {
      if (await isPortOpen(REDIS_PORT)) {
        clearInterval(check);
        resolve({ started: true, alreadyRunning: false });
      }
      if (++attempts > 12) {
        clearInterval(check);
        resolve({ started: false, alreadyRunning: false });
      }
    }, 250);
  });
}

// ─── ChromaDB ────────────────────────────────────────────────────────────────

export async function ensureChroma(): Promise<{ started: boolean; alreadyRunning: boolean }> {
  // Zaten çalışıyor mu?
  if (await isPortOpen(CHROMA_PORT)) {
    return { started: true, alreadyRunning: true };
  }

  // chroma veya python var mı?
  const hasChroma = commandExists('chroma');
  const hasPython = commandExists('python') || commandExists('python3');

  if (!hasChroma && !hasPython) {
    return { started: false, alreadyRunning: false };
  }

  // Veri dizinini oluştur
  if (!fs.existsSync(CHROMA_DATA_DIR)) {
    fs.mkdirSync(CHROMA_DATA_DIR, { recursive: true });
  }

  return new Promise((resolve) => {
    const args = hasChroma
      ? ['run', '--path', CHROMA_DATA_DIR, '--port', String(CHROMA_PORT)]
      : ['-m', 'chromadb.cli.cli', 'run', '--path', CHROMA_DATA_DIR, '--port', String(CHROMA_PORT)];

    const cmd = hasChroma ? 'chroma' : (commandExists('python3') ? 'python3' : 'python');

    _chromaProc = spawn(cmd, args, {
      detached: false,
      stdio: 'ignore',
      env: { ...process.env, ANONYMIZED_TELEMETRY: 'False' },
    });

    _chromaProc.on('error', () => resolve({ started: false, alreadyRunning: false }));

    // Portun açılmasını bekle (max 8 sn — ChromaDB Python yükleme süresi)
    let attempts = 0;
    const check = setInterval(async () => {
      if (await isPortOpen(CHROMA_PORT)) {
        clearInterval(check);
        resolve({ started: true, alreadyRunning: false });
      }
      if (++attempts > 32) {
        clearInterval(check);
        resolve({ started: false, alreadyRunning: false });
      }
    }, 250);
  });
}

// ─── Her ikisini birden başlat ────────────────────────────────────────────────

export interface ServicesStatus {
  redis: 'running' | 'started' | 'unavailable';
  chromadb: 'running' | 'started' | 'unavailable';
}

export async function startServices(): Promise<ServicesStatus> {
  // Paralel başlat
  const [redisResult, chromaResult] = await Promise.all([
    ensureRedis(),
    ensureChroma(),
  ]);

  // Env URL'lerini güncelle (memory.ts kullanabilsin)
  if (redisResult.started) {
    process.env.REDIS_URL = `redis://localhost:${REDIS_PORT}`;
  }
  if (chromaResult.started) {
    process.env.CHROMA_URL = `http://localhost:${CHROMA_PORT}`;
  }

  return {
    redis: !redisResult.started ? 'unavailable' : redisResult.alreadyRunning ? 'running' : 'started',
    chromadb: !chromaResult.started ? 'unavailable' : chromaResult.alreadyRunning ? 'running' : 'started',
  };
}

// ─── Kapat (sadece biz başlattıysak) ─────────────────────────────────────────

export function stopServices(): void {
  if (_redisProc) {
    _redisProc.kill('SIGTERM');
    _redisProc = null;
  }
  if (_chromaProc) {
    _chromaProc.kill('SIGTERM');
    _chromaProc = null;
  }
}
