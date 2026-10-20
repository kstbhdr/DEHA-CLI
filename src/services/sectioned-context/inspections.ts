import { createHash } from 'crypto';
import * as path from 'path';
import { getWorkDir } from '../session-memory';
import type { WorkspaceContext } from './store';
import { isFailedResult } from './tool-log';
import { oneLine, tokensToChars, truncateMiddle } from './budget';

function identity(name: string, input: Record<string, unknown>): string | null {
  if (['read_file', 'cat', 'list_dir', 'ls', 'search_in_files', 'grep', 'find_files'].includes(name)) {
    const location = String(input.path || input.directory || '.');
    return JSON.stringify({ name: ({ cat: 'read_file', ls: 'list_dir', grep: 'search_in_files' } as Record<string, string>)[name] || name,
      path: path.resolve(getWorkDir() || process.cwd(), location), start: input.start_line || 1, end: input.end_line,
      recursive: !!input.recursive, pattern: input.pattern, extension: input.extension });
  }
  if (['run_shell', 'run_terminal'].includes(name) && typeof input.command === 'string' &&
    /\b(ls|cat|head|tail|sed|grep|find|wc|du|stat|pwd)\b/.test(input.command)) {
    return JSON.stringify({ name: 'shell-inspection', cwd: input.cwd || getWorkDir(), command: input.command.trim() });
  }
  return null;
}

function evidence(result: string): string {
  const lines = result.split('\n').map(l => l.replace(/^\d+:\s*/, '').trim()).filter(Boolean);
  const symbols = lines.filter(l => /^(?:export\s+)?(?:async\s+)?(?:class|def|function|interface)\b/.test(l)).slice(0, 5);
  const markers: string[] = [];
  lines.forEach((line, i) => {
    if (/current.state|next.step|remaining.blocker|primary.finding|latest.authoritative/i.test(line)) markers.push(line, ...lines.slice(i + 1, i + 3));
  });
  return truncateMiddle([...new Set([lines[0] || '', ...symbols, ...markers.slice(-8), lines.at(-1) || ''])].join(' | '), 600, 'kanıt önizlemesi');
}

export function recordInspection(ws: WorkspaceContext, name: string, input: Record<string, unknown>, result: string, seq: number): string | undefined {
  const key = identity(name, input);
  if (!key || isFailedResult(result) || !result.trim()) return;
  const normalized = result.replace(/\r/g, '').replace(/\(\d+ms\)/g, '(duration)');
  const digest = createHash('sha256').update(normalized).digest('hex');
  const items = ws.inspections ??= [];
  const previous = items.findIndex(item => item.key === key);
  const prior = previous >= 0 ? items.splice(previous, 1)[0] : undefined;
  const repeats = prior?.digest === digest ? prior.repeats + 1 : 1;
  const target = String(input.path || input.directory || input.command || name);
  items.push({ key, label: `${name} ${truncateMiddle(target, 240)}`, digest, repeats, excerpt: evidence(result), seq });
  if (items.length > 40) items.splice(0, items.length - 40);
  if (repeats >= 3 && (repeats === 3 || repeats % 5 === 0)) {
    return `[DEHA UNCHANGED INSPECTION] This inspection returned identical output ${repeats} times: ${oneLine(target, 220)}. ` +
      'The read succeeded; do not restart discovery or rebuild the same plan. Use the existing evidence, mark completed brain steps with update_step, and perform the next unfinished action. Re-read only for a specific missing fact or a real change. For a running job use wait_job.';
  }
}

export function renderInspections(ws: WorkspaceContext, budgetTokens: number): string {
  const cap = tokensToChars(Math.min(2000, budgetTokens));
  if (!cap || !ws.inspections?.length) return '';
  const rows: string[] = ['## Önceden incelenenler — geçmiş kanıt; dosyalar sonradan değişmiş olabilir'];
  for (const item of [...ws.inspections].reverse()) {
    const row = `#${item.seq} ${item.label} · aynı çıktı ${item.repeats} kez · ${item.excerpt}`;
    if (rows.join('\n').length + row.length + 1 > cap) break;
    rows.push(row);
  }
  return rows.length > 1 ? rows.join('\n') : '';
}
