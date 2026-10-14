/**
 * Bölümlü context assembler — her model çağrısından önce isteği 4 bölümden kurar.
 *
 * Mesaj sırası (DeepSeek/Anthropic önek önbelleği + modelin baş/son dikkati için):
 *
 *   [system + tool şemaları]          ← hiç değişmez            (cache)
 *   [statik proje bağlamı]             ← tur boyunca sabit        (cache)
 *   [1. <task> görev çapası]           ← nadiren değişir          (cache)
 *   [3+4. <work_log> değişiklikler + tool özetleri]
 *                                      ← SADECE native pencere kaydığında yenilenir
 *   [önceki sohbet + kullanıcının mesajı]
 *   [4. son round'lar — yerel tool mesajları, TAM]  ← sadece eklenir
 *   [2. <brain> plan + görev hatırlatma]            ← her round güncel, EN SONDA
 *
 * Native pencere bütçeyi aşınca en eski round'lar TOPLU halde (bütçenin %60'ına
 * inene kadar) pencereden çıkarılır; çıkanlar zaten tool günlüğünde özetlenmiş
 * olduğu için bilgi kaybolmaz. Toplu kaydırma sayesinde önbellek her round değil,
 * sadece arada bir bozulur.
 */

import type { Message } from '../ai-service';
import { buildStaticContextMessages } from '../session-memory';
import {
  SectionBudgets, SectionRatios, computeSectionBudgets, estimateTextTokens, oneLine, tokensToChars, truncateMiddle,
} from './budget';
import { getWorkspace, saveWorkspace, WorkspaceContext } from './store';
import { renderTaskAnchor } from './task-anchor';
import { renderBrain, brainIsEmpty } from './brain';
import { renderChanges, recordChange } from './change-ledger';
import { renderToolLog, summarizeToolResult, formatToolArgs } from './tool-log';
import { getActiveTask } from '../session-memory';

export type AssemblerMessage = { role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown; [k: string]: unknown };

export interface AssemblerOptions {
  format: 'openai' | 'claude';
  totalContext: number;
  outputReserve: number;
  toolSchemaTokens: number;
  ratios?: SectionRatios;
}

export interface BuildInput {
  systemPrompt: string;
  /** Önceki sohbet (ham oturum mesajları); son kullanıcı mesajı = bu turun isteği */
  history: Message[];
  /** Bu tur içinde üretilen mesajların tamamı (assistant tool_calls, tool sonuçları, iç promptlar) */
  turn: AssemblerMessage[];
  userMessage: string;
}

export interface BuildStats {
  budgets: SectionBudgets;
  used: { task: number; plan: number; changes: number; toolLog: number; dialogue: number; native: number };
  totalTokens: number;
  nativeStart: number;
  rolledOver: boolean;
}

export const BRAIN_BLOCK_MARKER = '<brain>';

const INTERNAL_MESSAGE_PATTERNS = [
  /^The previous tool call was truncated/,
  /^This response was detected as an interim/,
  /^Tool results were just produced/,
  /^\[ERROR RECOVERY\]/,
  /^\[SİSTEM UYARISI/,
  /^\[SYSTEM WARNING\]/,
  /^\[DEHA BAĞLAM NOTU\]/,
  /^<tool_result/,
  /^<previous_tool_result/,
  /^<brain>/,
  /^\[tool calls\]$/,
];

function isInternalMessage(content: string): boolean {
  const t = content.trim();
  return INTERNAL_MESSAGE_PATTERNS.some(p => p.test(t));
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');
  return '';
}

export function messageTokens(m: AssemblerMessage): number {
  let chars = contentText(m.content).length + 16;
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls as any[]) {
      chars += (tc?.function?.name?.length ?? 0) + (typeof tc?.function?.arguments === 'string' ? tc.function.arguments.length : 0) + 32;
    }
  }
  if (typeof m.reasoning_content === 'string') chars += m.reasoning_content.length;
  return Math.ceil(chars / 3.5);
}

export function messagesTokens(msgs: AssemblerMessage[]): number {
  return msgs.reduce((n, m) => n + messageTokens(m), 0);
}

function isToolResult(m: AssemblerMessage): boolean {
  return m.role === 'tool' || (m.role === 'user' && contentText(m.content).trimStart().startsWith('<tool_result'));
}

/** Native pencerenin başlayabileceği güvenli indeks: tool sonucu ortasında başlamaz. */
function isValidWindowStart(turn: AssemblerMessage[], i: number): boolean {
  const m = turn[i];
  return !!m && !isToolResult(m);
}

