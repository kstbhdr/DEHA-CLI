/**
 * Session Memory Service — v2 (Context Compression Destekli)
 *
 * Katmanlı bellek mimarisi:
 *  - Tier 1 (hot):  Redis (REDIS_URL varsa, yoksa localhost:6379 fallback) veya in-memory Map — anlık erişim
 *  - Tier 2 (warm): .deha/session-buffer.json — CLI yeniden başlatılırsa geri yükle
 *  - Tier 3 (cold): ~/.deha/conversations/*.json — kalıcı arşiv (20 mesajda bir flush)
 *
 * Context Compression:
 *  - Token sayısı maxContextTokens * compressThreshold'u geçince otomatik compress
 *  - Eski mesajlar AI ile özetlenir → tek bir "context recap" olarak enjekte edilir
 *  - Son minHotMessages mesaj her zaman tam kalır (özetlenmez)
 *  - Özet birikimli: yeni özet = eski özet + yeni özetlenen mesajlar
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Message } from './ai-service';
import { estimateTokens, estimateMessagesTokens, getMaxContextTokens } from './token-counter';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SESSION_BUFFER_DIR = path.join(process.cwd(), '.deha');
const SESSION_BUFFER_FILE = path.join(SESSION_BUFFER_DIR, 'session-buffer.json');
const COLD_STORAGE_DIR = path.join(os.homedir(), '.deha', 'conversations');
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
  // REDIS_URL varsa onu kullan, yoksa localhost:6379'a fallback (memory.ts ile tutarlı)
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
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
  compressCount: number;  // kaç kez compress yapıldı
}

let _state: SessionState = {
  sessionId: Date.now().toString(36),
  messages: [],
  summary: '',
  workDir: process.cwd(),
  flushedCount: 0,
  compressCount: 0,
};

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
 * - Özet (varsa) başa "context recap" olarak eklenir
 * - Tüm mevcut mesajlar eklenir (compress sonrası sadece hot window kalır)
 * - Bekleyen kullanıcı mesajı varsa sona eklenir
 */
export function buildContextMessages(pendingUserMessage?: string): Message[] {
  const msgs = _state.messages;
  const result: Message[] = [];

  // Özet varsa başa "system recap" olarak ekle
  if (_state.summary) {
    result.push({
      role: 'user',
      content: `[CONTEXT RECAP — önceki konuşma özeti]\n${_state.summary}`,
    });
    result.push({
      role: 'assistant',
      content: 'Tamam, önceki konuşmamızın bağlamını aldım. Devam edelim.',
    });
  }

  // Tüm mevcut mesajları ekle (compress yapıldıysa zaten sadece hot window kalmıştır)
  result.push(...msgs);

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

// ─── Context Compression ─────────────────────────────────────────────────────

/**
 * Context sınıra yaklaştıysa otomatik compress yapar.
 * @returns compress yapıldıysa true
 */
export async function autoCompress(
  summarizeFn: (messages: Message[]) => Promise<string>,
  maxContextTokens: number,
  compressThreshold: number,
  minHotMessages: number,
): Promise<boolean> {
  const totalTokens = estimateMessagesTokens(_state.messages);
  const summaryTokens = estimateTokens(_state.summary);
  const currentUsage = totalTokens + summaryTokens;
  const threshold = maxContextTokens * compressThreshold;

  if (currentUsage < threshold) return false;

  // En az minHotMessages mesaj korunmalı, gerisi özetlenecek
  return summarizeOld(summarizeFn, minHotMessages);
}

/**
 * Eski mesajları AI ile özetler.
 * Son hotCount mesajı özetlemez, bunlar bağlamda tam kalır.
 */
export async function summarizeOld(
  summarizeFn: (messages: Message[]) => Promise<string>,
  hotCount?: number,
): Promise<boolean> {
  const minHot = hotCount ?? 10;
  const msgs = _state.messages;
  if (msgs.length <= minHot) return false;

  const toSummarize = msgs.slice(0, -minHot);
  if (toSummarize.length < 4) return false; // özetlenecek kadar yok

  try {
    const newSummary = await summarizeFn(toSummarize);

    // Birikimli özet: eski özet + yeni özet
    if (_state.summary) {
      _state.summary = `${_state.summary}\n\n---\n\n[Sonraki bölüm]\n${newSummary}`;
    } else {
      _state.summary = newSummary;
    }

    // Özetlenen mesajları memory'den çıkar, sadece hot window'u tut
    _state.messages = msgs.slice(-minHot);
    _state.compressCount++;
    _writeWarmBuffer();
    return true;
  } catch {
    // Özetleme başarısız olursa eski mesajları koru
    return false;
  }
}

/**
 * Mevcut context durumu hakkında bilgi döner.
 */
export function getContextStats(maxContextTokens: number): {
  messages: number;
  summaryTokens: number;
  messagesTokens: number;
  totalTokens: number;
  usagePercent: number;
  hasSummary: boolean;
  compressCount: number;
  workDir: string;
} {
  const summaryTokens = estimateTokens(_state.summary);
  const messagesTokens = estimateMessagesTokens(_state.messages);
  const totalTokens = summaryTokens + messagesTokens;
  return {
    messages: _state.messages.length,
    summaryTokens,
    messagesTokens,
    totalTokens,
    usagePercent: maxContextTokens > 0 ? (totalTokens / maxContextTokens) * 100 : 0,
    hasSummary: !!_state.summary,
    compressCount: _state.compressCount,
    workDir: _state.workDir,
  };
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

/** Aktif session stats (eski uyumluluk) */
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
