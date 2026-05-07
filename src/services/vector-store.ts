/**
 * Vector Store — Vektör Depolama Soyutlaması
 *
 * ChromaDB kullanılabilir durumdaysa onu kullanır, değilse JSON file-based
 * basit bir depolamaya düşer. Bu sayede Chroma/Python bağımlılığı olmadan
 * da DEHA çalışabilir.
 *
 * Kullanım:
 *   import { getVectorStore } from './services/vector-store';
 *   const store = await getVectorStore();
 *   await store.add({ id, role, content, embedding, timestamp });
 *   const results = await store.search(embedding, 5);
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  embedding: number[];
  timestamp: number;
}

export interface SearchResult {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  score: number;
  timestamp: number;
}

export interface VectorStore {
  /** Tek bir mesaj ekle */
  add(msg: StoredMessage): Promise<void>;
  /** Embedding'e en yakın N mesajı getir */
  search(embedding: number[], topN: number): Promise<SearchResult[]>;
  /** Tüm mesajları sil */
  clear(): Promise<void>;
  /** Depodaki mesaj sayısı */
  count(): Promise<number>;
  /** Bağlantı/kapama */
  close(): Promise<void>;
}

// ─── JSON File-Based Store (Fallback) ────────────────────────────────────────

const JSON_STORE_DIR = path.join(require('os').homedir(), '.deha', 'vector-store');

export class JsonVectorStore implements VectorStore {
  private filePath: string;
  private messages: StoredMessage[] = [];
  private loaded = false;

  constructor(namespace = 'default') {
    this.filePath = path.join(JSON_STORE_DIR, `${namespace}.json`);
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.messages = JSON.parse(raw);
      }
    } catch {
      this.messages = [];
    }
  }

  private save(): void {
    try {
      if (!fs.existsSync(JSON_STORE_DIR)) {
        fs.mkdirSync(JSON_STORE_DIR, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.messages), 'utf-8');
    } catch (err) {
      logger.warn('Vector store kaydetme hatası', err);
    }
  }

  async add(msg: StoredMessage): Promise<void> {
    this.load();
    this.messages.push(msg);
    this.save();
  }

  async search(embedding: number[], topN: number): Promise<SearchResult[]> {
    this.load();
    if (this.messages.length === 0) return [];

    // Cosine similarity
    const scored = this.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      score: cosineSimilarity(embedding, m.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => ({
      id: s.id,
      role: s.role,
      content: s.content,
      score: s.score,
      timestamp: s.timestamp,
    }));
  }

  async clear(): Promise<void> {
    this.messages = [];
    this.save();
  }

  async count(): Promise<number> {
    this.load();
    return this.messages.length;
  }

  async close(): Promise<void> {
    this.save();
  }
}

// ─── Cosine Similarity ───────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Embedding (Basit) ───────────────────────────────────────────────────────

/**
 * Basit bir embedding fonksiyonu — kelime frekansı vektörü çıkarır.
 * Gerçek kullanımda AI modeli ile embedding alınmalı, ancak
 * Chroma yokken basit bir arama yapılabilmesi için yeterli.
 */
export function simpleEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  // İlk 100 kelimeyle sınırlı vektör
  const keys = [...freq.keys()].slice(0, 100);
  return keys.map((k) => freq.get(k) || 0);
}

// ─── Store Factory ───────────────────────────────────────────────────────────

let _store: VectorStore | null = null;

export async function getVectorStore(): Promise<VectorStore> {
  if (_store) return _store;

  // Önce ChromaDB'yi dene
  const chroma = await tryChromaDB();
  if (chroma) {
    _store = chroma;
    logger.debug('Vector store: ChromaDB');
    return _store;
  }

  // Yoksa JSON fallback
  _store = new JsonVectorStore();
  logger.debug('Vector store: JSON file-based');
  return _store;
}

export function resetVectorStore(): void {
  if (_store) {
    _store.close().catch(() => {});
    _store = null;
  }
}

// ─── ChromaDB Entegrasyonu ───────────────────────────────────────────────────

async function tryChromaDB(): Promise<VectorStore | null> {
  try {
    const url = process.env.CHROMA_URL || 'http://localhost:8000';

    // Port açık mı kontrol et
    const isOpen = await isPortOpen(url);
    if (!isOpen) return null;

    const { ChromaClient } = await import('chromadb');
    const client = new ChromaClient({ path: url });

    const collectionName = process.env.CHROMA_COLLECTION || 'deha_memory';
    let collection;
    try {
      collection = await client.getOrCreateCollection({ name: collectionName });
    } catch {
      return null;
    }

    return new ChromaVectorStore(collection);
  } catch {
    return null;
  }
}

async function isPortOpen(url: string): Promise<boolean> {
  try {
    const http = await import('http');
    const urlObj = new URL(url);
    return new Promise((resolve) => {
      const req = http.get(`${urlObj.protocol}//${urlObj.hostname}:${urlObj.port || 8000}/api/v1/heartbeat`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

// ─── ChromaDB Store Implementation ───────────────────────────────────────────

class ChromaVectorStore implements VectorStore {
  private collection: any;

  constructor(collection: any) {
    this.collection = collection;
  }

  async add(msg: StoredMessage): Promise<void> {
    try {
      await this.collection.add({
        ids: [msg.id],
        embeddings: [msg.embedding],
        metadatas: [{ role: msg.role, content: msg.content, timestamp: msg.timestamp }],
        documents: [msg.content],
      });
    } catch {
      // Sessiz geç — Chroma hatası kritik değil
    }
  }

  async search(embedding: number[], topN: number): Promise<SearchResult[]> {
    try {
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: topN,
      });
      const ids: string[] = results.ids[0] || [];
      const metadatas: any[] = results.metadatas[0] || [];
      const distances: number[] = results.distances[0] || [];

      return ids.map((id, i) => ({
        id,
        role: metadatas[i]?.role || 'user',
        content: metadatas[i]?.content || '',
        score: distances[i] !== undefined ? 1 - distances[i] : 0,
        timestamp: metadatas[i]?.timestamp || 0,
      }));
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await this.collection.delete({ where: {} });
    } catch { /* */ }
  }

  async count(): Promise<number> {
    try {
      const c = await this.collection.count();
      return c as number;
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    // Chroma istemcisinin kapanma metodu yok
  }
}
