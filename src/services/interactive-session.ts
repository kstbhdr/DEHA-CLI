import type { Message } from './ai-service';
import { createConversationId, loadConversationSnapshot } from '../conversations/manager';
import { getSessionSnapshot, hydrateSession, loadSession, resetSession, setConversationId, setWorkDir, setActiveTask } from './session-memory';
import { recoverBrainFile } from './sectioned-context/store';

/** Load before ANY setter: setters persist and can overwrite the checkpoint. */
export async function initializeInteractiveSession(
  workDir: string, transcript: Message[] = [], conversationId?: string,
): Promise<{ messages: Message[]; conversationId: string }> {
  await loadSession(workDir);
  const warm = getSessionSnapshot();
  let restoreLegacyBrain = warm.workspace === undefined && warm.conversationLifecycle !== 'EXPLICITLY CLEARED' && !!(warm.messages.length || warm.activeTask);
  if (transcript.length > 0) {
    const firstUser = (messages: Message[]) => messages.find(m => m.role === 'user' && m.content && !m.content.trimStart().startsWith('<'))?.content;
    const legacyMatch = !warm.conversationId && !!firstUser(transcript) && firstUser(warm.messages) === firstUser(transcript);
    const snapshot = (conversationId && (warm.conversationId === conversationId || legacyMatch))
      ? warm : conversationId ? loadConversationSnapshot(conversationId) ?? undefined : undefined;
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
  if (restoreLegacyBrain) recoverBrainFile();
  const id = conversationId || getSessionSnapshot().conversationId || createConversationId();
  setConversationId(id);
  return { messages: getSessionSnapshot().messages, conversationId: id };
}
