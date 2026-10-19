/**
 * Session Memory Service â€” v2 (Context Compression Destekli)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { Message } from './ai-service';
import { estimateTokens, estimateMessagesTokens } from './token-counter';
import { generateRepoMap } from './repo-map';
import { safeSlice } from './text-utils';

// â”€â”€â”€ Sabitler & Yollar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getSessionBufferDir(workDir: string = _state?.workDir || process.cwd()): string {
  return path.join(path.resolve(workDir), '.deha');
}

export function getSessionBufferFile(workDir: string = _state?.workDir || process.cwd()): string {
  return path.join(getSessionBufferDir(workDir), 'session-buffer.json');
}

export function getProjectDirectoryKey(dir: string = _state?.workDir || process.cwd()): string {
  try {
    const normalized = path.resolve(dir).toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  } catch {
    return 'default';
  }
}

export function getProjectRedisKey(dir: string = _state?.workDir || process.cwd()): string {
  const projectKey = getProjectDirectoryKey(dir);
  return `deha:session:project:${projectKey}`;
}

const SESSION_BUFFER_DIR = path.join(process.cwd(), '.deha');
const SESSION_BUFFER_FILE = path.join(SESSION_BUFFER_DIR, 'session-buffer.json');
const COLD_STORAGE_DIR = path.join(os.homedir(), '.deha', 'conversations');
const FLUSH_THRESHOLD = 20;
const MIN_ALWAYS_HOT_MESSAGES = 20;
const DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS = 80_000;
const MAX_SUMMARY_CHARS = 24_000;
const MAX_CONTEXT_MESSAGE_CHARS = 16_000;

// â”€â”€â”€ Redis (opsiyonel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let redisClient: RedisLike | null = null;
let _redisChecked = false;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

async function getRedis(): Promise<RedisLike | null> {
  if (_redisChecked) return redisClient;
  _redisChecked = true;
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1, retryStrategy: () => null });
    client.on('error', () => { /* Suppress unhandled errors */ });
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    return null;
  }
}

// â”€â”€â”€ Task & Conversation Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type TaskState = 'ACTIVE' | 'COMPLETE' | 'BLOCKED' | 'CANCELLED' | 'INTERRUPTED';
export type ConversationLifecycle = 'CREATED' | 'ACTIVE' | 'ARCHIVED' | 'EXPLICITLY CLEARED';

export interface ActiveTaskContext {
  id?: string;
  originalUserRequest: string;
  currentObjective: string;
  lastMeaningfulToolResult?: string;
  taskState: TaskState;
  recoveryAttemptCount: number;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

// â”€â”€â”€ Session state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SessionState {
  sessionId: string;
  conversationId?: string;
  conversationLifecycle: ConversationLifecycle;
  activeTask?: ActiveTaskContext | null;
  previousTask?: ActiveTaskContext | null;
  messages: Message[];
  summary: string;        
  pinnedContext: string[]; // Pinli talimatlar
  architectureFiles: string[]; // Mimari dosyalar (Anayasa)
  workDir: string;        
  flushedCount: number;   
  compressCount: number;  
  /** BÃ¶lÃ¼mlÃ¼ agent context'i (gÃ¶rev eki, brain, deÄŸiÅŸiklikler, tool gÃ¼nlÃ¼ÄŸÃ¼) â€” bkz. services/context */
  workspace?: unknown;
}

let _state: SessionState = {
  sessionId: Date.now().toString(36),
  conversationLifecycle: 'CREATED',
  activeTask: null,
  previousTask: null,
  messages: [],
  summary: '',
  pinnedContext: [],
  architectureFiles: [],
  workDir: process.cwd(),
  flushedCount: 0,
  compressCount: 0,
};

