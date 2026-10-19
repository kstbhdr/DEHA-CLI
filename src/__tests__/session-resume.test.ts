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
    expect(session.getSessionSnapshot().workspace).toBeNull();
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
    expect(restarted.session.getSessionSnapshot().workspace).toBeNull();
  });
});
