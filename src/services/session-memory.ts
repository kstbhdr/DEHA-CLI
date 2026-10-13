/**
 * Session Memory Service — v2 (Context Compression Destekli)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Message } from './ai-service';
import { estimateTokens, estimateMessagesTokens } from './token-counter';
import { generateRepoMap } from './repo-map';
import { safeSlice } from './text-utils';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SESSION_BUFFER_DIR = path.join(process.cwd(), '.deha');
const SESSION_BUFFER_FILE = path.join(SESSION_BUFFER_DIR, 'session-buffer.json');
const COLD_STORAGE_DIR = path.join(os.homedir(), '.deha', 'conversations');
const FLUSH_THRESHOLD = 20;
const MIN_ALWAYS_HOT_MESSAGES = 20;
const DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS = 80_000;
const MAX_SUMMARY_CHARS = 24_000;
const MAX_CONTEXT_MESSAGE_CHARS = 16_000;

// ─── Redis (opsiyonel) ────────────────────────────────────────────────────────

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
    const client = new Redis(url, { lazyConnect: true, connectTimeout: 3000 });
    client.on('error', () => { /* Suppress unhandled errors */ });
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    return null;
  }
}

// ─── Task & Conversation Lifecycle ──────────────────────────────────────────

export type TaskState = 'ACTIVE' | 'COMPLETE' | 'BLOCKED' | 'CANCELLED';
export type ConversationLifecycle = 'CREATED' | 'ACTIVE' | 'ARCHIVED' | 'EXPLICITLY CLEARED';

export interface ActiveTaskContext {
  originalUserRequest: string;
  currentObjective: string;
  lastMeaningfulToolResult?: string;
  taskState: TaskState;
  recoveryAttemptCount: number;
  startedAt?: string;
  updatedAt?: string;
}

// ─── Session state ────────────────────────────────────────────────────────────

interface SessionState {
  sessionId: string;
  conversationLifecycle: ConversationLifecycle;
  activeTask?: ActiveTaskContext | null;
  messages: Message[];
  summary: string;        
  pinnedContext: string[]; // Pinli talimatlar
  architectureFiles: string[]; // Mimari dosyalar (Anayasa)
  workDir: string;        
  flushedCount: number;   
  compressCount: number;  
}

let _state: SessionState = {
  sessionId: Date.now().toString(36),
  conversationLifecycle: 'CREATED',
  activeTask: null,
  messages: [],
  summary: '',
  pinnedContext: [],
  architectureFiles: [],
  workDir: process.cwd(),
  flushedCount: 0,
  compressCount: 0,
};

// ─── Core Logic ──────────────────────────────────────────────────────────────

export async function loadSession(): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get('deha:session:latest');
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<SessionState>;
        if (shouldLoadSessionForCurrentDir(saved)) {
          _state = { ..._state, ...saved };
          if (_state.messages.length > 0 && _state.conversationLifecycle !== 'EXPLICITLY CLEARED') {
            _state.conversationLifecycle = 'ACTIVE';
          }
          return;
        }
      } catch { }
    }
  }

  if (fs.existsSync(SESSION_BUFFER_FILE)) {
    try {
      const raw = fs.readFileSync(SESSION_BUFFER_FILE, 'utf-8');
      const saved = JSON.parse(raw) as Partial<SessionState>;
      if (shouldLoadSessionForCurrentDir(saved)) {
        _state = { ..._state, ...saved };
        if (_state.messages.length > 0 && _state.conversationLifecycle !== 'EXPLICITLY CLEARED') {
          _state.conversationLifecycle = 'ACTIVE';
        }
      }
    } catch { }
  }
}