// â”€â”€â”€ Core Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function loadSession(targetDir: string = process.cwd()): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  // Synchronous disk checkpoints are newer than the asynchronous Redis cache.
  // Never let an older Redis record overwrite a successfully saved workspace.
  const bufferFile = getSessionBufferFile(resolvedDir);
  for (const file of [bufferFile, `${bufferFile}.bak`]) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as SessionState;
      if (Array.isArray(saved.messages) && shouldLoadSessionForCurrentDir(saved, resolvedDir)) {
        _state = { ...emptySession(resolvedDir), ...saved, workDir: resolvedDir };
        return;
      }
    } catch { /* Try the backup, then Redis. */ }
  }
  const redis = await getRedis();
  if (redis) {
    const projectKey = getProjectRedisKey(resolvedDir);
    const raw = await redis.get(projectKey) || await redis.get('deha:session:latest');
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<SessionState>;
        if (shouldLoadSessionForCurrentDir(saved, resolvedDir)) {
          _state = { ...emptySession(resolvedDir), ...saved, workDir: resolvedDir };
          if (_state.messages.length > 0 && _state.conversationLifecycle !== 'EXPLICITLY CLEARED') {
            _state.conversationLifecycle = 'ACTIVE';
          }
          return;
        }
      } catch { }
    }
  }

  _state = emptySession(resolvedDir);
}

function emptySession(workDir: string): SessionState {
  return { sessionId: crypto.randomUUID(), conversationLifecycle: 'CREATED', activeTask: null,
    previousTask: null, messages: [], summary: '', pinnedContext: [], architectureFiles: [],
    workDir, flushedCount: 0, compressCount: 0 };
}

export function getSessionSnapshot(): SessionState {
  return JSON.parse(JSON.stringify(_state));
}

export function setConversationId(id: string): void {
  _state.conversationId = id;
  _writeWarmBuffer();
}

export function shouldLoadSessionForCurrentDir(saved: Partial<SessionState>, targetDir: string = process.cwd()): boolean {
  if (!saved.workDir) return true;
  try {
    return path.resolve(saved.workDir).toLowerCase() === path.resolve(targetDir).toLowerCase();
  } catch {
    return false;
  }
}

export async function appendMessage(message: Message): Promise<void> {
  _state.messages.push(message);
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
  if (_state.messages.length - _state.flushedCount >= FLUSH_THRESHOLD) {
    await _flushCold(false);
  }
}

export function addArchitectureFile(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!_state.architectureFiles) _state.architectureFiles = [];
  if (!_state.architectureFiles.includes(resolved)) {
    _state.architectureFiles.push(resolved);
    _writeWarmBuffer();
  }
}

export function clearArchitectureFiles(): void {
  _state.architectureFiles = [];
  _writeWarmBuffer();
}

/**
 * Optimized for Prompt Caching:
 * 1. ARCHITECTURE (The Constitution - Most Static)
 * 2. Pinned Context (En Ãœst - En Sabit - Cache dostu)
 * 3. Repo Map (Top - Static)
 * 4. Context Recap / Summary (Middle - Semi-Static)
 */