export class TurnContextAssembler {
  readonly turnNo: number;
  private staticMsgs: AssemblerMessage[] | null = null;
  private nativeStart = 0;
  private snapshot: { text: string; changesTokens: number; toolLogTokens: number } | null = null;

  constructor(private readonly opts: AssemblerOptions) {
    const ws = getWorkspace();
    ws.turn += 1;
    this.turnNo = ws.turn;
    saveWorkspace(ws);
  }

  /** Tool çalıştıktan sonra çağrılır: tool günlüğüne ve değişiklik defterine işler. */
  recordTool(name: string, input: Record<string, unknown>, result: string, purpose: string | undefined, turnIndex: number): void {
    if (name === 'brain') return; // brain zaten kendi bölümünde görünüyor
    const ws = getWorkspace();
    const seq = ws.nextSeq++;
    const { summary, ok } = summarizeToolResult(name, result);
    const why = purpose && purpose.trim() ? oneLine(purpose, 200) : undefined;
    ws.toolLog.push({ seq, turn: this.turnNo, turnIndex, name, args: formatToolArgs(name, input), purpose: why, summary, ok });
    recordChange(ws.changes, name, input, result, seq, why ? oneLine(why, 100) : undefined);
    saveWorkspace(ws);
  }

  private renderSnapshot(ws: WorkspaceContext, changesBudget: number, toolLogBudget: number): { text: string; changesTokens: number; toolLogTokens: number } {
    const summarized = ws.toolLog.filter(e => e.turn < this.turnNo || e.turnIndex < this.nativeStart);
    const changes = renderChanges(ws.changes, changesBudget);
    const log = renderToolLog(summarized, toolLogBudget);
    const parts: string[] = [];
    if (changes) parts.push(`## Yapılan değişiklikler\n${changes}`);
    if (log) parts.push(`## Araç çağrıları (eski round'lar özet; son round'lar aşağıda tam)\n${log}`);
    return { text: parts.join('\n\n'), changesTokens: estimateTextTokens(changes), toolLogTokens: estimateTextTokens(log) };
  }

