import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionState } from '../services/session-memory';
import type { Message } from '../services/ai-service';

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

type Checkpoint = SessionState & { provider?: string; model?: string; archivedMessages?: Message[] };

const msgKey = (m: Message) => {
  const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
  return `${m.role}|${m.tool_call_id ?? ''}|${c.length}|${c.slice(0, 120)}|${m.tool_calls?.map(t => t.id).join(',') ?? ''}`;
};

/**
 * Bellekteki pencere (son N mesaj) arşivlenince checkpoint'e yalnız o pencere
 * yazılıyordu — 730 mesajlık sohbet 200'e iniyordu. Pencereden düşen eski
 * mesajları `archivedMessages` içinde biriktir; sohbet listesi/görüntüleme
 * tam geçmişi, oturum geri yükleme ise yine yalnız pencereyi (`messages`) kullanır.
 */
function mergeArchived(previous: Checkpoint | null, messages: Message[]): Message[] | undefined {
  if (!previous) return undefined;
  const prior = [...(previous.archivedMessages ?? []), ...(previous.messages ?? [])];
  if (!messages.length) return previous.archivedMessages;
  const priorKeys = prior.map(msgKey);
  const keys = messages.map(msgKey);
  // Yeni pencere, önceki tam geçmişin k. mesajından başlayıp örtüşen her yerde aynı olmalı.
  for (let k = 0; k < priorKeys.length; k++) {
    let ok = true;
    for (let i = 0; i < keys.length && k + i < priorKeys.length; i++) {
      if (priorKeys[k + i] !== keys[i]) { ok = false; break; }
    }
    if (ok) return k > 0 ? prior.slice(0, k) : undefined;
  }
  return previous.archivedMessages;
}

/** Arşivlenmiş + canlı pencere: görüntüleme ve listeleme için tam geçmiş. */
export function fullTranscript(state: SessionState): Message[] {
  return [...((state as Checkpoint).archivedMessages ?? []), ...state.messages];
}

export function writeCheckpoint(state: SessionState): void {
  const id = state.conversationId;
  if (!id || path.basename(id) !== id || (!state.messages.length && !state.activeTask && !state.pendingInputs?.length)) return;
  fs.mkdirSync(checkpointDir(), { recursive: true });
  const file = path.join(checkpointDir(), `${id}.session.json`);
  const previous = readCheckpoint(id) as Checkpoint | null;
  const archivedMessages = mergeArchived(previous, state.messages);
  const saved = { provider: previous?.provider, model: previous?.model, ...state, archivedMessages, checkpointSavedAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved), 'utf8');
  if (previous) fs.writeFileSync(`${file}.bak.tmp`, JSON.stringify(previous), 'utf8');
  if (previous) fs.renameSync(`${file}.bak.tmp`, `${file}.bak`);
  fs.renameSync(`${file}.tmp`, file);
}

export function latestProjectCheckpoint(workDir: string, scope = ''): SessionState | null {
  try {
    const ids = [...new Set(fs.readdirSync(checkpointDir())
      .filter(f => /\.session\.json(?:\.bak)?$/.test(f))
      .map(f => f.replace(/\.session\.json(?:\.bak)?$/, '')))];
    const candidates = ids.map(readCheckpoint).filter((s): s is SessionState => !!s &&
      !!s.workDir && path.resolve(s.workDir) === path.resolve(workDir) && (s.scope || '') === scope);
    candidates.sort((a, b) => {
      const stamp = (s: SessionState) => (s as SessionState & { checkpointSavedAt?: string }).checkpointSavedAt || s.conversationId || '';
      return stamp(b).localeCompare(stamp(a));
    });
    return candidates[0] ?? null;
  } catch { return null; }
}
