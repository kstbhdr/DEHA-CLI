import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'deha-vector-test-' + Date.now());

describe('JsonVectorStore', () => {
  let JsonVectorStore: typeof import('../services/vector-store').JsonVectorStore;
  let simpleEmbedding: typeof import('../services/vector-store').simpleEmbedding;

  beforeEach(async () => {
    // Force fresh import by manipulating module path
    const mod = await import('../services/vector-store');
    JsonVectorStore = mod.JsonVectorStore;
    simpleEmbedding = mod.simpleEmbedding;
  });

  afterEach(() => {
    // Cleanup test files
    try {
      const dir = path.join(os.homedir(), '.deha', 'vector-store');
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.startsWith('test-')) {
            fs.unlinkSync(path.join(dir, f));
          }
        }
      }
    } catch { /* */ }
  });

  it('boş depoda arama sonuç vermez', async () => {
    const store = new JsonVectorStore('test-empty');
    const results = await store.search([1, 0, 0], 5);
    expect(results).toHaveLength(0);
    await store.close();
  });

  it('mesaj eklenebilir ve sayılabilir', async () => {
    const store = new JsonVectorStore('test-count');
    await store.add({
      id: '1',
      role: 'user',
      content: 'Merhaba',
      embedding: [1, 0, 0],
      timestamp: Date.now(),
    });
    expect(await store.count()).toBe(1);
    await store.close();
  });

  it('benzer embedding ile arama yapılabilir', async () => {
    const store = new JsonVectorStore('test-search');
    await store.add({
      id: '1', role: 'user', content: 'kedi',
      embedding: [1, 0, 0], timestamp: 1,
    });
    await store.add({
      id: '2', role: 'assistant', content: 'köpek',
      embedding: [0, 1, 0], timestamp: 2,
    });
    await store.add({
      id: '3', role: 'user', content: 'kuş',
      embedding: [0, 0, 1], timestamp: 3,
    });

    // [1, 0, 0]'a en yakın → "kedi" (id:1)
    const results = await store.search([0.9, 0.1, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[0].score).toBeGreaterThan(0.9);

    await store.close();
  });

  it('clear tüm mesajları siler', async () => {
    const store = new JsonVectorStore('test-clear');
    await store.add({
      id: '1', role: 'user', content: 'test',
      embedding: [1], timestamp: 1,
    });
    await store.clear();
    expect(await store.count()).toBe(0);
    await store.close();
  });

  it('veriler diskten geri yüklenir', async () => {
    const store1 = new JsonVectorStore('test-persist');
    await store1.add({
      id: '1', role: 'user', content: 'kalıcı mesaj',
      embedding: [1, 0], timestamp: 1,
    });
    await store1.close();

    // Yeni store instance'ı aynı namespace ile açılınca eski veriyi görmeli
    const store2 = new JsonVectorStore('test-persist');
    expect(await store2.count()).toBe(1);
    const results = await store2.search([1, 0], 5);
    expect(results[0].content).toBe('kalıcı mesaj');
    await store2.close();
  });

  it('simpleEmbedding kelime frekans vektörü üretir', () => {
    const emb = simpleEmbedding('merhaba dünya merhaba');
    // "merhaba" 2 kere, "dünya" 1 kere
    expect(emb.length).toBeGreaterThan(0);
    // İlk kelime "merhaba" → frekansı 2
    expect(emb[0]).toBe(2);
  });

  it('simpleEmbedding boş metin için boş vektör döner', () => {
    const emb = simpleEmbedding('');
    expect(emb).toHaveLength(0);
  });
});
