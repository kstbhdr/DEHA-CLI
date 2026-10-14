import { afterEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { runAgent, isContextLossGreeting } from '../commands/agent';
import * as ai from '../services/ai-service';
import { getConfig } from '../config';
import { getActiveTask, resetSession } from '../services/session-memory';

const greeting = `Merhaba! Ben DEHA, bu projede sana yardımcı olacak yapay zeka kodlama asistanıyım. 🚀

Çalışmaya başlamadan önce şunları yapacağım:
1. Önce projenin Second Brain mimari dokümantasyonunu (INDEX.md) kontrol edeceğim
2. İlgili alt dokümanları okuyacağım
3. Mevcut kodu inceleyip, mimariye uygun şekilde değişiklikleri yapacağım

**Bana hangi görevde yardımcı olabilirim?**

Örneğin:
- Yeni bir özellik eklemek (feature)
- Mevcut bir hatayı düzeltmek (bug fix)
- Kod refactoring / iyileştirme
- Test yazmak
- Dokümantasyon güncellemek

Lütfen yapmak istediğiniz işi detaylı şekilde anlatın. İlgili dosyaları ve mimariyi inceleyip plan hazırlayayım.

[STATUS: BLOCKED] — Görevi başlatmak için sizin talebinizi bekliyorum.`;
const task = 'Login hatasını incele ve düzelt';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-onboarding-'));

afterEach(async () => { vi.restoreAllMocks(); await resetSession(dir); });

describe('Uzun onboarding yanıtından kurtarma', () => {
  it('görev isteyen uzun yanıtı tanır, istenen karşılama metnini ve gerçek engeli korur', () => {
    expect(isContextLossGreeting(greeting, { userMessage: task })).toBe(true);
    expect(isContextLossGreeting(greeting, { userMessage: 'Bir karşılama metni yaz' })).toBe(false);
    expect(isContextLossGreeting('Erişim yetkisi reddedildi. '.repeat(30) + '[STATUS: BLOCKED]', { userMessage: task })).toBe(false);
  });

  it.each(['deepseek', 'claude'] as const)('%s yanlış BLOCKED yanıtından sonra asıl göreve devam eder', async (provider) => {
    await resetSession(dir);
    let calls = 0;
    const respond = async () => {
      const text = ++calls === 1 ? greeting : 'Login hatası düzeltildi. [STATUS: COMPLETE]';
      return { text, toolCalls: [], rawAssistantMsg: { role: 'assistant', content: text }, malformedToolCalls: 0, finishReason: 'stop', stopReason: 'end_turn' };
    };
    vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockImplementation(respond);
    vi.spyOn(ai, 'sendWithTools').mockImplementation(respond);
    const result = await runAgent(task, getConfig({ provider }), [{ role: 'user', content: task }]);
    expect(calls).toBe(2);
    expect(result.response).toContain('Login hatası düzeltildi');
    expect(getActiveTask()?.taskState).toBe('COMPLETE');
  });

  it.each(['deepseek', 'claude'] as const)('%s sürekli görev unutursa sahte BLOCKED yerine dürüst hata döner', async (provider) => {
    await resetSession(dir);
    const respond = vi.fn(async () => ({ text: greeting, toolCalls: [], rawAssistantMsg: { role: 'assistant', content: greeting }, malformedToolCalls: 0, finishReason: 'stop', stopReason: 'end_turn' }));
    vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockImplementation(respond);
    vi.spyOn(ai, 'sendWithTools').mockImplementation(respond);
    const result = await runAgent(task, getConfig({ provider }), [{ role: 'user', content: task }]);
    expect(respond).toHaveBeenCalledTimes(4);
    expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
    expect(result.response).toContain('Göreviniz kayıtlı');
    expect(result.response).not.toContain('STATUS: BLOCKED');
    expect(result.messages.at(-1)?.content).toBe(result.response);
  });
});
