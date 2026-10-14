/**
 * 3. Bölüm — Değişiklik defteri (Change Ledger).
 *
 * Model bir şey yazmak zorunda değil: write_file / edit_file / insert_lines /
 * delete_lines ve dosya değiştiren shell komutlarından OTOMATİK çıkarılır.
 * Aynı dosyaya yapılan düzenlemeler tek kayıtta birleşir.
 */

import { ChangeRecord } from './store';
import { oneLine, tokensToChars } from './budget';

const MAX_NOTES_PER_FILE = 6;
const SHELL_MUTATION = /(^|[;&|]\s*)(sed\s+-i|tee\s|mv\s|cp\s|rm\s|touch\s|chmod\s|git\s+(commit|checkout|reset|apply|merge|rebase|stash|restore)|pip\s+install|npm\s+(install|i)\s|apt(-get)?\s+install|patch\s)|[^2&]>{1,2}\s*[\w./~-]/;

function lineCount(text: unknown): number {
  const s = typeof text === 'string' ? text : '';
  return s.length === 0 ? 0 : s.split('\n').length;
}

function looksFailed(result: string): boolean {
  const head = (result || '').slice(0, 300).toLowerCase();
  return /^(hata|error|✗|failed)/.test(head.trim()) || head.includes('bulunamadı') || head.includes('not found') || head.includes('iptal');
}

function upsert(changes: ChangeRecord[], filePath: string, seq: number): ChangeRecord {
  let rec = changes.find(c => c.path === filePath);
  if (!rec) {
    rec = { path: filePath, edits: 0, added: 0, removed: 0, notes: [], firstSeq: seq, lastSeq: seq };
    changes.push(rec);
  }
  rec.lastSeq = seq;
  rec.edits++;
  return rec;
}

function addNote(rec: ChangeRecord, note: string): void {
  const n = oneLine(note, 140);
  if (!n) return;
  rec.notes.push(n);
  if (rec.notes.length > MAX_NOTES_PER_FILE) rec.notes = rec.notes.slice(-MAX_NOTES_PER_FILE);
}

/**
 * Tool çağrısı dosya değiştirdiyse deftere işler. Değişiklik kaydedildiyse true.
 * `purpose`: modelin tool'dan hemen önce yazdığı kısa açıklama (varsa).
 */
export function recordChange(
  changes: ChangeRecord[],
  name: string,
  input: Record<string, unknown>,
  result: string,
  seq: number,
  purpose?: string,
): boolean {
  if (looksFailed(result)) return false;
  const p = typeof input.path === 'string' ? input.path : '';
  const why = purpose ? ` — ${purpose}` : '';

  switch (name) {
    case 'write_file': {
      if (!p) return false;
      const rec = upsert(changes, p, seq);
      const n = lineCount(input.content);
      rec.added += n;
      addNote(rec, `#${seq} yazıldı (${n} satır)${why}`);
      return true;
    }
    case 'edit_file': {
      if (!p) return false;
      const rec = upsert(changes, p, seq);
      const add = lineCount(input.new_string);
      const rem = lineCount(input.old_string);
      rec.added += add;
      rec.removed += rem;
      const firstNew = String(input.new_string ?? '').split('\n').map(s => s.trim()).find(Boolean) ?? '';
      addNote(rec, `#${seq} düzenlendi +${add}/-${rem}: ${purpose || firstNew}`);
      return true;
    }
    case 'insert_lines': {
      if (!p) return false;
      const rec = upsert(changes, p, seq);
      const n = lineCount(input.content);
      rec.added += n;
      addNote(rec, `#${seq} satır ${input.line} öncesine ${n} satır eklendi${why}`);
      return true;
    }
    case 'delete_lines': {
      if (!p) return false;
      const rec = upsert(changes, p, seq);
      const from = Number(input.from_line) || 0;
      const to = Number(input.to_line) || from;
      rec.removed += Math.max(0, to - from + 1);
      addNote(rec, `#${seq} ${from}-${to} satırları silindi${why}`);
      return true;
    }
    case 'run_shell':
    case 'run_terminal':
    case 'git': {
      const cmd = String(input.command ?? '');
      const full = name === 'git' ? `git ${cmd}` : cmd;
      if (!SHELL_MUTATION.test(full)) return false;
      const rec = upsert(changes, '(shell)', seq);
      addNote(rec, `#${seq} ${oneLine(full, 110)}${why}`);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Defteri bütçeye sığdırır. Sıkıştırma sırası: notlar kısalır → eski dosyalarda
 * tek not kalır → eski dosyalar sadece "yol + sayı" olur → en eskiler gruplanır.
 */
export function renderChanges(changes: ChangeRecord[], budgetTokens: number): string {
  if (changes.length === 0) return '';
  const maxChars = tokensToChars(budgetTokens);
  const ordered = [...changes].sort((a, b) => a.firstSeq - b.firstSeq);
  const recentCut = Math.max(0, ordered.length - 5);

  const line = (c: ChangeRecord, notes: number, noteChars: number): string => {
    const head = `- ${c.path} · ${c.edits} değişiklik · +${c.added}/-${c.removed}`;
    if (notes <= 0 || c.notes.length === 0) return head;
    const shown = c.notes.slice(-notes).map(n => oneLine(n, noteChars));
    return `${head}\n    ${shown.join('\n    ')}`;
  };

  const attempts: Array<(c: ChangeRecord, i: number) => string> = [
    (c) => line(c, MAX_NOTES_PER_FILE, 140),
    (c, i) => line(c, i >= recentCut ? 3 : 1, 110),
    (c, i) => line(c, i >= recentCut ? 2 : 0, 90),
    (c, i) => line(c, i >= recentCut ? 1 : 0, 70),
  ];
  for (const render of attempts) {
    const out = ordered.map(render).join('\n');
    if (out.length <= maxChars) return out;
  }

  // Son çare: en yeni dosyaları tut, eskileri tek satırda grupla
  const lines: string[] = [];
  let used = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const l = line(ordered[i], 0, 0);
    if (used + l.length + 80 > maxChars) {
      lines.unshift(`- (+${i + 1} eski dosya: ${oneLine(ordered.slice(0, i + 1).map(c => c.path).join(', '), 200)})`);
      break;
    }
    lines.unshift(l);
    used += l.length + 1;
  }
  return lines.join('\n');
}
