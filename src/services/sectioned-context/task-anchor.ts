/**
 * 1. Bölüm — Görev çapası (Task Anchor). ASLA silinmez.
 *
 * Kullanıcının orijinal isteği olduğu gibi + sonradan gelen ek talimatlar +
 * mevcut hedef. Kısa bir "devam et ama X yap" mesajı yeni görev açtıysa önceki
 * görevin isteği de bağlam olarak gösterilir — görev zinciri kopmaz.
 */

import { getActiveTask, getPreviousTaskContext } from '../session-memory';
import { getWorkspace, saveWorkspace } from './store';
import { oneLine, tokensToChars, truncateMiddle } from './budget';

const MAX_FOLLOW_UPS = 20;

/** Aktif göreve ek talimat/düzeltme ekler (follow-up mesajları). */
export function addTaskFollowUp(text: string): void {
  const task = getActiveTask();
  const t = (text || '').trim();
  if (!task || !t) return;
  const ws = getWorkspace();
  const taskId = task.id || task.originalUserRequest;
  if (ws.followUps.taskId !== taskId) ws.followUps = { taskId, items: [] };
  if (t !== task.originalUserRequest && !ws.followUps.items.includes(t)) {
    ws.followUps.items.push(t);
    if (ws.followUps.items.length > MAX_FOLLOW_UPS) ws.followUps.items = ws.followUps.items.slice(-MAX_FOLLOW_UPS);
  }
  saveWorkspace(ws);
}

export function getTaskFollowUps(): string[] {
  const task = getActiveTask();
  if (!task) return [];
  const ws = getWorkspace();
  const taskId = task.id || task.originalUserRequest;
  return ws.followUps.taskId === taskId ? ws.followUps.items : [];
}

/** Görev bölümünü bütçe içinde render eder. Orijinal istek en son kırpılır. */
export function renderTaskAnchor(budgetTokens: number, fallbackUserMessage: string): string {
  const maxChars = tokensToChars(budgetTokens);
  const task = getActiveTask();
  const prev = getPreviousTaskContext();
  const original = task?.originalUserRequest || fallbackUserMessage;
  const followUps = getTaskFollowUps();

  const header: string[] = [];
  header.push(`DURUM: ${task?.taskState ?? 'ACTIVE'}`);
  if (task?.currentObjective && task.currentObjective !== original) {
    header.push(`MEVCUT HEDEF: ${oneLine(task.currentObjective, 600)}`);
  }

  // Kısa istek + önceki görev varsa: muhtemelen bir devam/ince ayar mesajı
  const showPrev = !!prev && prev.originalUserRequest !== original && original.length < 400;

  const build = (origChars: number, followChars: number, prevChars: number): string => {
    const out: string[] = [];
    out.push(`ORİJİNAL KULLANICI İSTEĞİ:\n${truncateMiddle(original, origChars, 'tamamı oturum geçmişinde')}`);
    if (followUps.length > 0) {
      out.push('EK TALİMATLAR / DÜZELTMELER (eskiden yeniye):');
      followUps.forEach((f, i) => out.push(`${i + 1}. ${followChars > 0 ? oneLine(f, followChars) : f}`));
    }
    out.push(...header);
    if (showPrev && prevChars > 0) {
      out.push(`ÖNCEKİ GÖREV (${prev!.taskState}) — bağlam için: ${oneLine(prev!.originalUserRequest, prevChars)}`);
    }
    return out.join('\n');
  };

  const attempts: Array<[number, number, number]> = [
    [Number.MAX_SAFE_INTEGER, 0, 1_500],
    [Math.max(2_000, Math.floor(maxChars * 0.6)), 400, 600],
    [Math.max(1_200, Math.floor(maxChars * 0.5)), 200, 300],
    [Math.max(800, Math.floor(maxChars * 0.4)), 120, 0],
  ];
  for (const [o, f, p] of attempts) {
    const text = build(o, f, p);
    if (text.length <= maxChars) return text;
  }
  // Orijinal istek her koşulda kalır; gerekirse bütçeyi aşarız (görev > bütçe disiplini)
  return build(Math.max(600, Math.floor(maxChars * 0.7)), 80, 0);
}
