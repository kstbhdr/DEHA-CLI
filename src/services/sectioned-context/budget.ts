/**
 * Bölümlü context bütçesi.
 *
 * Toplam context (64k / 128k / 256k ...) oranla bölünür; böylece kullanıcı
 * `DEHA_MAX_CONTEXT_TOKENS` ile hangi boyutu seçerse seçsin aynı mantık çalışır.
 *
 *   Toplam
 *    ├─ Çıktı rezervi      (model cevabı + tool çağrısı)
 *    ├─ Güvenlik payı      (token tahmin hatası için)
 *    ├─ Sabit önek         (system prompt + tool şemaları + statik proje bağlamı) — ölçülür
 *    └─ Bölüm bütçesi
 *        ├─ 1. Görev        %5   (asla silinmez)
 *        ├─ 2. Plan / Brain %15
 *        ├─ 3. Değişiklikler %10
 *        └─ 4. Tool günlüğü %70  (çalışma hafızası)
 */

export interface SectionRatios {
  task: number;
  plan: number;
  changes: number;
  tools: number;
}

export const DEFAULT_SECTION_RATIOS: SectionRatios = { task: 5, plan: 15, changes: 10, tools: 70 };

export interface SectionBudgets {
  total: number;
  outputReserve: number;
  safetyReserve: number;
  fixedPrefix: number;
  sections: number;
  task: number;
  plan: number;
  changes: number;
  tools: number;
}

const CHARS_PER_TOKEN = 3.5;
const MIN_SECTION_TOKENS = 4_000;

export function estimateTextTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tokensToChars(tokens: number): number {
  return Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN));
}

/** "5,15,10,70" biçimindeki oranları okur; geçersizse varsayılana döner. */
export function parseSectionRatios(raw: string | undefined): SectionRatios {
  if (!raw) return { ...DEFAULT_SECTION_RATIOS };
  const parts = raw.split(/[,;\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0) || parts.reduce((a, b) => a + b, 0) <= 0) {
    return { ...DEFAULT_SECTION_RATIOS };
  }
  const [task, plan, changes, tools] = parts;
  return { task, plan, changes, tools };
}

/**
 * Çıktı rezervi: modelin tool-call `max_tokens` değeri, context'in %8–%25'i
 * aralığına sıkıştırılır (48k `toolMaxTokens` 64k context'i yutmasın diye).
 */
export function computeOutputReserve(totalContext: number, requestedMaxTokens?: number): number {
  const wanted = requestedMaxTokens && requestedMaxTokens > 0 ? requestedMaxTokens : Math.round(totalContext * 0.12);
  return Math.round(Math.min(Math.max(wanted, totalContext * 0.08), totalContext * 0.25));
}

export function computeSectionBudgets(
  totalContext: number,
  fixedPrefixTokens: number,
  options: { outputReserve?: number; ratios?: SectionRatios } = {},
): SectionBudgets {
  const outputReserve = options.outputReserve ?? computeOutputReserve(totalContext);
  const safetyReserve = Math.round(totalContext * 0.03);
  const sections = totalContext - outputReserve - safetyReserve - fixedPrefixTokens;
  if (sections < MIN_SECTION_TOKENS) throw new Error(`Bağlam bütçesi yetersiz: ${totalContext} token penceresinde sabit bağlam ve çıktı rezervinden sonra ${sections} token kaldı. Sabit proje bağlamını/araç şemalarını azaltın veya context limitini artırın. Görev belleği korunuyor.`);
  const r = options.ratios ?? DEFAULT_SECTION_RATIOS;
  const sum = r.task + r.plan + r.changes + r.tools || 1;
  const task = Math.floor((sections * r.task) / sum);
  const plan = Math.floor((sections * r.plan) / sum);
  const changes = Math.floor((sections * r.changes) / sum);
  const tools = sections - task - plan - changes;
  return { total: totalContext, outputReserve, safetyReserve, fixedPrefix: fixedPrefixTokens, sections, task, plan, changes, tools };
}

/** Metni ortadan kırpar: baş %60 + son %40 korunur. */
export function truncateMiddle(text: string, maxChars: number, label = 'kırpıldı'): string {
  if (!text || text.length <= maxChars) return text;
  if (maxChars < 80) return text.slice(0, Math.max(0, maxChars));
  const note = `\n[... ${text.length} karakterden ${maxChars} tutuldu — ${label} ...]\n`;
  const available = Math.max(0, maxChars - note.length);
  const head = Math.floor(available * 0.6);
  const tail = available - head;
  return text.slice(0, head) + note + (tail > 0 ? text.slice(-tail) : '');
}

export function oneLine(text: string, maxChars: number): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > maxChars ? flat.slice(0, Math.max(0, maxChars - 1)) + '…' : flat;
}