export function buildStaticContextMessages(
  options: { includeActiveTask?: boolean; includeSummary?: boolean } = {},
): Message[] {
  const includeActiveTask = options.includeActiveTask ?? true;
  const includeSummary = options.includeSummary ?? true;
  const result: Message[] = [];

  // 0. ARCHITECTURE
  if (_state.architectureFiles && _state.architectureFiles.length > 0) {
    let architectureContent = '';
    for (const file of _state.architectureFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        architectureContent += `\n--- FILE: ${path.relative(_state.workDir, file)} ---\n${content}\n`;
      }
    }
    if (architectureContent) {
      result.push({
        role: 'user',
        content: `<project_architecture_constitution>\n${architectureContent}\nCRITICAL RULE: These files define the core logic and Second Brain of the project. NEVER propose changes to these files without explicit user approval. If you are a specialized agent (Coder/Judge), always check these files first.\n</project_architecture_constitution>`,
      });
      result.push({
        role: 'assistant',
        content: 'Proje anayasasÄ±nÄ± ve mimari dÃ¶kÃ¼manlarÄ± (Second Brain) hafÄ±zama kazÄ±dÄ±m. Onay almadan bu yapÄ±larÄ± deÄŸiÅŸtirmeyeceÄŸim.',
      });
    }
  }
  
  // 1. PINNED CONTEXT
  if (_state.pinnedContext && _state.pinnedContext.length > 0) {
    const content = _state.pinnedContext.join('\n\n');
    result.push({
      role: 'user',
      content: `<pinned_instructions>\n${content}\n</pinned_instructions>`,
    });
    result.push({
      role: 'assistant',
      content: 'Sabit talimatlarÄ± aldÄ±m, bunlarÄ± her zaman Ã¶nceliklendireceÄŸim.',
    });
  }

  // 2. PROJECT STRUCTURE
  // Skip when workDir is the user's home directory â€” it isn't "a project",
  // it's the whole profile (IDE extension caches, Android AVDs, dotfiles for
  // every tool installed). Walking it produces a multi-KB dump of unrelated
  // noise that gets re-sent on every single turn, and combined with the
  // system prompt's "stay focused on this project" framing, pushes small
  // local models to ramble about random folder names even for a bare "hi".
  if (_state.workDir && !isHomeDirectory(_state.workDir)) {
    const repoMap = generateRepoMap(_state.workDir, { maxDepth: 2 });
    if (repoMap) {
      result.push({
        role: 'user',
        content: `<project_structure>\n${repoMap}\n</project_structure>`,
      });
      result.push({
        role: 'assistant',
        content: 'Proje yapÄ±sÄ±nÄ± aldÄ±m.',
      });
    }
  }

  // 2.5 ACTIVE TASK CONTEXT (if task is ACTIVE, keep in static context for caching & continuity)
  if (includeActiveTask && _state.activeTask && _state.activeTask.taskState === 'ACTIVE') {
    const task = _state.activeTask;
    const taskBlock = `ORIGINAL USER REQUEST: ${task.originalUserRequest}\nCURRENT OBJECTIVE: ${task.currentObjective || task.originalUserRequest}\nTASK STATE: ${task.taskState}\nCRITICAL: This task is actively running â€” keep working until it is complete. Never output a greeting, never claim the user's message is empty, never ask what to do. Only switch tasks if the user explicitly writes a NEW, different request.`;
    result.push({
      role: 'user',
      content: `<active_task>\n${taskBlock}\n</active_task>`,
    });
    result.push({
      role: 'assistant',
      content: 'Aktif gÃ¶revi ve mevcut hedefi hafÄ±zamda tutuyorum. KarÅŸÄ±lama yapmadan gÃ¶reve odaklanarak devam ediyorum.',
    });
  }

  // 3. CONTEXT RECAP / SUMMARY
  if (includeSummary && _state.summary) {
    result.push({
      role: 'user',
      content: `<context_recap>\n${truncateText(_state.summary, MAX_SUMMARY_CHARS)}\n</context_recap>`,
    });
    result.push({
      role: 'assistant',
      content: 'BaÄŸlam Ã¶zetini aldÄ±m.',
    });
  }

  return result;
}

export function buildContextMessages(
  pendingUserMessage?: string,
  options: { maxTokens?: number; minHotMessages?: number } = {},
): Message[] {
  const msgs = _state.messages;
  const staticContext = buildStaticContextMessages();
  const result: Message[] = [...staticContext];
  const budget = options.maxTokens ?? DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS;
  const minHot = Math.max(options.minHotMessages ?? MIN_ALWAYS_HOT_MESSAGES, MIN_ALWAYS_HOT_MESSAGES);

  // 4. CONVERSATION HISTORY (Bottom - Dynamic)
  const hotStart = Math.max(0, msgs.length - minHot);
  const older = msgs.slice(0, hotStart);
  const hot = msgs.slice(hotStart);

  // Eski mesajlarÄ± bÃ¼tÃ§eye sÄ±ÄŸdÄ±r â€” EN YENÄ°DEN ESKÄ°YE iterasyon
  // BÃ¶ylece bÃ¼tÃ§e dolunca en ESKÄ° mesajlar dÃ¼ÅŸer, en yeniler kalÄ±r
  const fittingOlder: Message[] = [];
  const hotCompacted = hot.map(compactContextMessage);
  const hotTokens = estimateMessagesTokens(hotCompacted);
  const staticTokens = estimateMessagesTokens(result);
  let olderTokens = 0;

  for (let i = older.length - 1; i >= 0; i--) {
    const compacted = compactContextMessage(older[i]);
    const msgTokens = estimateMessagesTokens([compacted]);
    if (staticTokens + olderTokens + msgTokens + hotTokens > budget) break;
    fittingOlder.unshift(compacted); // unshift â†’ sÄ±rayÄ± korur (eski â†’ yeni)
    olderTokens += msgTokens;
  }

  // Eski mesajlarÄ± doÄŸru sÄ±rada ekle
  for (const msg of fittingOlder) {
    result.push(msg);
  }

  // Son (hot) mesajlarÄ± ekle â€” bunlar her zaman eklenir
  for (const msg of hotCompacted) {
    result.push(msg);
  }

  // KullanÄ±cÄ±nÄ±n yeni mesajÄ±
  if (pendingUserMessage) {
    result.push({ role: 'user', content: pendingUserMessage });
  }

  return result;
}

