import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Message } from './ai-service';

const CACHE_DIR = '.deha/cache';

function ensureCacheDir(): string {
  const dir = path.resolve(CACHE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Prompt mesajlarını + system prompt'u hash'le */
function hashPrompt(systemPrompt: string, messages: Message[], model: string): string {
  const data = JSON.stringify({ systemPrompt, messages, model });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function getCached(systemPrompt: string, messages: Message[], model: string): string | null {
  try {
    const dir = ensureCacheDir();
    const hash = hashPrompt(systemPrompt, messages, model);
    const file = path.join(dir, `${hash}.json`);
    if (!fs.existsSync(file)) return null;
    const cached = JSON.parse(fs.readFileSync(file, 'utf-8')) as { response: string; ts: number };
    // 1 saatten eski cache'leri sayma
    if (Date.now() - cached.ts > 3600_000) {
      fs.unlinkSync(file);
      return null;
    }
    return cached.response;
  } catch {
    return null;
  }
}

export function setCache(systemPrompt: string, messages: Message[], model: string, response: string): void {
  try {
    const dir = ensureCacheDir();
    const hash = hashPrompt(systemPrompt, messages, model);
    const file = path.join(dir, `${hash}.json`);
    fs.writeFileSync(file, JSON.stringify({ response, ts: Date.now() }), 'utf-8');
  } catch {
    // Cache hatası sessiz geç
  }
}

/** Cache dizinini temizle */
export function clearCache(): number {
  const dir = path.resolve(CACHE_DIR);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) {
      fs.unlinkSync(path.join(dir, f));
      count++;
    }
  }
  return count;
}

/** Cache istatistikleri */
export function cacheStats(): { fileCount: number; sizeBytes: number } {
  const dir = path.resolve(CACHE_DIR);
  if (!fs.existsSync(dir)) return { fileCount: 0, sizeBytes: 0 };
  let sizeBytes = 0;
  let fileCount = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) {
      fileCount++;
      try { sizeBytes += fs.statSync(path.join(dir, f)).size; } catch { /* */ }
    }
  }
  return { fileCount, sizeBytes };
}
