import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runAgent, isContextLossGreeting, isFollowUpOrInspection } from '../commands/agent';
import * as aiService from '../services/ai-service';
import * as tools from '../tools';
import {
  setActiveTask,
  getActiveTask,
  updateActiveTask,
  completeActiveTask,
  clearActiveTask,
  resetSession,
  loadSession,
  appendMessage,
  getSessionMessages,
  getSessionStats,
  summarizeOld,
  buildContextMessages,
} from '../services/session-memory';
import { getConfig } from '../config';

describe('Agent Continuity & Persistent Memory', () => {
  const dummyConfig = getConfig({ provider: 'deepseek' });

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSession(process.cwd());
  });

  afterEach(async () => {
    await resetSession(process.cwd());
  });

  // ─── Test 1: Tool solved: False ardından [STATUS: BLOCKED] karşılama mesajı ──
  it('1. Tool sonucu solved: False ardından gelen karşılama mesajını context-loss olarak algılar ve kurtarır', async () => {
    let callCount = 0;

    vi.spyOn(tools, 'executeTool').mockReturnValue('{"solved": false, "error": "AssertionError"}');

    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async (messages: any[]) => {
      callCount++;
      if (callCount === 1) {
        // İlk tur: Model run_shell aracını çağırır
        return {
          text: '',
          toolCalls: [{ id: 'call_1', name: 'run_shell', input: { command: 'python solve.py' } }],
          rawAssistantMsg: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_shell', arguments: '{"command":"python solve.py"}' } }],
          },
          malformedToolCalls: 0,
          finishReason: 'tool_calls',
        };
      } else if (callCount === 2) {
        // İkinci tur: Model tool sonucundan sonra aniden karşılama moduna döner (context-loss)
        return {
          text: 'Merhaba! Ben DEHA. Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]',
          toolCalls: [],
          rawAssistantMsg: {
            role: 'assistant',
            content: 'Merhaba! Ben DEHA. Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]',
          },
          malformedToolCalls: 0,
          finishReason: 'stop',
        };
      } else {
        // Üçüncü tur: Sistem uyarısı ile kendine gelip görevi tamamlar
        return {
          text: 'Önceki test solved: False verdiği için kodu güncelledim ve görevi tamamladım. [STATUS: COMPLETE]',
          toolCalls: [],
          rawAssistantMsg: {
            role: 'assistant',
            content: 'Önceki test solved: False verdiği için kodu güncelledim ve görevi tamamladım. [STATUS: COMPLETE]',
          },
          malformedToolCalls: 0,
          finishReason: 'stop',
        };
      }
    });

    const recordedMessages: aiService.Message[] = [];
    const result = await runAgent(
      'ARC-AGI-2 testlerini çalıştır ve çöz',
      dummyConfig,
      [{ role: 'user', content: 'ARC-AGI-2 testlerini çalıştır ve çöz' }],
      undefined,
      undefined,
      (msg) => { recordedMessages.push(msg); },
    );

    // Context-loss kurtarma tetiklendiği için en az 3 model çağrısı olmalı
    expect(callCount).toBe(3);
    expect(result.response).toContain('görevi tamamladım');

    // Kaydedilen mesajlar içinde sistem kurtarma uyarısı yer almalı
    const recoveryMsg = recordedMessages.find(m => m.role === 'user' && m.content?.includes('SİSTEM UYARISI: Görev zaten aktif'));
    expect(recoveryMsg).toBeDefined();
    expect(recoveryMsg?.content).toContain('ARC-AGI-2 testlerini çalıştır ve çöz');
  });

  // ─── Test 2: isContextLossGreeting tespit kontrolü ───────────────────────────
  it('2. Model "Henüz bir görev tanımı yapılmadı" dediğinde isContextLossGreeting bunu doğru tanır', () => {
    expect(isContextLossGreeting('Merhaba! Ben DEHA. Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]')).toBe(true);
    expect(isContextLossGreeting('Henüz bir görev vermediniz, nasıl yardımcı olabilirim?')).toBe(true);
    expect(isContextLossGreeting('I am ready and waiting for your task. How can I help you today?')).toBe(true);
    expect(isContextLossGreeting('Dosya izin hatası aldım, devam etmek için sudo yetkisi gerekiyor. [STATUS: BLOCKED]')).toBe(false);
    expect(isContextLossGreeting('Görev başarıyla tamamlandı. [STATUS: COMPLETE]')).toBe(false);
  });

  // ─── Test 2b: "Mesajın boş geldi" amnezisi ───────────────────────────────────
  it('2b. Tool sonrası "your message came through empty" yanıtını (uzun yetenek listesiyle bile) context-loss sayar', () => {
    const reply = `It looks like your message came through empty — I don't see a question or task yet.\n\nWhat would you like help with? I can assist with things like:\n\n- **Code**: writing, debugging, reviewing, or explaining code in your project\n- **Files**: reading, editing, or analyzing files\n- **Shell**: running commands, builds, tests, or git operations\n- **Research**: searching the web for up-to-date information\n- **Images**: generating visuals or mockups\n\nJust let me know what you need!`;
    expect(isContextLossGreeting(reply, { userMessage: 'solver sonuçlarını kontrol et', hadToolActivity: true })).toBe(true);
    // Kullanıcı gerçekten boş mesaj gönderdiyse false-positive üretme
    expect(isContextLossGreeting(reply, { userMessage: '   ' })).toBe(false);
  });

  it('2c. "different"/"diffusion" içeren yeni istekler eski görevin takibi sayılmaz', () => {
    expect(isFollowUpOrInspection('Train a diffusion model on the new dataset')).toBe(false);
    expect(isFollowUpOrInspection('try a different approach for the parser')).toBe(false);
    expect(isFollowUpOrInspection('diffi göster')).toBe(true);
  });

  // ─── Test 2d: Uzun tool döngüsünde görev isteği bağlamdan düşmemeli ──────────
  it('2d. Çok sayıda büyük tool sonucundan sonra bile kullanıcının ARC görevi her istekte modele gider', async () => {
    const prevBudget = process.env.DEHA_TURN_BUDGET_TOKENS;
    process.env.DEHA_TURN_BUDGET_TOKENS = '12000';
    const task = 'ARC-AGI-2 görevlerini solver_v8 ile çöz ve skorları raporla';
    const bigOutput = 'x'.repeat(20_000);
    vi.spyOn(tools, 'executeTool').mockReturnValue(bigOutput);
    vi.spyOn(tools, 'executeToolAsync').mockResolvedValue(bigOutput);

    let call = 0;
    const seenTask: boolean[] = [];
    const seenTokens: number[] = [];
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async (messages: any[]) => {
      call++;
      seenTask.push(messages.some(m => typeof m.content === 'string' && m.content.includes(task)));
      seenTokens.push(Math.ceil(messages.reduce((n, m) => n + String(m.content ?? '').length, 0) / 3.5));
      // tool_call / tool_result eşleşmesi asla bozulmamalı
      const callIds = new Set(messages.flatMap(m => (m.tool_calls ?? []).map((tc: any) => tc.id)));
      for (const m of messages) if (m.role === 'tool') expect(callIds.has(m.tool_call_id)).toBe(true);

      if (call <= 15) {
        return {
          text: '',
          toolCalls: [{ id: `c${call}`, name: 'run_shell', input: { command: `python solver_v8.py --step ${call}` } }],
          rawAssistantMsg: { role: 'assistant', content: '', tool_calls: [{ id: `c${call}`, type: 'function', function: { name: 'run_shell', arguments: `{"command":"python solver_v8.py --step ${call}"}` } }] },
          malformedToolCalls: 0,
          finishReason: 'tool_calls',
        };
      }
      return { text: 'Skorlar: 12/120 çözüldü. [STATUS: COMPLETE]', toolCalls: [], rawAssistantMsg: { role: 'assistant', content: 'Skorlar: 12/120 çözüldü. [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop' };
    });

    try {
      await runAgent(task, dummyConfig, [{ role: 'user', content: task }]);
    } finally {
      if (prevBudget === undefined) delete process.env.DEHA_TURN_BUDGET_TOKENS; else process.env.DEHA_TURN_BUDGET_TOKENS = prevBudget;
    }

    expect(call).toBeGreaterThanOrEqual(16);
    expect(seenTask.every(Boolean)).toBe(true);
    // Bağlam sınırsız büyümemeli (bütçe + son birkaç büyük mesaj payı)
    expect(Math.max(...seenTokens)).toBeLessThan(12000 + 8 * 20_000 / 3.5);
    expect(seenTokens[seenTokens.length - 1]).toBeLessThan(seenTokens.reduce((a, b) => a + b, 0));
  });

  // ─── Test 3: Görev unutma kurtarma sınırına ulaşılması ──────────────────────
  it('3. Kurtarma sınırına (3 deneme) ulaşıldığında turu INTERRUPTED olarak durdurur ve raporlar', async () => {
    let callCount = 0;

    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async () => {
      callCount++;
      return {
        text: 'Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]',
        toolCalls: [],
        rawAssistantMsg: {
          role: 'assistant',
          content: 'Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]',
        },
        malformedToolCalls: 0,
        finishReason: 'stop',
      };
    });

    const result = await runAgent(
      'Kritik veritabanı analizini yap',
      dummyConfig,
      [{ role: 'user', content: 'Kritik veritabanı analizini yap' }],
    );

    // İlk deneme + 3 kurtarma denemesi = toplam 4 çağrı ve ardından durmalı
    expect(callCount).toBe(4);
    const activeTask = getActiveTask();
    expect(activeTask?.taskState).toBe('INTERRUPTED');
    expect(result.response).toContain('Göreviniz kayıtlı');
    expect(result.response).not.toContain('[STATUS: BLOCKED]');
    expect(result.response).not.toContain('Ne yapmamı istersiniz');
  });

  // ─── Test 4: COMPLETE sonrasında eski görevin hatırlanması ───────────────────
  it('4. COMPLETE sonrasında konuşma geçmişi silinmez ve sonraki sorguda hatırlanır', async () => {
    // 1. Adım: A görevi verilir ve COMPLETE olur
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockResolvedValueOnce({
      text: 'ARC-AGI-2 Task 001 ve 002 çözüldü. [STATUS: COMPLETE]',
      toolCalls: [],
      rawAssistantMsg: { role: 'assistant', content: 'ARC-AGI-2 Task 001 ve 002 çözüldü. [STATUS: COMPLETE]' },
      malformedToolCalls: 0,
      finishReason: 'stop',
    });

    const userMsg1: aiService.Message = { role: 'user', content: 'ARC-AGI-2 testlerini çalıştır' };
    await appendMessage(userMsg1);

    await runAgent('ARC-AGI-2 testlerini çalıştır', dummyConfig, [userMsg1], undefined, undefined, async (msg) => {
      await appendMessage(msg);
    });

    const activeTaskAfterComplete = getActiveTask();
    expect(activeTaskAfterComplete?.taskState).toBe('COMPLETE');

    // 2. Adım: Konuşma geçmişinin korunduğunu doğrula
    const messages = getSessionMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].content).toBe('ARC-AGI-2 testlerini çalıştır');
    expect(messages[messages.length - 1].content).toContain('ARC-AGI-2 Task 001 ve 002 çözüldü');

    // 3. Adım: Kullanıcı B sorusunu sorar ("Az önceki sonuçları incele")
    const ctx = buildContextMessages('Az önceki sonuçları tekrar incele');
    const hasPreviousResult = ctx.some(m => m.content?.includes('ARC-AGI-2 Task 001 ve 002 çözüldü'));
    expect(hasPreviousResult).toBe(true);
  });

  // ─── Test 5: Final asistan mesajının tam olarak bir kere kaydedilmesi ────────
  it('5. Final asistan mesajı onMessage ve messages dizisine tam olarak BİR kere kaydedilir', async () => {
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockResolvedValueOnce({
      text: 'Final analiz raporu hazır. [STATUS: COMPLETE]',
      toolCalls: [],
      rawAssistantMsg: { role: 'assistant', content: 'Final analiz raporu hazır. [STATUS: COMPLETE]' },
      malformedToolCalls: 0,
      finishReason: 'stop',
    });

    const receivedMessages: aiService.Message[] = [];
    const userMsg: aiService.Message = { role: 'user', content: 'Analiz yap' };

    const result = await runAgent('Analiz yap', dummyConfig, [userMsg], undefined, undefined, (msg) => {
      receivedMessages.push(msg);
    });

    // onMessage'a gelen asistan mesajları
    const onMessageAssistants = receivedMessages.filter(m => m.role === 'assistant');
    expect(onMessageAssistants.length).toBe(1);
    expect(onMessageAssistants[0].content).toBe('Final analiz raporu hazır. [STATUS: COMPLETE]');

    // result.messages içindeki asistan mesajları
    const resultAssistants = result.messages.filter(m => m.role === 'assistant');
    expect(resultAssistants.length).toBe(1);
    expect(resultAssistants[0].content).toBe('Final analiz raporu hazır. [STATUS: COMPLETE]');
  });

  // ─── Test 6: Context compression sırasında aktif görevin korunması ──────────
  it('6. Context compression sırasında aktif görev bilgisi kaybolmaz ve sticky context içinde korunur', async () => {
    setActiveTask('ARC-AGI-2 kompleks problem çözümü', 'Adım 3: Matris dönüştürme');

    // 25 mesaj ekle
    for (let i = 0; i < 25; i++) {
      await appendMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Mesaj ${i}` });
    }

    const mockSummarizer = vi.fn().mockResolvedValue('Eski mesajlar özetlendi: Matris adımları denendi.');
    const compressed = await summarizeOld(mockSummarizer, 10);
    expect(compressed).toBe(true);

    const stats = getSessionStats();
    expect(stats.summary).toContain('[STICKY CONTEXT]');
    expect(stats.summary).toContain('ARC-AGI-2 kompleks problem çözümü');
    expect(stats.summary).toContain('Adım 3: Matris dönüştürme');

    const activeTask = getActiveTask();
    expect(activeTask).toBeDefined();
    expect(activeTask?.taskState).toBe('ACTIVE');
  });

  // ─── Test 7: CLI yeniden başlatıldığında oturumun geri yüklenmesi ───────────
  it('7. CLI yeniden başlatıldığında (loadSession) önceki oturum ve aktif görev geri yüklenir', async () => {
    setActiveTask('Kalıcı görev testi', 'Hedef 1');
    await appendMessage({ role: 'user', content: 'İlk kullanıcı mesajı' });
    await appendMessage({ role: 'assistant', content: 'İlk asistan cevabı' });

    // Bellekteki state'i geçici olarak sıfırla (CLI kapanış simülasyonu)
    const savedMessagesBefore = getSessionMessages();
    expect(savedMessagesBefore.length).toBe(2);

    // Yeni CLI oturumu açılışı: loadSession çağrılır
    await loadSession();

    const restoredMessages = getSessionMessages();
    expect(restoredMessages.length).toBe(2);
    expect(restoredMessages[0].content).toBe('İlk kullanıcı mesajı');
    expect(restoredMessages[1].content).toBe('İlk asistan cevabı');

    const restoredTask = getActiveTask();
    expect(restoredTask?.originalUserRequest).toBe('Kalıcı görev testi');
    expect(restoredTask?.taskState).toBe('ACTIVE');
  });

  // ─── Test 8: Tool-call ID eşleşmelerinin bozulmaması ─────────────────────────
  it('8. sanitizeHistoryForOpenAI tool-call ID eşleşmelerini korur ve yetim tool call bırakmaz', () => {
    const rawMessages: aiService.Message[] = [
      { role: 'user', content: 'Dosyayı oku' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_123', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }],
      },
      {
        role: 'tool',
        content: 'dosya içeriği',
        tool_call_id: 'call_123',
      },
      {
        role: 'assistant',
        content: 'Okudum.',
      },
      // Eşleşmemiş (orphan) tool sonucu:
      {
        role: 'tool',
        content: 'yetim sonuç',
        tool_call_id: 'call_orphan',
      },
    ];

    const sanitized = aiService.sanitizeHistoryForOpenAI(rawMessages);

    // call_123 eşleşmesi korunmalı
    const assistantWithTools = sanitized.find(m => m.tool_calls && m.tool_calls.length > 0);
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools?.tool_calls?.[0].id).toBe('call_123');

    const toolResult = sanitized.find(m => m.role === 'tool');
    expect(toolResult).toBeDefined();
    expect(toolResult?.tool_call_id).toBe('call_123');

    // Yetim tool sonucu çıkarılmalı (OpenAI API 400 hatasını önlemek için)
    const orphanResult = sanitized.find(m => m.tool_call_id === 'call_orphan');
    expect(orphanResult).toBeUndefined();
  });

  // ─── Test 9: /new ve /clear komutlarının davranışı ───────────────────────────
  it('9. /new ve /clear komutları (resetSession) oturumu ve aktif görevi temizler', async () => {
    setActiveTask('Silinecek görev');
    await appendMessage({ role: 'user', content: 'Silinecek mesaj' });

    expect(getSessionMessages().length).toBe(1);
    expect(getActiveTask()).not.toBeNull();

    await resetSession(process.cwd());

    expect(getSessionMessages().length).toBe(0);
    expect(getActiveTask()).toBeNull();
    const stats = getSessionStats();
    expect(stats.conversationLifecycle).toBe('EXPLICITLY CLEARED');
  });

  // ─── Test 10: Genuine BLOCKED case (Gerçek engellenme durumu) ────────────────
  it('10. Gerçek bir BLOCKED durumunda (örn. yetki hatası) context-loss kurtarması tetiklenmez ve kullanıcıya raporlanır', async () => {
    let callCount = 0;

    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async () => {
      callCount++;
      return {
        text: 'Erişim yetkisi reddedildi: /etc/hosts dosyasına yazma yetkisi yok. [STATUS: BLOCKED]',
        toolCalls: [],
        rawAssistantMsg: {
          role: 'assistant',
          content: 'Erişim yetkisi reddedildi: /etc/hosts dosyasına yazma yetkisi yok. [STATUS: BLOCKED]',
        },
        malformedToolCalls: 0,
        finishReason: 'stop',
      };
    });

    const result = await runAgent(
      'Hosts dosyasını güncelle',
      dummyConfig,
      [{ role: 'user', content: 'Hosts dosyasını güncelle' }],
    );

    // Gerçek BLOCKED durumunda kurtarma döngüsüne girilmemeli, tam 1 çağrı olmalı
    expect(callCount).toBe(1);
    expect(result.response).toContain('Erişim yetkisi reddedildi');
    const task = getActiveTask();
    expect(task?.taskState).toBe('BLOCKED');
  });

  // ─── Test 11: Eski görev ACTIVE iken yeni bir istek gelmesi ──────────────────
  it('11. Eski bir görev ACTIVE iken kullanıcı bağımsız yeni bir istek gönderdiğinde DEHA yeni göreve geçer', async () => {
    // 1. Önceki görev başlatılır ve ACTIVE kalır
    setActiveTask('Eski Görev: Python veri analizi');
    const taskBefore = getActiveTask();
    expect(taskBefore?.originalUserRequest).toBe('Eski Görev: Python veri analizi');
    expect(taskBefore?.taskState).toBe('ACTIVE');

    // 2. Kullanıcı tamamen yeni bir istek gönderir
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockResolvedValueOnce({
      text: 'Next.js blog projesi oluşturuldu. [STATUS: COMPLETE]',
      toolCalls: [],
      rawAssistantMsg: { role: 'assistant', content: 'Next.js blog projesi oluşturuldu. [STATUS: COMPLETE]' },
      malformedToolCalls: 0,
      finishReason: 'stop',
    });

    await runAgent(
      'Next.js ile blog sitesi kur',
      dummyConfig,
      [{ role: 'user', content: 'Next.js ile blog sitesi kur' }],
    );

    // DEHA eski göreve hapsolmamalı, yeni görevi aktif yapmalı
    const currentTask = getActiveTask();
    expect(currentTask?.originalUserRequest).toBe('Next.js ile blog sitesi kur');
  });

  // ─── Test 12: Quoted greeting text false recovery üretmemeli ─────────────────
  it('12. Kullanıcı karşılama metnini çevirmesini istediğinde isContextLossGreeting false döner ve döngüye girmez', async () => {
    const userPrompt = 'Translate this greeting to English: "Merhaba! Ben DEHA, nasıl yardımcı olabilirim?"';
    const assistantOutput = '"Merhaba! Ben DEHA, nasıl yardımcı olabilirim?" is translated as "Hello! I am DEHA, how can I help you?"';

    // isContextLossGreeting false dönmeli çünkü kullanıcı bizzat bunu istedi
    const isLoss = isContextLossGreeting(assistantOutput, { userMessage: userPrompt });
    expect(isLoss).toBe(false);

    let callCount = 0;
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async () => {
      callCount++;
      return {
        text: assistantOutput,
        toolCalls: [],
        rawAssistantMsg: { role: 'assistant', content: assistantOutput },
        malformedToolCalls: 0,
        finishReason: 'stop',
      };
    });

    const result = await runAgent(
      userPrompt,
      dummyConfig,
      [{ role: 'user', content: userPrompt }],
    );

    // Yanlış kurtarma döngüsüne girmeden tek seferde tamamlanmalı
    expect(callCount).toBe(1);
    expect(result.response).toContain('Hello! I am DEHA');
  });

  // ─── Test 13: Farklı çalışma dizinleri (Multiple working directories) ────────
  it('13. Farklı çalışma dizinlerindeki oturumlar ve aktif görevler birbirine karışmaz', async () => {
    const projectADir = path.resolve('C:/test-projects/project-alpha');
    const projectBDir = path.resolve('C:/test-projects/project-beta');

    // Project A oturumu
    await resetSession(projectADir);
    setActiveTask('Project Alpha Görevi');
    await appendMessage({ role: 'user', content: 'Alpha mesajı' });

    const statsA = getSessionStats();
    expect(statsA.activeTask?.originalUserRequest).toBe('Project Alpha Görevi');
    expect(statsA.workDir).toBe(projectADir);

    // Project B oturumu
    await resetSession(projectBDir);
    setActiveTask('Project Beta Görevi');
    await appendMessage({ role: 'user', content: 'Beta mesajı' });

    const statsB = getSessionStats();
    expect(statsB.activeTask?.originalUserRequest).toBe('Project Beta Görevi');
    expect(statsB.workDir).toBe(projectBDir);

    // Project A ve B farklı Redis key ve buffer yollarına sahiptir
    const { getProjectRedisKey, getSessionBufferFile } = await import('../services/session-memory');
    expect(getProjectRedisKey(projectADir)).not.toBe(getProjectRedisKey(projectBDir));
    expect(getSessionBufferFile(projectADir)).not.toBe(getSessionBufferFile(projectBDir));
  });

  // ─── Test 14: Çoklu eşzamanlı CLI oturumları (Concurrent sessions) ───────────
  it('14. Çoklu eşzamanlı CLI oturumları bağımsız session ID ile izole kalır', async () => {
    const stats = getSessionStats();
    expect(stats.conversationLifecycle).toBeDefined();

    const { getProjectDirectoryKey } = await import('../services/session-memory');
    const key1 = getProjectDirectoryKey('C:/repo1');
    const key2 = getProjectDirectoryKey('C:/repo2');
    expect(key1).not.toBe(key2);
  });

  // ─── Test 15: Claude Agent Yolu (runAgentClaude) ────────────────────────────
  it('15. Claude agent yolunda context-loss tespiti ve final asistan mesajı kalıcılığı çalışır', async () => {
    const claudeConfig = getConfig({ provider: 'claude', anthropicApiKey: 'sk-ant-test-key' });
    let callCount = 0;

    vi.spyOn(aiService, 'sendWithTools').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          text: 'Merhaba! Ben DEHA. Henüz bir görev tanımı yapılmadı. Ne yapmamı istersiniz? [STATUS: BLOCKED]',
          toolCalls: [],
          stopReason: 'stop',
        };
      }
      return {
        text: 'Claude ile analiz tamamlandı. [STATUS: COMPLETE]',
        toolCalls: [],
        stopReason: 'stop',
      };
    });

    const recorded: aiService.Message[] = [];
    const result = await runAgent(
      'Kritik Claude analizi',
      claudeConfig,
      [{ role: 'user', content: 'Kritik Claude analizi' }],
      undefined,
      undefined,
      (msg) => { recorded.push(msg); },
    );

    // Context loss algılanıp kurtarıldığı için 2 çağrı olmalı
    expect(callCount).toBe(2);
    expect(result.response).toContain('Claude ile analiz tamamlandı');

    // Final asistan mesajı kaydedilmiş olmalı
    const finalAsst = recorded.filter(m => m.role === 'assistant');
    expect(finalAsst.length).toBeGreaterThanOrEqual(1);
    expect(finalAsst[finalAsst.length - 1].content).toContain('Claude ile analiz tamamlandı');
  });

  // ─── Test 16: Tool-call ID'leri persistence ve compression sonrasında korunur ──
  it('16. Tool-call ID eşleşmeleri session buffer yazımı ve özetleme sonrasında korunur', async () => {
    const toolCallMsg: aiService.Message = {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc_999', type: 'function', function: { name: 'run_shell', arguments: '{"command":"ls"}' } }],
    };
    const toolResultMsg: aiService.Message = {
      role: 'tool',
      content: 'file1.ts\nfile2.ts',
      tool_call_id: 'tc_999',
    };

    await appendMessage(toolCallMsg);
    await appendMessage(toolResultMsg);

    const msgs = getSessionMessages();
    expect(msgs.find(m => m.tool_call_id === 'tc_999')).toBeDefined();

    const sanitized = aiService.sanitizeHistoryForOpenAI(msgs);
    const validToolResult = sanitized.find(m => m.role === 'tool' && m.tool_call_id === 'tc_999');
    expect(validToolResult).toBeDefined();
  });

  // ─── Test 17: Tamamlanan görevi takip eden soru context'i korur ──────────────
  it('17. COMPLETE sonrasında "hangi dosyaları değiştirdin?" gibi bir soru eski görevi ve çıktıyı korur', async () => {
    setActiveTask('Test görevi', 'Hedef');
    updateActiveTask({ lastMeaningfulToolResult: '[edit_file]: src/index.ts güncellendi' });
    completeActiveTask();

    const task = getActiveTask();
    expect(task?.taskState).toBe('COMPLETE');

    // Kullanıcı takip sorusu sorar
    const followUp = 'Hangi dosyaları değiştirdin ve hangi testler geçti?';
    const { resolveTaskForUserMessage, isFollowUpOrInspection } = await import('../commands/agent');

    expect(isFollowUpOrInspection(followUp)).toBe(true);

    const resolved = resolveTaskForUserMessage(followUp);
    expect(resolved.originalUserRequest).toBe('Test görevi');
    expect(resolved.currentObjective).toBe(followUp);
    expect(resolved.taskState).toBe('ACTIVE');
  });
});