export function getSessionMessages(): Message[] {
  return _state.messages;
}

// â”€â”€â”€ Active Task & Lifecycle Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getPreviousTask(): ActiveTaskContext | null {
  return _state.previousTask || null;
}

export function setActiveTask(originalUserRequest: string, objective?: string): ActiveTaskContext {
  const now = new Date().toISOString();
  if (_state.activeTask) {
    _state.previousTask = { ..._state.activeTask };
  }
  const task: ActiveTaskContext = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
    originalUserRequest,
    currentObjective: objective || originalUserRequest,
    taskState: 'ACTIVE',
    recoveryAttemptCount: 0,
    startedAt: now,
    updatedAt: now,
  };
  _state.activeTask = task;
  _state.conversationLifecycle = 'ACTIVE';
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
  return task;
}

export function updateActiveTask(updates: Partial<ActiveTaskContext>): ActiveTaskContext | null {
  if (!_state.activeTask) return null;
  _state.activeTask = {
    ..._state.activeTask,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
  return _state.activeTask;
}

export function getActiveTask(): ActiveTaskContext | null {
  return _state.activeTask || null;
}

export function getPreviousTaskContext(): ActiveTaskContext | null {
  return _state.previousTask || null;
}

export function getSessionId(): string {
  return _state.sessionId;
}

/** BÃ¶lÃ¼mlÃ¼ context deposu (ham) â€” ÅŸema `services/sectioned-context/store.ts` iÃ§inde. */
export function getWorkspaceContextRaw(): unknown {
  return _state.workspace;
}

export function setWorkspaceContextRaw(value: unknown): void {
  _state.workspace = value;
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
}

/**
 * LLM Ã§aÄŸrÄ±sÄ± OLMADAN eski ham mesajlarÄ± arÅŸivler: Ã¶nce cold storage'a yazÄ±lÄ±r,
 * sonra sadece son `keepLast` mesaj bellekte kalÄ±r. BÃ¶lÃ¼mlÃ¼ context modunda
 * gÃ¶rev/plan/deÄŸiÅŸiklik/tool bilgisi zaten `workspace` iÃ§inde tutulduÄŸu iÃ§in
 * ham geÃ§miÅŸi LLM ile Ã¶zetlemeye gerek yok.
 */
export async function archiveOldMessages(
  maxContextTokens: number,
  threshold: number,
  keepLast: number,
): Promise<boolean> {
  const totalTokens = estimateMessagesTokens(_state.messages as any);
  if (totalTokens < maxContextTokens * threshold) return false;
  if (_state.messages.length <= keepLast) return false;
  await _flushCold(false);
  _state.messages = _state.messages.slice(-keepLast);
  _state.flushedCount = 0;
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
  return true;
}

export function completeActiveTask(): void {
  if (_state.activeTask) {
    _state.activeTask.taskState = 'COMPLETE';
    _state.activeTask.completedAt = new Date().toISOString();
    _state.activeTask.updatedAt = new Date().toISOString();
    _state.previousTask = { ..._state.activeTask };
    _writeWarmBuffer();
    _writeRedis().catch(() => {});
  }
}

export function cancelActiveTask(): void {
  if (_state.activeTask) {
    _state.activeTask.taskState = 'CANCELLED';
    _state.activeTask.updatedAt = new Date().toISOString();
    _state.previousTask = { ..._state.activeTask };
    _writeWarmBuffer();
    _writeRedis().catch(() => {});
  }
}

export function clearActiveTask(): void {
  if (_state.activeTask) {
    _state.previousTask = { ..._state.activeTask };
  }
  _state.activeTask = null;
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
}

export function setConversationLifecycle(lifecycle: ConversationLifecycle): void {
  _state.conversationLifecycle = lifecycle;
  _writeWarmBuffer();
  _writeRedis().catch(() => {});
}

export function getConversationLifecycle(): ConversationLifecycle {
  return _state.conversationLifecycle;
}

export async function hydrateSession(
  messages: Message[],
  options: { workDir?: string; preserveSummary?: boolean; activeTask?: ActiveTaskContext | null; previousTask?: ActiveTaskContext | null; snapshot?: SessionState } = {},
): Promise<void> {
  // A transcript alone cannot carry brain/task state. Start clean when opening
  // another conversation; use its own snapshot when one exists.
  _state = options.snapshot
    ? { ...emptySession(options.workDir || process.cwd()), ...JSON.parse(JSON.stringify(options.snapshot)) }
    : { ...emptySession(options.workDir || process.cwd()), workspace: null };
  _state.messages = [...messages];
  _state.flushedCount = 0;
  _state.compressCount = 0;
  _state.conversationLifecycle = 'ACTIVE';
  if (options.activeTask !== undefined) {
    _state.activeTask = options.activeTask;
  }
  if (options.previousTask !== undefined) {
    _state.previousTask = options.previousTask;
  }
  if (!options.preserveSummary) _state.summary = '';
  if (options.workDir) _state.workDir = options.workDir;
  _writeWarmBuffer();
  await _writeRedis().catch(() => {});
}

export async function resetSession(workDir = process.cwd()): Promise<void> {
  const resolvedDir = path.resolve(workDir);
  _state = {
    sessionId: Date.now().toString(36),
    conversationLifecycle: 'EXPLICITLY CLEARED',
    activeTask: null,
    previousTask: null,
    messages: [],
    summary: '',
    pinnedContext: [],
    architectureFiles: [],
    workDir: resolvedDir,
    flushedCount: 0,
    compressCount: 0,
    workspace: null, // Explicit reset: do not import a previous conversation's brain.md.
  };
  _writeWarmBuffer();
  const redis = await getRedis();
  if (redis) {
    const projectKey = getProjectRedisKey(resolvedDir);
    await redis.del(projectKey).catch(() => {});
    await redis.del('deha:session:latest').catch(() => {});
  }
}

export function addPinnedMessage(text: string): void {
  if (!_state.pinnedContext) _state.pinnedContext = [];
  if (!_state.pinnedContext.includes(text)) {
    _state.pinnedContext.push(text);
    _writeWarmBuffer();
  }
}

export function clearPinnedMessages(): void {
  _state.pinnedContext = [];
  _writeWarmBuffer();
}

export function setWorkDir(dir: string): void {
  _state.workDir = dir;
  _writeWarmBuffer();
  if (!_state.summary && dir && fs.existsSync(dir)) {
    try {
      const summaryPath = path.join(dir, '.deha_summary.md');
      if (fs.existsSync(summaryPath)) {
        _state.summary = fs.readFileSync(summaryPath, 'utf-8').replace(/^# DEHA â€” Proje Ã–zeti\n\n> Son GÃ¼ncelleme: .*\n\n/, '');
      }
    } catch { }
  }
}

export function getWorkDir(): string {
  return _state.workDir;
}

/** True when `dir` resolves to the OS home directory â€” see the repo-map skip above. */
export function isHomeDirectory(dir: string): boolean {
  try {
    return path.resolve(dir) === path.resolve(os.homedir());
  } catch {
    return false;
  }
}

export function getContextStats(maxContextTokens: number): {
  messages: number;
  tokens: number;
  totalTokens: number;
  usagePercent: number;
  workDir: string;
  compressCount: number;
  hasSummary: boolean;
} {
  const total = estimateMessagesTokens(_state.messages as any) + estimateTokens(_state.summary);
  return {
    messages: _state.messages.length,
    tokens: total,
    totalTokens: total,
    usagePercent: (total / maxContextTokens) * 100,
    workDir: _state.workDir,
    compressCount: _state.compressCount,
    hasSummary: Boolean(_state.summary),
  };
}

export function getSessionStats(): {
  messages: number;
  summary: string;
  workDir: string;
  flushedCount: number;
  compressCount: number;
  conversationLifecycle: ConversationLifecycle;
  activeTask: ActiveTaskContext | null;
  previousTask: ActiveTaskContext | null;
} {
  return {
    messages: _state.messages.length,
    summary: _state.summary,
    workDir: _state.workDir,
    flushedCount: _state.flushedCount,
    compressCount: _state.compressCount,
    conversationLifecycle: _state.conversationLifecycle,
    activeTask: _state.activeTask ?? null,
    previousTask: _state.previousTask ?? null,
  };
}

export function detectWorkDir(message: string): string | null {
  const match = message.match(/SET_WORKDIR:\s*([\S]+)/i);
  return match ? match[1] : null;
}

export async function autoCompress(
  summarizeFn: (messages: Message[]) => Promise<string>,
  maxContextTokens: number,
  compressThreshold: number,
  minHotMessages: number,
): Promise<boolean> {
  const totalTokens = estimateMessagesTokens(_state.messages as any);
  const summaryTokens = estimateTokens(_state.summary);
  if (totalTokens + summaryTokens < maxContextTokens * compressThreshold) return false;
  return summarizeOld(summarizeFn, minHotMessages);
}

export async function summarizeOld(
  summarizeFn: (messages: Message[]) => Promise<string>,
  hotCount?: number,
): Promise<boolean> {
  const minHot = Math.max(hotCount ?? 10, MIN_ALWAYS_HOT_MESSAGES);
  const msgs = _state.messages;
  if (msgs.length <= minHot) return false;
  const toSummarize = msgs.slice(0, -minHot);
  if (toSummarize.length < 4) return false;

  try {
    // Ã–zetleme Ã¶ncesinde tÃ¼m mesajlarÄ±n cold storage'a yazÄ±ldÄ±ÄŸÄ±ndan emin ol
    await _flushCold(false);

    const newSummary = await summarizeFn(toSummarize);
    let activeTaskInfo = '';
    const taskToRecord = _state.activeTask || _state.previousTask;
    if (taskToRecord) {
      activeTaskInfo = `- ACTIVE TASK: ${taskToRecord.originalUserRequest}\n- CURRENT OBJECTIVE: ${taskToRecord.currentObjective}\n- TASK STATE: ${taskToRecord.taskState}\n`;
      if (taskToRecord.lastMeaningfulToolResult) {
        activeTaskInfo += `- LAST MEANINGFUL TOOL RESULT: ${taskToRecord.lastMeaningfulToolResult}\n`;
      }
    }
    const stickyContext = `[STICKY CONTEXT]\n- ACTIVE WORKDIR: ${_state.workDir}\n${activeTaskInfo}- SUMMARY VERSION: ${_state.compressCount + 1}\n\n`;
    _state.summary = _state.summary 
      ? truncateText(`${stickyContext}${_state.summary}\n\n---\n\n[Sonraki BÃ¶lÃ¼m Ã–zeti]\n${newSummary}`, MAX_SUMMARY_CHARS)
      : truncateText(`${stickyContext}${newSummary}`, MAX_SUMMARY_CHARS);

    if (_state.workDir && fs.existsSync(_state.workDir)) {
      fs.writeFileSync(path.join(_state.workDir, '.deha_summary.md'), `# DEHA â€” Proje Ã–zeti\n\n> Son GÃ¼ncelleme: ${new Date().toLocaleString()}\n\n${_state.summary}`);
    }

    _state.messages = msgs.slice(-minHot);
    _state.flushedCount = 0; // Reset flushed count for the new hot window
    _state.compressCount++;
    _writeWarmBuffer();
    _writeRedis().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function flushOnExit(): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const projectKey = getProjectRedisKey(_state.workDir);
    const data = JSON.stringify(_state);
    await redis.set(projectKey, data).catch(() => {});
    await redis.set(`deha:session:id:${_state.sessionId}`, data).catch(() => {});
    await redis.set('deha:session:latest', data).catch(() => {});
    await redis.quit().catch(() => {});
  }
  _writeWarmBuffer();
  await _flushCold(true);
}

function _writeWarmBuffer(): void {
  try {
    const bufferFile = getSessionBufferFile(_state.workDir);
    const bufferDir = path.dirname(bufferFile);
    if (!fs.existsSync(bufferDir)) fs.mkdirSync(bufferDir, { recursive: true });
    const tempFile = `${bufferFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(_state), 'utf-8');
    // Keep the last valid checkpoint if the process is killed during a write.
    if (fs.existsSync(bufferFile)) {
      try {
        JSON.parse(fs.readFileSync(bufferFile, 'utf-8'));
        fs.copyFileSync(bufferFile, `${bufferFile}.bak`);
      } catch { /* Do not replace a valid backup with a corrupt file. */ }
    }
    fs.renameSync(tempFile, bufferFile);
  } catch { }
}

async function _writeRedis(): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const projectKey = getProjectRedisKey(_state.workDir);
    const data = JSON.stringify(_state);
    await redis.set(projectKey, data).catch(() => {});
    await redis.set(`deha:session:id:${_state.sessionId}`, data).catch(() => {});
    await redis.set('deha:session:latest', data).catch(() => {});
  }
}

async function _flushCold(isFinal: boolean): Promise<void> {
  const msgs = _state.messages;
  const unflushed = msgs.slice(_state.flushedCount);
  if (!unflushed.length && !isFinal) return;
  try {
    if (!fs.existsSync(COLD_STORAGE_DIR)) fs.mkdirSync(COLD_STORAGE_DIR, { recursive: true });
    const file = path.join(COLD_STORAGE_DIR, `${new Date().toISOString().slice(0, 10)}-${_state.sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ..._state, flushedAt: new Date().toISOString() }, null, 2), 'utf-8');
    _state.flushedCount = msgs.length;
  } catch { }
}

