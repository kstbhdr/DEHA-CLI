import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionState } from '../services/session-memory';

export function checkpointDir(): string {
  return path.join(os.homedir(), '.deha', 'conversations');
}

export function readCheckpoint(id: string): SessionState | null {
  if (path.basename(id) !== id) return null;
  const file = path.join(checkpointDir(), `${id}.session.json`);
  for (const candidate of [file, `${file}.bak`]) {
    try {
      const saved = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (saved?.conversationId === id && Array.isArray(saved.messages)) return saved;
    } catch { /* A killed writer may have left a partial file. */ }
  }
  return null;
}

export function writeCheckpoint(state: SessionState): void {
  const id = state.conversationId;
  if (!id || path.basename(id) !== id || (!state.messages.length && !state.activeTask && !state.pendingInputs?.length)) return;
  fs.mkdirSync(checkpointDir(), { recursive: true });
  const file = path.join(checkpointDir(), `${id}.session.json`);
  const previous = readCheckpoint(id) as (SessionState & { provider?: string; model?: string }) | null;
  const saved = { provider: previous?.provider, model: previous?.model, ...state, checkpointSavedAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved), 'utf8');
  if (previous) fs.writeFileSync(`${file}.bak.tmp`, JSON.stringify(previous), 'utf8');
  if (previous) fs.renameSync(`${file}.bak.tmp`, `${file}.bak`);
  fs.renameSync(`${file}.tmp`, file);
}

export function latestProjectCheckpoint(workDir: string): SessionState | null {
  try {
    const ids = [...new Set(fs.readdirSync(checkpointDir())
      .filter(f => /\.session\.json(?:\.bak)?$/.test(f))
      .map(f => f.replace(/\.session\.json(?:\.bak)?$/, '')))];
    const candidates = ids.map(readCheckpoint).filter((s): s is SessionState => !!s &&
      !!s.workDir && path.resolve(s.workDir) === path.resolve(workDir));
    candidates.sort((a, b) => {
      const stamp = (s: SessionState) => (s as SessionState & { checkpointSavedAt?: string }).checkpointSavedAt || s.conversationId || '';
      return stamp(b).localeCompare(stamp(a));
    });
    return candidates[0] ?? null;
  } catch { return null; }
}
