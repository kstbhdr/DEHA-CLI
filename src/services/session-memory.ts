/**
 * Session Memory Service
 *
 * Katmanlı bellek mimarisi:
 *  - Tier 1 (hot):  Redis (REDIS_URL varsa) veya in-memory Map — anlık erişim
 *  - Tier 2 (warm): .deha/session-buffer.json — CLI yeniden başlatılırsa geri yükle
 *  - Tier 3 (cold): ~/.deha/conversations/*.json — kalıcı arşiv (20 mesajda bir flush)
 *
 * Otomatik özetleme:
 *  - Son 5 mesaj bağlama tam olarak eklenir.
 *  - 5-20 arası mesajlar AI ile özetlenir → tek bir "context recap" olarak enjekte edilir.
 *  - 20'den eski mesajlar cold storage'a taşınır.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Message } from './ai-service';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SESSION_BUFFER_DIR = path.join(process.cwd(), '.deha');
const SESSION_BUFFER_FILE = path.join(SESSION_BUFFER_DIR, 'session-buffer.json');
const COLD_STORAGE_DIR = path.join(os.homedir(), '.deha', 'conversations');
const HOT_WINDOW = 5;    // bağlama tam olarak eklenecek son N mesaj
const WARM_WINDOW = 20;  // bu kadar mesajda bir cold storage'a yaz
const FLUSH_THRESHOLD = 20;

// ─── Redis (opsiyonel) ────────────────────────────────────────────────────────

let redisClient: RedisLike | null = null;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

async function getRedis(): Promise<RedisLike | null> {
  if (redisClient !== null) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, { lazyConnect: true, connectTimeout: 3000 });
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    return null; // Redis yoksa sessizce in-memory'ye düş
  }
}

// ─── Session state ────────────────────────────────────────────────────────────

interface SessionState {
  sessionId: string;
  messages: Message[];
  summary: string;        // eski mesajların AI özeti
  workDir: string;        // aktif çalışma dizini
  flushedCount: number;   // cold storage'a kaç mesaj yazıldı
}

let _state: SessionState = {
  sessionId: Date.now().toString(36),
  messages: [],
  summary: '',
  workDir: process.cwd(),
  flushedCount: 0,
};

const REDIS_KEY = `deha:session:${_state.sessionId}`;

// ─── Başlangıç yükleme ───────────────────────────────────────────────────────

export async function loadSession(): Promise<void> {
  // 1. Redis'ten dene
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get('deha:session:latest');
    if (raw) {
      try { _state = { ..._state, ...JSON.parse(raw) }; return; } catch { /* bozuk veri */ }
    }
  }

  // 2. Warm buffer'dan dene
  if (fs.existsSync(SESSION_BUFFER_FILE)) {
    try {
      const raw = fs.readFileSync(SESSION_BUFFER_FILE, 'utf-8');
      const saved = JSON.parse(raw) as Partial<SessionState>;
      // 10 dakikadan eski buffer'ı yoksay
      const age = Date.now() - parseInt(saved.sessionId ?? '0', 36);
      if (age < 10 * 60 * 1000) {
        _state = { ..._state, ...saved };
      }
    } catch { /* bozuk dosya */ }
  }
}

// ─── Mesaj ekleme ────────────────────────────────────────────────────────────

export async function appendMessage(message: Message): Promise<void> {
  _state.messages.push(message);

  // Her mesajdan sonra warm buffer'a yaz
  _writeWarmBuffer();

  // Redis'e async yaz (beklemiyoruz)
  _writeRedis().catch(() => {});

  // 20 mesaj biriktiyse cold storage'a flush et
  if (_state.messages.length - _state.flushedCount >= FLUSH_THRESHOLD) {
    await _flushCold(false);
  }
}

// ─── Bağlam oluşturma ─────────────────────────────────────────────────────────

/**
 * Modele gönderilecek mesaj dizisini oluşturur:
 * - Özet (varsa) başa eklenir
 * - Son HOT_WINDOW mesaj tam olarak eklenir
 */
export function buildContextMessages(pendingUserMessage?: string): Message[] {
  const msgs = _state.messages;
  const result: Message[] = [];

  // Özet varsa başa "system recap" olarak ekle
  if (_state.summary) {
    result.push({
      role: 'user',
      content: `[CONTEXT RECAP — previous conversation summary]\n${_state.summary}`,
    });
    result.push({
      role: 'assistant',
      content: 'Understood. I have the context from our previous conversation.',
    });
  }

  // Son HOT_WINDOW mesajı tam ekle
  const hot = msgs.slice(-HOT_WINDOW);
  result.push(...hot);

  if (pendingUserMessage) {
    result.push({ role: 'user', content: pendingUserMessage });
  }

  return result;
}

