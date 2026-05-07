/**
 * DEHA Memory Service
 *
 * Mimari:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Context window  │ Son 5 mesaj — modele doğrudan eklenir │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Redis           │ Tüm konuşma + embedding'ler           │
 *  │                  │ Semantic search: alakalı eski mesajlar │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Vector Store    │ Cold archive — ChromaDB veya JSON     │
 *  │                  │ Her mesajda async write (non-blocking) │
 *  └─────────────────────────────────────────────────────────┘
 *
 * getContext(userMsg) döner:
 *   [...son5Mesaj, ...redisSemanticArama(userMsg, top3)]
 */

import * as crypto from 'crypto';
import axios from 'axios';
import type { Message } from './ai-service';
import { getVectorStore, StoredMessage } from './vector-store';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const HOT_WINDOW = 5;           // bağlama doğrudan eklenecek son N mesaj
const SEMANTIC_TOP_K = 3;       // Redis'ten getirilecek alakalı mesaj sayısı
const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2);
const REDIS_PREFIX = 'deha:msg:';
const REDIS_SESSION_INDEX = `deha:session:${SESSION_ID}`;

// ─── Redis bağlantısı (opsiyonel) ─────────────────────────────────────────

type RedisClient = {
  hset(key: string, ...args: unknown[]): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string> | null>;
  sadd(key: string, ...members: string[]): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  quit(): Promise<unknown>;
};

let _redis: RedisClient | null = null;
let _redisChecked = false;

async function getRedis(): Promise<RedisClient | null> {
  if (_redisChecked) return _redis;
  _redisChecked = true;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, { 
      lazyConnect: true, 
      connectTimeout: 2000, 
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      showFriendlyErrorStack: false
    });
    client.on('error', () => {});
    await client.connect();
    _redis = client as unknown as RedisClient;
  } catch {
    _redis = null;
  }
  return _redis;
}

// ─── In-memory fallback (Redis yoksa) ────────────────────────────────────────

const _memStore: StoredMessage[] = [];

// ─── Embedding üretimi ────────────────────────────────────────────────────────

/**
 * OpenAI embeddings API ile vektör üretir.
 * API key yoksa veya hata alırsa basit hash-tabanlı vektöre düşer.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/embeddings',
        { model: 'text-embedding-3-small', input: text.slice(0, 8192) },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 8000 },
      );
      return res.data.data[0].embedding as number[];
    } catch {
      // API hatası → fallback
    }
  }
  return _hashEmbedding(text);
}

/** Basit hash-tabanlı embedding (API yoksa) */
function _hashEmbedding(text: string): number[] {
  const dim = 128;
  const vec = new Array<number>(dim).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const word of words) {
    const hash = crypto.createHash('md5').update(word).digest();
    for (let i = 0; i < dim; i++) {
      vec[i] += (hash[i % 16] / 255) * 2 - 1;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

/** Cosine similarity */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ─── Ana fonksiyonlar ─────────────────────────────────────────────────────────

/**
 * Yeni mesajı Redis'e kaydeder + Vector Store'a arka planda yazar.
 */
export async function addMessage(message: Message): Promise<void> {
  const embedding = await generateEmbedding(message.content);
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    role: message.role as 'user' | 'assistant',
    content: message.content,
    embedding,
    timestamp: Date.now(),
  };

  // Redis'e yaz
  const redis = await getRedis();
  if (redis) {
    const key = REDIS_PREFIX + stored.id;
    await redis.hset(key,
      'id', stored.id,
      'role', stored.role,
      'content', stored.content,
      'embedding', JSON.stringify(stored.embedding),
      'timestamp', stored.timestamp.toString(),
    );
    await redis.sadd(REDIS_SESSION_INDEX, stored.id);
  } else {
    _memStore.push(stored);
  }

  // Vector store'a arka planda yaz (ChromaDB veya JSON)
  const vs = await getVectorStore();
  vs.add(stored).catch(() => {});
}

/**
 * Modele gönderilecek bağlamı oluşturur:
 *   1. Son 5 mesaj (tam metin)
 *   2. Redis'ten semantic arama → en alakalı top-K eski mesaj
 */
export async function getContext(
  currentUserMessage: string,
  allMessages: Message[],
): Promise<Message[]> {
  const hot = allMessages.slice(-HOT_WINDOW);
  const hotIds = new Set(hot.map(m => m.content));
  const relevant = await _semanticSearch(currentUserMessage, SEMANTIC_TOP_K, hotIds);

  if (relevant.length === 0) return hot;

  const contextNote: Message = {
    role: 'user',
    content: `[RELEVANT PAST CONTEXT]\n${relevant.map(m => `${m.role}: ${m.content.slice(0, 300)}`).join('\n---\n')}`,
  };
  const contextAck: Message = {
    role: 'assistant',
    content: 'I have the relevant context from our previous conversation.',
  };

  return [contextNote, contextAck, ...hot];
}

/**
 * Redis veya in-memory'den semantic arama yapar.
 */
async function _semanticSearch(
  query: string,
  topK: number,
  exclude: Set<string>,
): Promise<StoredMessage[]> {
  const queryEmb = await generateEmbedding(query);

  let allMessages: StoredMessage[] = [];

  const redis = await getRedis();
  if (redis) {
    const ids = await redis.smembers(REDIS_SESSION_INDEX);
    const results = await Promise.all(
      ids.map(async (id) => {
        const raw = await redis.hgetall(REDIS_PREFIX + id);
        if (!raw) return null;
        return {
          id: raw.id,
          role: raw.role as 'user' | 'assistant',
          content: raw.content,
          embedding: JSON.parse(raw.embedding || '[]') as number[],
          timestamp: parseInt(raw.timestamp, 10),
        } as StoredMessage;
      }),
    );
    allMessages = results.filter((r): r is StoredMessage => r !== null);
  } else {
    allMessages = [..._memStore];
  }

  const candidates = allMessages
    .slice(0, -HOT_WINDOW)
    .filter(m => !exclude.has(m.content));

  if (candidates.length === 0) return [];

  return candidates
    .map(m => ({ msg: m, score: cosineSimilarity(queryEmb, m.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0.3)
    .sort((a, b) => a.msg.timestamp - b.msg.timestamp)
    .map(r => r.msg);
}

/**
 * Uygulama kapanırken bağlantıları kapat.
 */
export async function closeMemory(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => {});
    _redis = null;
  }
  const { resetVectorStore } = await import('./vector-store');
  resetVectorStore();
}

/** Bağlantı durumunu raporla */
export async function getMemoryStatus(): Promise<{ redis: boolean; vectorStore: string; stored: number }> {
  const redis = await getRedis();
  const vs = await getVectorStore();
  const vsName = vs.constructor.name === 'ChromaVectorStore' ? 'chromadb' : 'json';
  const count = redis
    ? (await redis.smembers(REDIS_SESSION_INDEX)).length
    : _memStore.length;
  return { redis: redis !== null, vectorStore: vsName, stored: count };
}
