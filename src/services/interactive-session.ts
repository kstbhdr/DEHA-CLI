import type { Message } from './ai-service';
import { createConversationId, loadConversationSnapshot } from '../conversations/manager';
import { claimConversation, claimSessionSlot, startFreshSession, getSessionSnapshot, hydrateSession, loadSession, resetSession, setConversationId, setWorkDir, setActiveTask } from './session-memory';
import { recoverBrainFile } from './sectioned-context/store';
import { syncBrainFile } from './sectioned-context/brain';

/** Load before ANY setter: setters persist and can overwrite the checkpoint. */
export async function initializeInteractiveSession(
  workDir: string, transcript: Message[] = [], conversationId?: string,
  options: { resume?: boolean } = { resume: true },
): Promise<{ messages: Message[]; conversationId: string; previousMessages?: number }> {
  const requested = conversationId ? loadConversationSnapshot(conversationId) : null;
  // Reject concurrent resume before replacing the current in-memory workspace.
  if (conversationId) claimConversation(conversationId);
  workDir = requested?.workDir || workDir;
  // Aynı dizinde paralel çalışan deha süreçleri birbirinin görev/brain'ini yüklemesin.
  claimSessionSlot(workDir);
  if (!options.resume && transcript.length === 0) {
    // Düz `deha` = yeni sohbet. Önceki sohbet checkpoint'te kalır
    // (deha --continue / /oldconversations / deha resume <id> ile döner).
    startFreshSession(workDir);
    const id = conversationId || createConversationId();
    setConversationId(id);
    syncBrainFile();
    return { messages: [], conversationId: id };
  }
  await loadSession(workDir);
  const warm = getSessionSnapshot();
  let restoreLegacyBrain = warm.workspace === undefined && warm.conversationLifecycle !== 'EXPLICITLY CLEARED' && !!(warm.messages.length || warm.activeTask);
  if (transcript.length > 0 || requested) {
    const firstUser = (messages: Message[]) => messages.find(m => m.role === 'user' && m.content && !m.content.trimStart().startsWith('<'))?.content;
    const legacyMatch = !warm.conversationId && !!firstUser(transcript) && firstUser(warm.messages) === firstUser(transcript);
    const snapshot = (conversationId && (warm.conversationId === conversationId || legacyMatch))
      ? warm : requested ?? undefined;
    const messages = snapshot?.messages ?? transcript;
    restoreLegacyBrain = restoreLegacyBrain && snapshot === warm;
    await hydrateSession(messages, { workDir, snapshot, preserveSummary: true });
    // Old Markdown archives have no structured task. Retain their original
    // user request as the anchor instead of replacing it with "devam et".
    if (!snapshot?.activeTask) {
      const original = messages.find(m => m.role === 'user' && m.content && !/^(<|\[|merhaba[!.\s]*$|selam[!.\s]*$)/i.test(m.content.trim()));
      if (original?.content) setActiveTask(original.content);
    }
  } else if (!warm.messages.length && !warm.activeTask && !warm.workspace && !warm.pendingInputs?.length) {
    await resetSession(workDir);
  }
  // The original working directory is storage context; tool cwd can be another
  // project (e.g. /content/DEHA-ARC-2). Preserve the task/brain either way.
  setWorkDir(workDir);
  if (restoreLegacyBrain) recoverBrainFile(true);
  const id = conversationId || getSessionSnapshot().conversationId || createConversationId();
  setConversationId(id);
  syncBrainFile();
  return { messages: getSessionSnapshot().messages, conversationId: id };
}