// ─── WorkDir yönetimi ─────────────────────────────────────────────────────────

export function setWorkDir(dir: string): void {
  _state.workDir = dir;
  _writeWarmBuffer();
}

export function getWorkDir(): string {
  return _state.workDir;
}

/** Kullanıcı mesajından dizin yolu tespit et (örn. "C:\Users\..." veya "/home/...") */
export function detectWorkDir(message: string): string | null {
  // Windows absolute path: C:\... veya C:/...
  const winMatch = message.match(/\b([A-Za-z]:[\\\/][^\s,'"]+)/);
  if (winMatch) {
    const candidate = winMatch[1].replace(/[\\\/]+$/, ''); // trailing slash kaldır
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  // Unix absolute path: /home/... or /Users/...
  const unixMatch = message.match(/\b(\/[^\s,'"]+)/);
  if (unixMatch) {
    const candidate = unixMatch[1].replace(/\/+$/, '');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

// ─── Özet oluşturma ──────────────────────────────────────────────────────────

/**
 * Eski mesajları AI ile özetler (çağıran taraf sendMessage sağlamalı).
 * Son HOT_WINDOW mesajı özetlemez, bunlar bağlamda tam kalır.
 */
export async function summarizeOld(
  summarizeFn: (messages: Message[]) => Promise<string>,
): Promise<void> {
  const msgs = _state.messages;
  if (msgs.length <= HOT_WINDOW) return;

  const toSummarize = msgs.slice(0, -HOT_WINDOW);
  if (toSummarize.length < 4) return; // özetlenecek kadar yok

  try {
    const newSummary = await summarizeFn(toSummarize);
    _state.summary = newSummary;
    // Özetlenen mesajları memory'den çıkar, sadece hot window'u tut
    _state.messages = msgs.slice(-HOT_WINDOW);
    _writeWarmBuffer();
  } catch {
    // Özetleme başarısız olursa eski mesajları koru
  }
}

// ─── Çıkışta flush ────────────────────────────────────────────────────────────

/** /exit veya SIGINT'te çağırılır — tüm kalan mesajları cold storage'a yazar */
export async function flushOnExit(): Promise<void> {
  await _flushCold(true);

  // Redis key'i temizle
  const redis = await getRedis();
  if (redis) {
    await redis.del('deha:session:latest').catch(() => {});
    await redis.quit().catch(() => {});
  }

  // Warm buffer'ı sil
  try { fs.unlinkSync(SESSION_BUFFER_FILE); } catch { /* yok olabilir */ }
}

/** Aktif session stats */
export function getSessionStats(): { messages: number; summary: boolean; workDir: string } {
  return {
    messages: _state.messages.length,
    summary: !!_state.summary,
    workDir: _state.workDir,
  };
}

// ─── Özel yardımcılar ────────────────────────────────────────────────────────

function _writeWarmBuffer(): void {
  try {
    if (!fs.existsSync(SESSION_BUFFER_DIR)) fs.mkdirSync(SESSION_BUFFER_DIR, { recursive: true });
    fs.writeFileSync(SESSION_BUFFER_FILE, JSON.stringify(_state), 'utf-8');
  } catch { /* disk hatası — sessizce geç */ }
}

async function _writeRedis(): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set('deha:session:latest', JSON.stringify(_state));
}

async function _flushCold(isFinal: boolean): Promise<void> {
  const msgs = _state.messages;
  const unflushed = msgs.slice(_state.flushedCount);
  if (!unflushed.length && !isFinal) return;

  try {
    if (!fs.existsSync(COLD_STORAGE_DIR)) {
      fs.mkdirSync(COLD_STORAGE_DIR, { recursive: true });
    }

    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(COLD_STORAGE_DIR, `${date}-${_state.sessionId}.json`);

    const record = {
      sessionId: _state.sessionId,
      workDir: _state.workDir,
      summary: _state.summary,
      messages: msgs,
      flushedAt: new Date().toISOString(),
    };

    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');
    _state.flushedCount = msgs.length;
  } catch { /* disk hatası */ }
}
