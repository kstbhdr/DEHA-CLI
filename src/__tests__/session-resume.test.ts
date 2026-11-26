import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const fixtures = await vi.hoisted(async () => {
  const fs = await import('fs'); const os = await import('os'); const path = await import('path');
  return { home: fs.mkdtempSync(path.join(os.tmpdir(), 'deha-resume-')), redis: null as string | null };
});
vi.mock('os', async importOriginal => ({ ...await importOriginal<typeof import('os')>(), homedir: () => fixtures.home }));
vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return fixtures.redis; }
  async set() {} async del() {} async quit() {}
} }));

const original = 'ARC-AGI-2 araştırmasını /content/DEHA-ARC-2 içinde sürdür; gerçek skoru doğrula';
let project: string;
beforeEach(() => {
  vi.resetModules(); fixtures.redis = null;
  project = fs.mkdtempSync(path.join(fixtures.home, 'project-'));
});
function savedState() {
  return { sessionId: 'research-session', conversationId: 'research', workDir: project,
    conversationLifecycle: 'ACTIVE', messages: [{ role: 'user', content: original }], summary: 'E18 ölçüldü',
    activeTask: { id: 'arc-task', originalUserRequest: original, currentObjective: 'E19 deneyi', taskState: 'INTERRUPTED', recoveryAttemptCount: 0 },
    previousTask: null, pinnedContext: ['Drive checkpointlerini koru'], architectureFiles: [], flushedCount: 0, compressCount: 0,
    workspace: { version: 1, turn: 18, nextSeq: 2, followUps: { taskId: 'arc-task', items: [] }, changes: [],
      toolLog: [{ seq: 1, turn: 18, turnIndex: 1, name: 'run_shell', args: 'python e18.py', summary: 'E18 with_fit=0', ok: true }],
      brain: { steps: [{ text: 'Araştırma döngülerini sürdür', status: 'doing' }], findings: ['17/118 çözüldü'], decisions: [], deadEnds: ['E18 per-object başarısız'] } } };
}
function seed(state = savedState(), suffix = '') {
  fs.mkdirSync(path.join(project, '.deha'), { recursive: true });
  fs.writeFileSync(path.join(project, '.deha', `session-buffer.json${suffix}`), JSON.stringify(state));
}
async function app() {
  const session = await import('../services/session-memory');
  const { initializeInteractiveSession: start } = await import('../services/interactive-session');
  const conversations = await import('../conversations/manager');
  return { session, start, conversations };
}