  private buildDialogue(history: Message[], budgetTokens: number, userMessage: string): AssemblerMessage[] {
    const items: AssemblerMessage[] = [];
    for (const m of history) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      const text = typeof m.content === 'string' ? m.content : '';
      if (!text.trim() || isInternalMessage(text)) continue;
      items.push({ role: m.role, content: text });
    }
    let lastUser = -1;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].role === 'user') { lastUser = i; break; }
    if (lastUser < 0 || contentText(items[lastUser].content).trim() !== userMessage.trim()) {
      items.push({ role: 'user', content: userMessage });
      lastUser = items.length - 1;
    }

    const currentCap = tokensToChars(Math.max(1_500, Math.floor(budgetTokens * 0.6)));
    const current: AssemblerMessage = {
      role: 'user',
      content: truncateMiddle(contentText(items[lastUser].content), currentCap, 'tam metin <task> bölümünde'),
    };
    const selected: AssemblerMessage[] = [current];
    let used = messageTokens(current);
    for (let i = lastUser - 1; i >= 0; i--) {
      const m = { role: items[i].role, content: truncateMiddle(contentText(items[i].content), 2_400, 'eski mesaj') };
      const t = messageTokens(m);
      if (used + t > budgetTokens) break;
      selected.unshift(m);
      used += t;
    }
    while (selected.length > 1 && selected[0].role !== 'user') selected.shift();
    return selected;
  }

  /** Native pencereyi gerekirse toplu kaydırır. Kaydırma olduysa true. */
  private rollWindow(turn: AssemblerMessage[], nativeBudget: number): boolean {
    if (messagesTokens(turn.slice(this.nativeStart)) <= nativeBudget) return false;
    const target = Math.floor(nativeBudget * 0.6);
    let lastValid = this.nativeStart;
    let chosen = -1;
    for (let i = this.nativeStart + 1; i < turn.length; i++) {
      if (!isValidWindowStart(turn, i)) continue;
      lastValid = i;
      if (messagesTokens(turn.slice(i)) <= target) { chosen = i; break; }
    }
    const next = chosen >= 0 ? chosen : lastValid;
    if (next === this.nativeStart) return false;
    this.nativeStart = next;
    return true;
  }

  build(input: BuildInput): { messages: AssemblerMessage[]; stats: BuildStats } {
    if (!this.staticMsgs) {
      this.staticMsgs = buildStaticContextMessages({ includeActiveTask: false, includeSummary: false }) as AssemblerMessage[];
    }
    const fixed = estimateTextTokens(input.systemPrompt) + this.opts.toolSchemaTokens + messagesTokens(this.staticMsgs);
    const budgets = computeSectionBudgets(this.opts.totalContext, fixed, { outputReserve: this.opts.outputReserve, ratios: this.opts.ratios });
    const ws = getWorkspace();

    // 1. Görev + 2. Plan — kullanılmayan pay tool bölümüne akar
    const taskText = renderTaskAnchor(budgets.task, input.userMessage);
    const planBody = renderBrain(ws.brain, budgets.plan);
    const taskTokens = estimateTextTokens(taskText);
    const planTokens = estimateTextTokens(planBody);
    const toolsBudget = budgets.tools + Math.max(0, budgets.task - taskTokens) + Math.max(0, budgets.plan - planTokens);

    const dialogue = this.buildDialogue(input.history, Math.floor(toolsBudget * 0.15), input.userMessage);
    const dialogueTokens = messagesTokens(dialogue);
    const toolLogBudget = Math.floor(toolsBudget * 0.30);

    if (!this.snapshot) this.snapshot = this.renderSnapshot(ws, budgets.changes, toolLogBudget);
    const nativeBudgetFor = (s: { changesTokens: number; toolLogTokens: number }) =>
      Math.max(2_000, toolsBudget + Math.max(0, budgets.changes - s.changesTokens) - s.toolLogTokens - dialogueTokens);

    let rolledOver = false;
    if (this.rollWindow(input.turn, nativeBudgetFor(this.snapshot))) {
      rolledOver = true;
      this.snapshot = this.renderSnapshot(ws, budgets.changes, toolLogBudget);
    }
    const nativeBudget = nativeBudgetFor(this.snapshot);

    // Native pencere (kopya). Tek bir round bile bütçeyi aşıyorsa tool içerikleri kopyada kırpılır.
    let native: AssemblerMessage[] = input.turn.slice(this.nativeStart).map(m => ({ ...m }));
    if (messagesTokens(native) > nativeBudget) {
      const toolMsgs = native.filter(isToolResult);
      const nonTool = messagesTokens(native.filter(m => !isToolResult(m)));
      const perMsgChars = Math.max(2_000, Math.floor(tokensToChars(Math.max(0, nativeBudget - nonTool)) / Math.max(1, toolMsgs.length)));
      native = native.map(m => (isToolResult(m) && typeof m.content === 'string'
        ? { ...m, content: truncateMiddle(m.content, perMsgChars, 'bağlam limiti') }
        : m));
    }

    const original = getActiveTask()?.originalUserRequest || input.userMessage;
    const brainBlock = [
      BRAIN_BLOCK_MARKER,
      brainIsEmpty(ws.brain)
        ? '(henüz plan yok — çok adımlı bir işse önce `brain` aracıyla set_plan yap; denenip işe yaramayan her yaklaşımı add_dead_end ile kaydet)'
        : planBody,
      '</brain>',
      `[GÖREV HATIRLATMA — DEHA tarafından otomatik eklendi, kullanıcı mesajı değil] Orijinal istek: "${oneLine(original, 300)}". ` +
        'Kullanıcının mesajı boş DEĞİL. Görev bitene kadar devam et; bitince [STATUS: COMPLETE] yaz.',
    ].join('\n');

    const out: AssemblerMessage[] = [];
    if (this.opts.format === 'openai') out.push({ role: 'system', content: input.systemPrompt });
    out.push(...this.staticMsgs);
    out.push({ role: 'user', content: `<task>\n${taskText}\n</task>` });
    out.push({ role: 'assistant', content: 'Görevi aldım; bitene kadar bu göreve odaklanacağım.' });
    if (this.snapshot.text) {
      out.push({ role: 'user', content: `<work_log>\n${this.snapshot.text}\n</work_log>` });
      out.push({ role: 'assistant', content: 'Çalışma günlüğünü aldım; yapılanları tekrar etmeyeceğim.' });
    }
    out.push(...dialogue);
    out.push(...native);
    const last = out[out.length - 1];
    if (this.opts.format === 'claude' && last && last.role === 'user' && typeof last.content === 'string') {
      // Anthropic ardışık user mesajı sevmez → son user mesajına ekle (kopya üzerinde)
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${brainBlock}` };
    } else {
      out.push({ role: 'user', content: brainBlock });
    }

    const stats: BuildStats = {
      budgets,
      used: {
        task: taskTokens,
        plan: planTokens,
        changes: this.snapshot.changesTokens,
        toolLog: this.snapshot.toolLogTokens,
        dialogue: dialogueTokens,
        native: messagesTokens(native),
      },
      totalTokens: messagesTokens(out) + this.opts.toolSchemaTokens,
      nativeStart: this.nativeStart,
      rolledOver,
    };
    return { messages: out, stats };
  }
}
