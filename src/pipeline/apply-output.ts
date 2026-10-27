import * as fs from 'fs';
import * as path from 'path';
import { DehaConfig } from '../config';
import { executeToolAsync } from '../tools';
import { parseEditBlocks, parseNewFileBlocks } from '../tools/edit';

export interface ApplicationResult {
  file: string;
  success: boolean;
  result: string;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

export function projectFilePath(root: string, file: string): string {
  const target = path.resolve(root, file);
  if (!inside(root, target)) throw new Error('File is outside the active project.');
  // Existing directory symlinks must not redirect a relative output outside the project.
  let ancestor = target;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  if (!inside(fs.realpathSync(root), fs.realpathSync(ancestor))) throw new Error('File symlink leaves the active project.');
  return target;
}

export async function applyCoderOutput(
  output: string, root: string, config: DehaConfig, signal?: AbortSignal,
): Promise<ApplicationResult[]> {
  const normalized = output.replace(/\r\n/g, '\n');
  const creates = parseNewFileBlocks(normalized);
  const edits = parseEditBlocks(normalized);
  const results: ApplicationResult[] = [];
  for (const block of [...creates.map(b => ({ ...b, kind: 'create' as const })), ...edits.map(b => ({ ...b, kind: 'edit' as const }))]) {
    signal?.throwIfAborted();
    let file = '';
    try {
      file = projectFilePath(root, block.file);
      if (block.kind === 'create' && fs.existsSync(file)) throw new Error('NEW FILE cannot overwrite an existing file; use an EDIT block with its current content.');
      if (block.kind === 'edit' && !block.oldStr.trim()) throw new Error('EDIT requires a non-empty exact OLD snippet.');
      const result = block.kind === 'create'
        ? await executeToolAsync('write_file', { path: file, content: block.content }, config, signal)
        : await executeToolAsync('edit_file', { path: file, old_string: block.oldStr, new_string: block.newStr }, config, signal);
      signal?.throwIfAborted();
      results.push({ file, success: !/^HATA:/i.test(result), result });
    } catch (err) {
      signal?.throwIfAborted();
      results.push({ file, success: false, result: `HATA: ${block.file}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  if (!results.length) results.push({ file: '', success: false, result: 'HATA: No applicable FILE or EDIT blocks were produced. Return actual changes for the complete plan.' });
  return results;
}

/** Review evidence is bounded and reflects disk, not only the Coder's claims. */
export function currentFileEvidence(files: Iterable<string>, maxChars = 40_000): string {
  let report = '';
  for (const file of files) {
    const remaining = maxChars - report.length;
    if (remaining < 200) return report + '\n[Further files omitted from review evidence: size limit.]';
    try {
      const content = fs.readFileSync(file, 'utf8');
      const limit = Math.min(16_000, remaining - 150);
      report += `\nFILE: ${file}\n${content.slice(0, limit)}${content.length > limit ? '\n[File truncated for review.]' : ''}\n`;
    } catch (err) {
      report += `\nFILE: ${file}\nRead failed: ${err instanceof Error ? err.message : String(err)}\n`;
    }
  }
  return report;
}