function shouldLoadSessionForCurrentDir(saved: Partial<SessionState>): boolean {
  if (!saved.workDir) return true;
  try {
    return path.resolve(saved.workDir) === path.resolve(process.cwd());
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
 * 2. Pinned Context (En Üst - En Sabit - Cache dostu)
 * 3. Repo Map (Top - Static)
 * 4. Context Recap / Summary (Middle - Semi-Static)
 */
export function buildStaticContextMessages(): Message[] {
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
        content: 'Proje anayasasını ve mimari dökümanları (Second Brain) hafızama kazıdım. Onay almadan bu yapıları değiştirmeyeceğim.',
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
      content: 'Sabit talimatları aldım, bunları her zaman önceliklendireceğim.',
    });
  }

  // 2. PROJECT STRUCTURE
  // Skip when workDir is the user's home directory — it isn't "a project",
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
        content: 'Proje yapısını aldım.',
      });
    }
  }

  // 2.5 ACTIVE TASK CONTEXT (if task is ACTIVE, keep in static context for caching & continuity)
  if (_state.activeTask && _state.activeTask.taskState === 'ACTIVE') {
    const task = _state.activeTask;
    let taskBlock = `ORIGINAL USER REQUEST: ${task.originalUserRequest}\nCURRENT OBJECTIVE: ${task.currentObjective || task.originalUserRequest}\nTASK STATE: ${task.taskState}`;
    if (task.lastMeaningfulToolResult) {
      taskBlock += `\nLAST MEANINGFUL TOOL RESULT: ${task.lastMeaningfulToolResult}`;
    }
    taskBlock += `\nCRITICAL: Do NOT output greeting or ask for a new task. The task is actively running. Continue working toward completing this task.`;
    result.push({
      role: 'user',
      content: `<active_task>\n${taskBlock}\n</active_task>`,
    });
    result.push({
      role: 'assistant',
      content: 'Aktif görevi ve mevcut hedefi hafızamda tutuyorum. Karşılama yapmadan göreve odaklanarak devam ediyorum.',
    });
  }

  // 3. CONTEXT RECAP / SUMMARY
  if (_state.summary) {
    result.push({
      role: 'user',
      content: `<context_recap>\n${truncateText(_state.summary, MAX_SUMMARY_CHARS)}\n</context_recap>`,
    });
    result.push({
      role: 'assistant',
      content: 'Bağlam özetini aldım.',
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

  // Eski mesajları bütçeye sığdır — EN YENİDEN ESKİYE iterasyon
  // Böylece bütçe dolunca en ESKİ mesajlar düşer, en yeniler kalır
  const fittingOlder: Message[] = [];
  const hotCompacted = hot.map(compactContextMessage);
  const hotTokens = estimateMessagesTokens(hotCompacted);
  const staticTokens = estimateMessagesTokens(result);
  let olderTokens = 0;

  for (let i = older.length - 1; i >= 0; i--) {
    const compacted = compactContextMessage(older[i]);
    const msgTokens = estimateMessagesTokens([compacted]);
    if (staticTokens + olderTokens + msgTokens + hotTokens > budget) break;
    fittingOlder.unshift(compacted); // unshift → sırayı korur (eski → yeni)
    olderTokens += msgTokens;
  }

  // Eski mesajları doğru sırada ekle
  for (const msg of fittingOlder) {
    result.push(msg);
  }

  // Son (hot) mesajları ekle — bunlar her zaman eklenir
  for (const msg of hotCompacted) {
    result.push(msg);
  }

  // Kullanıcının yeni mesajı
  if (pendingUserMessage) {
    result.push({ role: 'user', content: pendingUserMessage });
  }

  return result;
}

export function getSessionMessages(): Message[] {
  return _state.messages;
}

// ─── Active Task & Lifecycle Management ─────────────────────────────────────

export function setActiveTask(originalUserRequest: string, objective?: string): ActiveTaskContext {
  const now = new Date().toISOString();
  const task: ActiveTaskContext = {
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

export function completeActiveTask(): void {
  if (_state.activeTask) {
    _state.activeTask.taskState = 'COMPLETE';
    _state.activeTask.updatedAt = new Date().toISOString();
    _writeWarmBuffer();
    _writeRedis().catch(() => {});
  }
}

export function clearActiveTask(): void {
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
  options: { workDir?: string; preserveSummary?: boolean; activeTask?: ActiveTaskContext | null } = {},
): Promise<void> {
  _state.messages = [...messages];
  _state.flushedCount = 0;
  _state.compressCount = 0;
  _state.conversationLifecycle = 'ACTIVE';
  if (options.activeTask !== undefined) {
    _state.activeTask = options.activeTask;
  }
  if (!options.preserveSummary) _state.summary = '';
  if (options.workDir) _state.workDir = options.workDir;
  _writeWarmBuffer();
  await _writeRedis().catch(() => {});
}

export async function resetSession(workDir = process.cwd()): Promise<void> {
  _state = {
    sessionId: Date.now().toString(36),
    conversationLifecycle: 'EXPLICITLY CLEARED',
    activeTask: null,
    messages: [],
    summary: '',
    pinnedContext: [],
    architectureFiles: [],
    workDir,
    flushedCount: 0,
    compressCount: 0,
  };
  _writeWarmBuffer();
  const redis = await getRedis();
  if (redis) await redis.del('deha:session:latest').catch(() => {});
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
        _state.summary = fs.readFileSync(summaryPath, 'utf-8').replace(/^# DEHA — Proje Özeti\n\n> Son Güncelleme: .*\n\n/, '');
      }
    } catch { }
  }
}

export function getWorkDir(): string {
  return _state.workDir;
}

/** True when `dir` resolves to the OS home directory — see the repo-map skip above. */
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
} {
  return {
    messages: _state.messages.length,
    summary: _state.summary,
    workDir: _state.workDir,
    flushedCount: _state.flushedCount,
    compressCount: _state.compressCount,
    conversationLifecycle: _state.conversationLifecycle,
    activeTask: _state.activeTask ?? null,
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
    // Özetleme öncesinde tüm mesajların cold storage'a yazıldığından emin ol
    await _flushCold(false);

    const newSummary = await summarizeFn(toSummarize);
    let activeTaskInfo = '';
    if (_state.activeTask && _state.activeTask.taskState === 'ACTIVE') {
      activeTaskInfo = `- ACTIVE TASK: ${_state.activeTask.originalUserRequest}\n- CURRENT OBJECTIVE: ${_state.activeTask.currentObjective}\n`;
    }
    const stickyContext = `[STICKY CONTEXT]\n- ACTIVE WORKDIR: ${_state.workDir}\n${activeTaskInfo}- SUMMARY VERSION: ${_state.compressCount + 1}\n\n`;
    _state.summary = _state.summary 
      ? truncateText(`${stickyContext}${_state.summary}\n\n---\n\n[Sonraki Bölüm Özeti]\n${newSummary}`, MAX_SUMMARY_CHARS)
      : truncateText(`${stickyContext}${newSummary}`, MAX_SUMMARY_CHARS);

    if (_state.workDir && fs.existsSync(_state.workDir)) {
      fs.writeFileSync(path.join(_state.workDir, '.deha_summary.md'), `# DEHA — Proje Özeti\n\n> Son Güncelleme: ${new Date().toLocaleString()}\n\n${_state.summary}`);
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
    await redis.set('deha:session:latest', JSON.stringify(_state)).catch(() => {});
    await redis.quit().catch(() => {});
  }
  _writeWarmBuffer();
  await _flushCold(true);
}

function _writeWarmBuffer(): void {
  try {
    if (!fs.existsSync(SESSION_BUFFER_DIR)) fs.mkdirSync(SESSION_BUFFER_DIR, { recursive: true });
    fs.writeFileSync(SESSION_BUFFER_FILE, JSON.stringify(_state), 'utf-8');
  } catch { }
}

async function _writeRedis(): Promise<void> {
  const redis = await getRedis();
  if (redis) await redis.set('deha:session:latest', JSON.stringify(_state));
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

  // Tool mesajları: hata mesajlarını koru, akıllı kırpma yap
  if (message.role === 'tool') {
    return { ...message, content: compactToolContent(content, MAX_CONTEXT_MESSAGE_CHARS) };
  }

  return { ...message, content: truncateText(content, MAX_CONTEXT_MESSAGE_CHARS) };
}

/**
 * Tool sonuçlarını akıllıca kırpar:
 * - Hata mesajlarını ASLA kırpma
 * - JSON yanıtlarında anahtarları koru
 * - Dosya okumalarında head + tail tut
 */
function compactToolContent(content: string, maxChars: number): string {
  // Hata mesajlarını olduğu gibi bırak (genelde kısadır)
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('error') || lowerContent.includes('hata') || lowerContent.includes('failed') || lowerContent.includes('exception')) {
    // Hata mesajı bile çok uzunsa, yine de biraz kırp ama daha fazla tut
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
