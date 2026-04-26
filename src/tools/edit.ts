import * as fs from 'fs';
import * as path from 'path';

export interface EditResult {
  success: boolean;
  file: string;
  replacements: number;
  error?: string;
}

// ─── edit_file: exact string replacement ────────────────────────────────────

export function editFile(input: {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}): string {
  const resolved = path.resolve(input.path);

  if (!fs.existsSync(resolved)) {
    return `HATA: Dosya bulunamadı: ${resolved}`;
  }

  const original = fs.readFileSync(resolved, 'utf-8');

  if (!original.includes(input.old_string)) {
    // Bulunamadıysa yakın eşleşme ipucu ver
    const lines = original.split('\n');
    const firstLineOfOld = input.old_string.split('\n')[0].trim();
    const closestLine = lines.findIndex((l) => l.includes(firstLineOfOld));
    const hint = closestLine >= 0
      ? ` En yakın eşleşme satır ${closestLine + 1}: "${lines[closestLine].trim().slice(0, 60)}"`
      : '';
    return `HATA: old_string dosyada bulunamadı.${hint}\nİpucu: Boşluk, girinti veya satır sonu farklılıklarını kontrol et.`;
  }

  const count = input.replace_all
    ? (original.match(new RegExp(escapeRegex(input.old_string), 'g'))?.length ?? 0)
    : 1;

  const updated = input.replace_all
    ? original.split(input.old_string).join(input.new_string)
    : original.replace(input.old_string, input.new_string);

  fs.writeFileSync(resolved, updated, 'utf-8');
  return `✓ Düzenlendi: ${resolved} (${count} değişiklik)`;
}

// ─── insert_lines: satır ekleme ─────────────────────────────────────────────

export function insertLines(input: {
  path: string;
  line: number;       // bu satırdan ÖNCE ekle (1-indexed), 0 = başa ekle
  content: string;
}): string {
  const resolved = path.resolve(input.path);
  if (!fs.existsSync(resolved)) return `HATA: ${resolved} bulunamadı`;

  const lines = fs.readFileSync(resolved, 'utf-8').split('\n');
  const insertAt = Math.min(Math.max(0, input.line), lines.length);
  lines.splice(insertAt, 0, ...input.content.split('\n'));
  fs.writeFileSync(resolved, lines.join('\n'), 'utf-8');
  return `✓ ${input.content.split('\n').length} satır eklendi (satır ${insertAt + 1}): ${resolved}`;
}

// ─── delete_lines: satır silme ──────────────────────────────────────────────

export function deleteLines(input: {
  path: string;
  from_line: number;  // 1-indexed dahil
  to_line: number;    // 1-indexed dahil
}): string {
  const resolved = path.resolve(input.path);
  if (!fs.existsSync(resolved)) return `HATA: ${resolved} bulunamadı`;

  const lines = fs.readFileSync(resolved, 'utf-8').split('\n');
  const from = Math.max(0, input.from_line - 1);
  const to   = Math.min(lines.length, input.to_line);
  const deleted = to - from;
  lines.splice(from, deleted);
  fs.writeFileSync(resolved, lines.join('\n'), 'utf-8');
  return `✓ ${deleted} satır silindi (${input.from_line}-${input.to_line}): ${resolved}`;
}

// ─── apply_patch: EDIT blok formatını parse edip uygula ─────────────────────
//
// Format:
// EDIT: src/foo.ts
// <<<OLD>>>
// değiştirilecek kod
// <<<NEW>>>
// yeni kod
// <<<END>>>

export interface EditBlock {
  file: string;
  oldStr: string;
  newStr: string;
}

export function parseEditBlocks(text: string): EditBlock[] {
  const blocks: EditBlock[] = [];
  // EDIT: <dosya>\n<<<OLD>>>\n<old>\n<<<NEW>>>\n<new>\n<<<END>>>
  const pattern = /EDIT:\s*(.+?)\n<<<OLD>>>\n([\s\S]*?)<<<NEW>>>\n([\s\S]*?)<<<END>>>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    blocks.push({
      file:   match[1].trim(),
      oldStr: match[2],
      newStr: match[3],
    });
  }
  return blocks;
}

export function applyEditBlocks(blocks: EditBlock[]): string[] {
  const results: string[] = [];

  for (const block of blocks) {
    results.push(
      editFile({ path: block.file, old_string: block.oldStr, new_string: block.newStr }),
    );
  }

  return results;
}

// ─── diff görüntüleyici (terminal'de eski↔yeni yan yana) ────────────────────

export function showInlineDiff(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const out: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i] ?? '';
    const n = newLines[i] ?? '';
    if (o === n) {
      out.push(`  ${o}`);
    } else {
      if (o) out.push(`- ${o}`);
      if (n) out.push(`+ ${n}`);
    }
  }
  return out.join('\n');
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
