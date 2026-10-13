import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runAgent, isContextLossGreeting } from '../commands/agent';
import * as aiService from '../services/ai-service';
import * as tools from '../tools';
import {
  setActiveTask,
  getActiveTask,
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

  // ─── Test 3: BLOCKED kurtarma sınırına ulaşılması ────────────────────────────
  it('3. BLOCKED kurtarma sınırına (3 deneme) ulaşıldığında sonsuz döngüye girmeden durur ve raporlar', async () => {
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
    expect(activeTask?.taskState).toBe('BLOCKED');
    expect(result.response).toBeTruthy();
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
});
