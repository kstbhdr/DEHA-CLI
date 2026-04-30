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
    const s = net.createConnection({ port }); // host belirtmeyerek localhost (IPv4/IPv6) desteği sağlıyoruz
    s.setTimeout(600);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error',   () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
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
    // redis-memory-server: npm paketi ile gelen binary'yi kullan
    const { RedisMemoryServer } = await import('redis-memory-server');
    const server = new RedisMemoryServer({
      instance: { port: REDIS_PORT },
      binary: { downloadDir: path.join(os.homedir(), '.deha', 'redis-bin') },
    });
    await server.start();
    process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;

    // Kapanışta durdur
    process.once('exit', () => server.stop().catch(() => {}));
    return 'started';
  } catch {
    // redis-memory-server başaramazsa sistem redis-server'ı dene
    if (!which('redis-server')) return 'unavailable';

    _redisProc = spawn('redis-server', ['--port', String(REDIS_PORT), '--loglevel', 'warning'], {
      stdio: 'ignore',
    });
    _redisProc.on('error', () => {});

    const ok = await waitPort(REDIS_PORT, 3000);
    if (ok) {
      process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
      return 'started';
    }
    return 'unavailable';
  }
}

// ─── ChromaDB (Python auto-install) ──────────────────────────────────────────

export async function ensureChroma(): Promise<'running' | 'started' | 'unavailable'> {
  if (await isPortOpen(CHROMA_PORT)) return 'running';

  const py = which('python3') ? 'python3' : 'python';

  // İlk kullanımda chromadb pip paketi kur (flag dosyası yoksa)
  if (!fs.existsSync(CHROMA_FLAG)) {
    try {
      // PEP 668 engeli için --break-system-packages ekliyoruz (Debian/Ubuntu 12+ için gerekli)
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

  // Veri dizini
  fs.mkdirSync(CHROMA_DATA, { recursive: true });

  // Yeni ChromaDB (1.x+) CLI modülü olarak çalıştırılamıyor (if __name__ == "__main__" bloğu yok)
  // Bu yüzden doğrudan app() fonksiyonunu tetikleyen bir script veya varsa 'chroma' binary'sini kullanıyoruz.
  const chromaBin = which('chroma') ? 'chroma' : null;

  if (chromaBin) {
    _chromaProc = spawn(
      chromaBin,
      ['run', '--path', CHROMA_DATA, '--port', String(CHROMA_PORT)],
      { stdio: 'ignore', env: { ...process.env, ANONYMIZED_TELEMETRY: 'False' } },
    );
  } else {
    // Python üzerinden app entrypoint'ini manuel tetikle (1.x ve 0.x uyumluluğu için)
    const startScript = `from chromadb.cli.cli import app; import sys; sys.argv=['chroma','run','--path',r'${CHROMA_DATA}','--port','${CHROMA_PORT}']; app()`;
    _chromaProc = spawn(
      py,
      ['-c', startScript],
      { stdio: 'ignore', env: { ...process.env, ANONYMIZED_TELEMETRY: 'False' } },
    );
  }
  
  _chromaProc.on('error', () => {});

  const ok = await waitPort(CHROMA_PORT, 12_000); // Python import süresi için 12 sn
  if (ok) {
    process.env.CHROMA_URL = `http://127.0.0.1:${CHROMA_PORT}`;
    return 'started';
  }
  return 'unavailable';
}

// ─── Her ikisini paralel başlat ───────────────────────────────────────────────

export interface ServicesStatus {
  redis:   'running' | 'started' | 'unavailable';
  chromadb:'running' | 'started' | 'unavailable';
}

export async function startServices(): Promise<ServicesStatus> {
  const [redis, chromadb] = await Promise.all([ensureRedis(), ensureChroma()]);
  return { redis, chromadb };
}

// ─── Kapat (sadece biz başlattıysak) ─────────────────────────────────────────

export function stopServices(): void {
  _redisProc?.kill('SIGTERM');
  _chromaProc?.kill('SIGTERM');
  _redisProc  = null;
  _chromaProc = null;
}
