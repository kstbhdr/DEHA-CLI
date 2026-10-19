/**
 * Bölümlü context deposu — oturum (session) kapsamlıdır.
 *
 * Görev değişse bile brain (plan/bulgular/çıkmaz sokaklar), değişiklik defteri ve
 * tool günlüğü KORUNUR: kullanıcı "devam et ama GPU kullan" dediğinde yeni bir
 * görev açılsa da model daha önce ne denediğini unutmamalı. `/new` ve `/clear`
 * (resetSession) depoyu sıfırlar.
 *
 * Veri session state içinde saklanır → warm buffer / Redis / cold storage ile
 * birlikte kalıcıdır, terminal kapatılıp açılınca geri gelir.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceContextRaw, setWorkspaceContextRaw, getWorkDir } from '../session-memory';

export type StepStatus = 'todo' | 'doing' | 'done' | 'blocked';

export interface BrainStep {
  text: string;
  status: StepStatus;
}

export interface BrainState {
  steps: BrainStep[];
  findings: string[];
  decisions: string[];
  deadEnds: string[];
  criteria?: string;
  updatedAt?: string;
}

export interface ChangeRecord {
  path: string;
  edits: number;
  added: number;
  removed: number;
  notes: string[];
  firstSeq: number;
  lastSeq: number;
}

export interface ToolLogEntry {
  seq: number;
  /** Agent turu sayacı (her runAgent çağrısı bir tur) */
  turn: number;
  /** Tur içindeki mesaj indeksi — native pencereden çıkıp çıkmadığını belirlemek için */
  turnIndex: number;
  name: string;
  args: string;
  purpose?: string;
  summary: string;
  ok: boolean;
}

export interface WorkspaceContext {
  version: 1;
  brain: BrainState;
  changes: ChangeRecord[];
  toolLog: ToolLogEntry[];
  followUps: { taskId: string; items: string[] };
  nextSeq: number;
  turn: number;
}

const MAX_TOOL_LOG_ENTRIES = 2_000;
const MAX_LIST_ITEMS = 80;

export function emptyWorkspace(): WorkspaceContext {
  return {
    version: 1,
    brain: { steps: [], findings: [], decisions: [], deadEnds: [] },
    changes: [],
    toolLog: [],
    followUps: { taskId: '', items: [] },
    nextSeq: 1,
    turn: 0,
  };
}

function isWorkspace(value: unknown): value is WorkspaceContext {
  const v = value as WorkspaceContext | undefined;
  return !!v && v.version === 1 && !!v.brain && Array.isArray(v.changes) && Array.isArray(v.toolLog);
}

export function getWorkspace(): WorkspaceContext {
  const raw = getWorkspaceContextRaw();
  if (isWorkspace(raw)) {
    // Eski kayıtlarda eksik alanları tamamla
    raw.brain.steps ??= [];
    raw.brain.findings ??= [];
    raw.brain.decisions ??= [];
    raw.brain.deadEnds ??= [];
    raw.followUps ??= { taskId: '', items: [] };
    return raw;
  }
  const fresh = emptyWorkspace();
  setWorkspaceContextRaw(fresh);
  return fresh;
}

export function saveWorkspace(ws: WorkspaceContext): void {
  if (ws.toolLog.length > MAX_TOOL_LOG_ENTRIES) ws.toolLog = ws.toolLog.slice(-MAX_TOOL_LOG_ENTRIES);
  const b = ws.brain;
  if (b.findings.length > MAX_LIST_ITEMS) b.findings = b.findings.slice(-MAX_LIST_ITEMS);
  if (b.decisions.length > MAX_LIST_ITEMS) b.decisions = b.decisions.slice(-MAX_LIST_ITEMS);
  if (b.deadEnds.length > MAX_LIST_ITEMS) b.deadEnds = b.deadEnds.slice(-MAX_LIST_ITEMS);
  setWorkspaceContextRaw(ws);
}

export function resetWorkspace(): void {
  setWorkspaceContextRaw(emptyWorkspace());
}

/** Migrate surviving brain.md from older sessions that lost the JSON workspace. */
export function recoverBrainFile(): boolean {
  try {
    const raw = fs.readFileSync(path.join(getWorkDir(), '.deha', 'brain.md'), 'utf-8');
    if (!raw.startsWith('# DEHA Brain')) return false;
    const brain = emptyWorkspace().brain;
    let section = '';
    const marks: Record<string, StepStatus> = { ' ': 'todo', '~': 'doing', x: 'done', '!': 'blocked' };
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith('## ')) { section = line.slice(3); continue; }
      const step = /^\[([ x~!])\] \d+\. (.+)$/.exec(line);
      if (section === 'Plan' && step) brain.steps.push({ text: step[2], status: marks[step[1]] });
      else if (line.startsWith('- ')) {
        const list = section === 'Bulgular' ? brain.findings : section === 'Kararlar' ? brain.decisions : section.startsWith('Çıkmaz sokaklar') ? brain.deadEnds : null;
        list?.push(line.slice(2));
      } else if (section === 'Kabul kriteri' && line.trim()) brain.criteria = [brain.criteria, line].filter(Boolean).join('\n');
    }
    if (!brain.steps.length && !brain.findings.length && !brain.decisions.length && !brain.deadEnds.length && !brain.criteria) return false;
    const ws = emptyWorkspace(); ws.brain = brain; saveWorkspace(ws);
    return true;
  } catch { return false; }
}

/** İnsan tarafından okunabilir brain dosyası: <workDir>/.deha/brain.md */
export function writeBrainFile(markdown: string): void {
  try {
    const dir = path.join(getWorkDir() || process.cwd(), '.deha');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'brain.md'), markdown, 'utf-8');
  } catch { /* best-effort */ }
}