function compactContextMessage(message: Message): Message {
  const content = message.content || '';
  if (content.length <= MAX_CONTEXT_MESSAGE_CHARS) return message;

  // Tool mesajlarÄ±: hata mesajlarÄ±nÄ± koru, akÄ±llÄ± kÄ±rpma yap
  if (message.role === 'tool') {
    return { ...message, content: compactToolContent(content, MAX_CONTEXT_MESSAGE_CHARS) };
  }

  return { ...message, content: truncateText(content, MAX_CONTEXT_MESSAGE_CHARS) };
}

/**
 * Tool sonuÃ§larÄ±nÄ± akÄ±llÄ±ca kÄ±rpar:
 * - Hata mesajlarÄ±nÄ± ASLA kÄ±rpma
 * - JSON yanÄ±tlarÄ±nda anahtarlarÄ± koru
 * - Dosya okumalarÄ±nda head + tail tut
 */
function compactToolContent(content: string, maxChars: number): string {
  // Hata mesajlarÄ±nÄ± olduÄŸu gibi bÄ±rak (genelde kÄ±sadÄ±r)
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('error') || lowerContent.includes('hata') || lowerContent.includes('failed') || lowerContent.includes('exception')) {
    // Hata mesajÄ± bile Ã§ok uzunsa, yine de biraz kÄ±rp ama daha fazla tut
    if (content.length <= maxChars * 1.5) return content;
    return truncateText(content, Math.floor(maxChars * 1.5));
  }

  return truncateText(content, maxChars);
}

function truncateText(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const placeholder = `\n\n[... ${text.length} karakterden ${maxChars} karakter tutuldu ...]\n\n`;
  const available = maxChars - placeholder.length;
  const head = Math.floor(available * 0.55);
  const tail = available - head;
  return safeSlice(text, 0, head) + placeholder + (tail > 0 ? safeSlice(text, -tail) : '');
}
