/**
 * 4. Bölüm — Tool günlüğü (çalışma hafızası).
 *
 * Son round'lar API'ye yerel tool mesajları olarak TAM gider (assembler).
 * Native pencereden çıkan eski çağrılar burada LLM KULLANILMADAN, kurala dayalı
 * tek satırlık özetlere dönüşür:
 *   #12 run_shell(python solver_v8.py --task 3) → exit 1 · AssertionError: grid 2 · 0/1 çözüldü
 * Neden LLM yok: maliyet/gecikme olmasın ve özet uydurulmasın.
 */

import { ToolLogEntry } from './store';
import { oneLine, tokensToChars } from './budget';

const ERROR_LINE = /(traceback|error|exception|failed|fatal|panic|hata|bulunamadı|not found|denied|refused|timed? ?out|zaman aşımı)/i;
const METRIC_LINE = /(score|skor|accuracy|acc\b|solved|çözül|passed|failed|loss|reward|\b\d+\s*\/\s*\d+\b|\d+(\.\d+)?\s*%|tests?\b.*\d)/i;

/** Tool argümanlarından kısa, anlamlı bir önizleme üretir. */
export function formatToolArgs(name: string, input: Record<string, unknown>): string {
  const pick = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  const primary = pick('command') || pick('code') || pick('path') || pick('pattern') || pick('url') || pick('query') || pick('action');
  if (name === 'brain') return `${pick('action')}${input.text ? `: ${pick('text')}` : ''}`;
  if (primary) return oneLine(primary, 120);
  try { return oneLine(JSON.stringify(input), 120); } catch { return ''; }
}

export function isFailedResult(result: string): boolean {
  const r = (result || '').trim();
  if (!r) return true;
  const head = r.slice(0, 400).toLowerCase();
  if (/^(hata|error|✗|failed|fatal)/.test(head)) return true;
  if (/exit (code|status)[:= ]+[1-9]/.test(head)) return true;
  if (/traceback \(most recent call last\)/i.test(r)) return true;
  return false;
}

/** Kurala dayalı tek satırlık özet (≤ ~300 karakter). */
export function summarizeToolResult(name: string, result: string): { summary: string; ok: boolean } {
  const text = (result || '').replace(/\r/g, '');
  const ok = !isFailedResult(text);
  if (!text.trim()) return { summary: '(boş sonuç)', ok: false };
  if (name === 'brain') return { summary: oneLine(text, 120), ok };
  if (['start_job', 'wait_job', 'cancel_job', 'list_jobs'].includes(name)) {
    try {
      const value = JSON.parse(text);
      const jobs = Array.isArray(value) ? value : [value];
      const summary = jobs.map(j => `${j.job_id || j.id} ${j.status}${j.exit_code !== undefined ? ` exit ${j.exit_code}` : ''}`).join(' · ');
      return { summary: oneLine(summary, 300), ok: jobs.every(j => !['failed', 'timed_out', 'lost'].includes(j.status)) };
    } catch { /* Preserve ordinary error messages below. */ }
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parts: string[] = [];

  const exit = /exit(?: code| status)?[:= ]+(-?\d+)/i.exec(text);
  if (exit) parts.push(`exit ${exit[1]}`);

  if (name === 'read_file' || name === 'cat') {
    parts.push(`${lines.length} satır okundu`);
  }

  // Python traceback'lerinde asıl hata son satırdadır
  const errorLines = lines.filter(l => ERROR_LINE.test(l));
  if (errorLines.length > 0) {
    const last = errorLines[errorLines.length - 1];
    const firstReal = errorLines.find(l => !/^traceback/i.test(l)) ?? last;
    parts.push(oneLine(/traceback/i.test(text) ? last : firstReal, 140));
  }

  const metrics = lines.filter(l => METRIC_LINE.test(l) && !errorLines.includes(l)).slice(-3);
  for (const m of metrics) parts.push(oneLine(m, 90));

  if (parts.length === 0 || (parts.length === 1 && exit)) {
    const first = oneLine(lines[0] ?? '', 120);
    const last = lines.length > 1 ? oneLine(lines[lines.length - 1], 120) : '';
    parts.push(last && last !== first ? `${first} … ${last}` : first);
  }

  const uniq = parts.filter((p, i) => p && parts.indexOf(p) === i);
  return { summary: oneLine(uniq.join(' · '), 300), ok };
}

function entryLine(e: ToolLogEntry, withPurpose: boolean): string {
  const mark = e.ok ? '' : ' ✗';
  const base = `#${e.seq} ${e.name}(${e.args}) →${mark} ${e.summary}`;
  return withPurpose && e.purpose ? `${base}\n    amaç: ${oneLine(e.purpose, 140)}` : base;
}

function groupLine(group: ToolLogEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of group) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  const byName = [...counts.entries()].map(([n, c]) => `${n}×${c}`).join(', ');
  const failed = group.filter(e => !e.ok);
  const failNote = failed.length ? ` · ${failed.length} hatalı (son: ${oneLine(failed[failed.length - 1].summary, 80)})` : '';
  return `#${group[0].seq}–#${group[group.length - 1].seq}: ${group.length} çağrı (${byName})${failNote}`;
}

/**
 * Günlüğü bütçeye sığdırır. Önce "amaç" satırları düşer, sonra en eski
 * kayıtlar 10'arlı gruplara birleşir, en son çare olarak en eski gruplar
 * "arşivlendi" notuna iner. En yeni kayıtlar her zaman tek tek görünür.
 */
export function renderToolLog(entries: ToolLogEntry[], budgetTokens: number): string {
  if (entries.length === 0) return '';
  const maxChars = tokensToChars(budgetTokens);

  const full = entries.map(e => entryLine(e, true)).join('\n');
  if (full.length <= maxChars) return full;

  type Row = { text: string; entries: ToolLogEntry[]; grouped: boolean };
  let rows: Row[] = entries.map(e => ({ text: entryLine(e, false), entries: [e], grouped: false }));
  const size = () => rows.reduce((n, r) => n + r.text.length + 1, 0);

  const GROUP = 10;
  while (size() > maxChars) {
    const firstSingle = rows.findIndex(r => !r.grouped);
    const singles = rows.slice(firstSingle).filter(r => !r.grouped).length;
    if (firstSingle >= 0 && singles > GROUP + 5) {
      const chunk = rows.slice(firstSingle, firstSingle + GROUP);
      const merged = chunk.flatMap(r => r.entries);
      rows.splice(firstSingle, GROUP, { text: groupLine(merged), entries: merged, grouped: true });
      continue;
    }
    // Sadece gruplar + az sayıda yeni kayıt kaldı: en eski satırı arşiv notuna indir
    if (rows.length <= 2) break;
    const archived = rows[0].text.startsWith('(') ? rows.shift()! : null;
    const victim = rows.shift()!;
    const prevCount = archived ? Number(/(\d+)/.exec(archived.text)?.[1] ?? 0) : 0;
    const count = prevCount + victim.entries.length;
    rows.unshift({ text: `(${count} eski çağrı arşivlendi)`, entries: [], grouped: true });
  }
  const out = rows.map(r => r.text).join('\n');
  return out.length <= maxChars ? out : out.slice(-maxChars);
}
