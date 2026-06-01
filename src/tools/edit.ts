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

  // ── 1. Exact match ───────────────────────────────────────────────────────
  if (original.includes(input.old_string)) {
    const count = input.replace_all
      ? (original.match(new RegExp(escapeRegex(input.old_string), 'g'))?.length ?? 0)
      : 1;
    const updated = input.replace_all
      ? original.split(input.old_string).join(input.new_string)
      : original.replace(input.old_string, input.new_string);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return `✓ Düzenlendi: ${resolved} (${count} değişiklik)`;
  }

  // ── 2. CRLF normalization fallback ──────────────────────────────────────
  const normalizedOriginal = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedOld = input.old_string.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalizedOriginal.includes(normalizedOld)) {
    // Rebuild with normalized content so replacement works
    const updatedNorm = input.replace_all
      ? normalizedOriginal.split(normalizedOld).join(input.new_string.replace(/\r\n/g, '\n'))
      : normalizedOriginal.replace(normalizedOld, input.new_string.replace(/\r\n/g, '\n'));
    fs.writeFileSync(resolved, updatedNorm, 'utf-8');
    return `✓ Düzenlendi (CRLF normalize): ${resolved}`;
  }

  // ── 3. Whitespace-insensitive fallback ──────────────────────────────────
  // Strips leading/trailing whitespace per line for comparison only,
  // then replaces the actual matching region in the file.
  const normLines = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());
  const fileLines  = normLines(normalizedOriginal);
  const oldLines   = normLines(normalizedOld);

  if (oldLines.length > 0) {
    const firstOld = oldLines[0].trim();
    for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
      if (fileLines[i].trim() !== firstOld) continue;
      // Check if all lines match (trim-based)
      let allMatch = true;
      for (let j = 0; j < oldLines.length; j++) {
        if (fileLines[i + j].trim() !== oldLines[j].trim()) { allMatch = false; break; }
      }
      if (allMatch) {
        // Replace the matched lines with new_string lines, preserving indentation from new_string
        const fileOriginalLines = normalizedOriginal.split('\n');
        const newLines = input.new_string.replace(/\r\n/g, '\n').split('\n');
        fileOriginalLines.splice(i, oldLines.length, ...newLines);
        fs.writeFileSync(resolved, fileOriginalLines.join('\n'), 'utf-8');
        return `✓ Düzenlendi (whitespace-normalized): ${resolved}`;
      }
    }
  }

  // ── Nothing matched — report error with hint ────────────────────────────
  const lines = original.split('\n');
  const firstLineOfOld = input.old_string.split('\n')[0].trim();
  const closestLine = lines.findIndex((l) => l.includes(firstLineOfOld));
  const hint = closestLine >= 0
    ? ` En yakın eşleşme satır ${closestLine + 1}: "${lines[closestLine].trim().slice(0, 60)}"`
    : '';
  return `HATA: old_string dosyada bulunamadı.${hint}\nİpucu: Dosyayı önce read_file ile oku, tam içeriği kullan.`;
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

// ─── NEW FILE: // FILE: <yol> formatını parse et ─────────────────────────────

export interface NewFileBlock {
  file: string;
  content: string;
}

export function parseNewFileBlocks(text: string): NewFileBlock[] {
  const blocks: NewFileBlock[] = [];
  // ```\n// FILE: <yol>\n<içerik>\n``` or ```\n# FILE: <yol>\n<içerik>\n```
  const pattern = /```(?:\w+)?\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    blocks.push({
      file:    match[1].trim(),
      content: match[2].trimEnd(),
    });
  }
  return blocks;
}

export function applyNewFileBlocks(blocks: NewFileBlock[]): string[] {
  const results: string[] = [];

  for (const block of blocks) {
    const resolved = path.resolve(block.file);
    try {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved, block.content, 'utf-8');
      results.push(`✓ Dosya oluşturuldu: ${block.file}`);
    } catch (err: any) {
      results.push(`HATA: ${block.file} oluşturulamadı: ${err.message}`);
    }
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