describe('Gerçek açılış ve sohbet geri yükleme yolu', () => {
  it('mesaj geçmişi henüz oluşmamış bekleyen kuyruk açılışta sıfırlanmaz', async () => {
    seed({ ...savedState(), messages: [], activeTask: null, workspace: undefined,
      pendingInputs: ['first queued', 'second queued'] } as any);
    const { start, session } = await app(); await start(project);
    expect(session.getPendingInputs()).toEqual(['first queued', 'second queued']);
    expect(session.getSessionMessages()).toEqual([]);
  });
  it('tur bitmeden gelen tool sonucu arşivde listelenir ve eksiksiz resume edilir', async () => {
    seed(); const { start, session, conversations } = await app(); await start(project);
    const result: any = { role: 'tool', tool_call_id: 'pending-call', content: 'CHECKPOINT_SAVED_SHA256' };
    await session.appendMessage(result);
    expect(fs.existsSync(path.join(conversations.getConvDir(), 'research.md'))).toBe(false);
    const listed = conversations.listConversations(100, project);
    expect(listed).toHaveLength(1);
    expect(listed[0].messageCount).toBe(2);
    expect(conversations.searchConversations('CHECKPOINT_SAVED_SHA256').map(c => c.id)).toContain('research');
    expect(conversations.loadConversationMessages('research')?.at(-1)).toEqual(result);
    expect(conversations.loadConversationSnapshot('research')?.workspace).toEqual(savedState().workspace);
  });
  it('iki yerel tampon bozuksa global kayıttan görev ve brain kurtarılır', async () => {
    seed(); let appState = await app(); await appState.start(project);
    await appState.session.appendMessage({ role: 'assistant', content: 'E19 henüz bitmedi' });
    const buffer = appState.session.getSessionBufferFile(project);
    fs.writeFileSync(buffer, '{broken'); fs.writeFileSync(`${buffer}.bak`, '{broken');
    vi.resetModules(); appState = await app();
    const recovered = await appState.start(project);
    expect(recovered.messages.at(-1)?.content).toBe('E19 henüz bitmedi');
    expect(appState.session.getSessionSnapshot().workspace).toEqual(savedState().workspace);
    expect(appState.session.getActiveTask()?.originalUserRequest).toBe(original);
  });
  it('global kaydın bozulması sağlam yedekten resume edilmesini engellemez', async () => {
    seed(); const { start, session, conversations } = await app(); await start(project);
    await session.appendMessage({ role: 'assistant', content: 'E19 sürüyor' });
    const file = path.join(conversations.getConvDir(), 'research.session.json');
    fs.writeFileSync(file, '{broken');
    expect(conversations.listConversations(100, project)).toHaveLength(1);
    expect(conversations.loadConversationSnapshot('research')?.activeTask?.originalUserRequest).toBe(original);
  });
  it('restart ilk setterdan önce diskten görev, brain ve tool günlüğünü yükler', async () => {
    seed(); const { start, session } = await app();
    const restored = await start(project);
    expect(restored.conversationId).toBe('research');
    expect(session.getSessionSnapshot().workspace).toEqual(savedState().workspace);
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
    expect(restored.messages[0].content).toBe(original);
    expect(JSON.parse(fs.readFileSync(session.getSessionBufferFile(project), 'utf-8')).workspace).toEqual(savedState().workspace);
  });
  it('eski Redis kaydı daha güncel disk checkpointini ezmez', async () => {
    seed(); fixtures.redis = JSON.stringify({ ...savedState(), messages: [], workspace: undefined, activeTask: null });
    const { start, session } = await app(); await start(project);
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
    expect(session.getSessionSnapshot().workspace).toEqual(savedState().workspace);
  });
  it('yarıda kesilmiş JSON yerine son geçerli checkpointi yükler', async () => {
    seed(savedState(), '.bak'); fs.writeFileSync(path.join(project, '.deha', 'session-buffer.json'), '{"messages":');
    const { start, session } = await app(); await start(project);
    expect(session.getSessionSnapshot().workspace).toEqual(savedState().workspace);
  });
  it('resume başka sohbet açık olsa bile doğru brain ve tam tool_calls yapısını getirir', async () => {
    seed(); let { start, session, conversations } = await app(); await start(project);
    const messages: any[] = [...savedState().messages,
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_e18', type: 'function', function: { name: 'run_shell', arguments: '{"command":"python e18.py"}' } }] },
      { role: 'tool', tool_call_id: 'call_e18', content: 'SUMMARY with_fit=0' }];
    conversations.saveConversation(messages, 'deepseek', 'test', { conversationId: 'research' });
    seed({ ...savedState(), conversationId: 'other-chat', activeTask: null, workspace: { ...savedState().workspace, brain: { steps: [], findings: [], decisions: [], deadEnds: [] } } });
    vi.resetModules(); ({ start, session, conversations } = await app());
    const transcript = conversations.loadConversationMessages('research')!;
    const restored = await start(project, transcript, 'research');
    expect(restored.messages).toEqual(messages);
    expect(session.getSessionSnapshot().workspace).toEqual(savedState().workspace);
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
  });
  it('uzun devam talimatı orijinal görevi değiştirmez ve yeni istekte brain modele gider', async () => {
    seed(); const { start, session } = await app(); const restored = await start(project);
    const agent = await import('../commands/agent');
    const followUp = 'devam et araştırmayı tamamlamadın görevi bitirmeden durma';
    const task = agent.resolveTaskForUserMessage(followUp);
    expect(task.id).toBe('arc-task'); expect(task.originalUserRequest).toBe(original);
    const ai = await import('../services/ai-service');
    const send = vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockImplementation(async messages => {
      const context = JSON.stringify(messages);
      expect(context).toContain(original); expect(context).toContain('E18 per-object başarısız');
      expect(context).toContain('E19 deneyi');
      return { text: 'Araştırma için Drive anahtarı gerekli. [STATUS: BLOCKED]', toolCalls: [], rawAssistantMsg: { role: 'assistant', content: 'Araştırma için Drive anahtarı gerekli. [STATUS: BLOCKED]' }, malformedToolCalls: 0, finishReason: 'stop' };
    });
    const { getConfig } = await import('../config');
    await agent.runAgent(followUp, getConfig({ provider: 'deepseek' }), restored.messages, undefined, undefined, undefined, { taskAlreadyResolved: true, sectioned: true });
    expect(send).toHaveBeenCalledTimes(1); send.mockRestore();
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
  });
  it('başka proje açılması önceki projenin brain bilgisini taşımaz', async () => {
    seed(); const { start, session } = await app(); await start(project);
    const other = fs.mkdtempSync(path.join(fixtures.home, 'other-')); await start(other);
    expect((session.getSessionSnapshot().workspace as any).brain.steps).toEqual([]);
    expect(session.getActiveTask()).toBeNull();
  });
  it('eski JSON workspace içermiyorsa kalan brain.md planını ve çıkmazları kurtarır', async () => {
    seed({ ...savedState(), workspace: undefined } as any);
    fs.writeFileSync(path.join(project, '.deha', 'brain.md'), '# DEHA Brain\n\n## Plan\n[x] 1. E17 ölçüldü\n[~] 2. Araştırmayı sürdür\n## Bulgular\n- 17/118\n## Çıkmaz sokaklar — TEKRAR DENEME\n- E18 başarısız\n');
    const { start, session } = await app(); await start(project);
    const workspace = session.getSessionSnapshot().workspace as any;
    expect(workspace.brain.steps[1]).toEqual({ text: 'Araştırmayı sürdür', status: 'doing' });
    expect(workspace.brain.deadEnds).toEqual(['E18 başarısız']);
  });
  it('eski Markdown için son araç çıktıları da sectioned bağlama alınır', async () => {
    const { start, session } = await app();
    await start(project, [{ role: 'user', content: original }, { role: 'assistant', content: 'Ölçüyorum' },
      { role: 'user', content: '<previous_tool_result>\nE18_SUMMARY with_fit=0\n</previous_tool_result>' }], 'legacy');
    const { createTurnAssembler } = await import('../services/sectioned-context');
    const { getConfig } = await import('../config');
    const assembler = createTurnAssembler(getConfig({ provider: 'deepseek' }), [], 'openai');
    const built = assembler.build({ systemPrompt: 'test', userMessage: 'devam et', history: session.getSessionMessages(), turn: [] });
    expect(JSON.stringify(built.messages)).toContain('E18_SUMMARY with_fit=0');
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
  });
  it('bilerek temizlenen sohbet eski brain.md dosyasından tekrar canlanmaz', async () => {
    seed(); const { start, session } = await app(); await start(project);
    fs.writeFileSync(path.join(project, '.deha', 'brain.md'), '# DEHA Brain\n## Plan\n[~] 1. Eski ARC işi\n');
    await session.resetSession(project);
    await session.appendMessage({ role: 'user', content: 'Yeni bağımsız görev' });
    vi.resetModules(); const restarted = await app(); await restarted.start(project);
    expect((restarted.session.getSessionSnapshot().workspace as any).brain.steps).toEqual([]);
  });

  it('aynı saniyede oluşturulan sohbetlerin kimlikleri farklıdır', async () => {
    const { conversations } = await app();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
      const ids = Array.from({ length: 100 }, () => conversations.createConversationId());
      expect(new Set(ids).size).toBe(100);
    } finally { vi.useRealTimers(); }
  });

  it('aynı projedeki yeni sohbet kendi brain dosyasını kullanır ve önceki dosyayı korur', async () => {
    const { start, session } = await app();
    const { executeBrainTool } = await import('../services/sectioned-context/brain');
    const { getBrainFile } = await import('../services/sectioned-context/store');
    const first = await start(project, [], undefined, { resume: false });
    executeBrainTool({ action: 'add_finding', text: 'PRIVATE_FIRST_CHAT' });
    session.setPendingInputs(['PRIVATE_QUEUE']);
    session.addPinnedMessage('PRIVATE_PIN');
    const file = getBrainFile();
    const buffer = session.getSessionBufferFile();
    const namespace = session.getMemoryNamespace();
    const second = await start(project, [], undefined, { resume: false });
    expect(second.conversationId).not.toBe(first.conversationId);
    expect(second.messages).toEqual([]);
    expect(session.getPendingInputs()).toEqual([]);
    expect(session.getSessionSnapshot().pinnedContext).toEqual([]);
    expect(session.getMemoryNamespace()).not.toBe(namespace);
    expect(getBrainFile()).not.toBe(file);
    expect(fs.readFileSync(getBrainFile(), 'utf8')).not.toContain('PRIVATE_FIRST_CHAT');
    executeBrainTool({ action: 'add_finding', text: 'PRIVATE_SECOND_CHAT' });
    expect(fs.readFileSync(file, 'utf8')).toContain('PRIVATE_FIRST_CHAT');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('PRIVATE_SECOND_CHAT');
    expect(JSON.parse(fs.readFileSync(buffer, 'utf8')).pendingInputs).toEqual(['PRIVATE_QUEUE']);
  });

  it('başka dizinden resume sohbetin kendi proje ve brain yoluna döner', async () => {
    seed(); const { start, session } = await app(); await start(project);
    const other = fs.mkdtempSync(path.join(fixtures.home, 'other-'));
    await start(other, savedState().messages as any, 'research');
    expect(session.getWorkDir()).toBe(project);
    expect(session.getSessionBufferFile()).toBe(path.join(project, '.deha', 'sessions', 'research', 'session-buffer.json'));
    expect(session.getActiveTask()?.originalUserRequest).toBe(original);
  });

  it('proje değişiminde ortak eski özet yüklenmez ve sohbetin brain dosyası ayrılır', async () => {
    const { start, session } = await app(); await start(project, [], undefined, { resume: false });
    const other = fs.mkdtempSync(path.join(fixtures.home, 'other-'));
    fs.writeFileSync(path.join(other, '.deha_summary.md'), 'OTHER_CONVERSATION_SECRET');
    await session.appendMessage({ role: 'user', content: 'My project' });
    session.setWorkDir(other);
    expect(session.getSessionSnapshot().summary).toBe('');
    const { executeBrainTool } = await import('../services/sectioned-context/brain');
    const { getBrainFile } = await import('../services/sectioned-context/store');
    executeBrainTool({ action: 'add_finding', text: 'MY_BRAIN' });
    expect(getBrainFile().startsWith(other + path.sep)).toBe(true);
    expect(fs.readFileSync(getBrainFile(), 'utf8')).toContain('MY_BRAIN');
  });

  it('proje geçmişinde etiketsiz ve farklı proje sohbetleri görünmez', async () => {
    const { start, conversations } = await app(); await start(project, [], undefined, { resume: false });
    fs.writeFileSync(path.join(conversations.getConvDir(), 'unknown.md'), '---\ntitle: "secret"\nmessages: 1\n---\n## 🧑 Kullanıcı\nLEGACY_SECRET\n');
    expect(conversations.listConversations(100, project)).toEqual([]);
    expect(conversations.searchConversations('LEGACY_SECRET', project)).toEqual([]);
    expect(conversations.searchConversations('LEGACY_SECRET').map(c => c.id)).toContain('unknown');
  });
});
