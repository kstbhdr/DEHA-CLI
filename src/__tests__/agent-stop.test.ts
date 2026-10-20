import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ai from '../services/ai-service';
import * as tools from '../tools';
import { runAgent } from '../commands/agent';
import { getConfig } from '../config';
import { logger } from '../services/logger';
import { getActiveTask, resetSession, getWorkspaceContextRaw, setWorkspaceContextRaw } from '../services/session-memory';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-stop-'));
afterEach(() => { vi.restoreAllMocks(); });

describe('Agent tamamlanmamış işi başarı olarak sunmaz', () => {
  it.each(['deepseek', 'claude'] as const)('%s boş son yanıtta görevi interrupted olarak korur', async provider => {
    await resetSession(dir); setWorkspaceContextRaw({ note: 'E18 henüz tamamlanmadı' });
    let calls = 0;
    const respond = async () => {
      const first = ++calls === 1;
      return { text: '', toolCalls: first ? [{ id: 'e18', name: 'run_shell', input: { command: 'echo probe' } }] : [],
        rawAssistantMsg: first ? { role: 'assistant', content: '', tool_calls: [{ id: 'e18', type: 'function', function: { name: 'run_shell', arguments: '{"command":"echo probe"}' } }] } : { role: 'assistant', content: '' },
        malformedToolCalls: 0, finishReason: first ? 'tool_calls' : 'stop', stopReason: first ? 'tool_use' : 'end_turn' };
    };
    vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockImplementation(respond);
    vi.spyOn(ai, 'sendWithTools').mockImplementation(respond);
    vi.spyOn(tools, 'executeTool').mockReturnValue('SUMMARY with_fit=0');
    const result = await runAgent('ARC araştırmasını bitirmeden durma', getConfig({ provider, maxToolRounds: 3 }), []);
    expect(result.response).toContain('tamamlandığı doğrulanmadı');
    expect(result.response).not.toContain('Agent araştırmayı tamamladı');
    expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
    expect(getWorkspaceContextRaw()).toEqual({ note: 'E18 henüz tamamlanmadı' });
  });
  it.each(['deepseek', 'claude'] as const)('%s araç turu sınırına ulaşırsa eski düşünceyi final diye dönmez', async provider => {
    await resetSession(dir);
    const visible = vi.spyOn(logger, 'write');
    const response = { text: 'E18 ölçülüyor', toolCalls: [{ id: 'e18', name: 'run_shell', input: { command: 'echo probe' } }],
      rawAssistantMsg: { role: 'assistant', content: 'E18 ölçülüyor', tool_calls: [{ id: 'e18', type: 'function', function: { name: 'run_shell', arguments: '{"command":"echo probe"}' } }] },
      malformedToolCalls: 0, finishReason: 'tool_calls', stopReason: 'tool_use' };
    vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue(response);
    vi.spyOn(ai, 'sendWithTools').mockResolvedValue(response);
    vi.spyOn(tools, 'executeTool').mockReturnValue('SUMMARY with_fit=0');
    const result = await runAgent('ARC araştırmasını sürdür', getConfig({ provider, maxToolRounds: 1 }), []);
    expect(result.response).toContain('Araç turu sınırına');
    expect(result.response).not.toBe('E18 ölçülüyor');
    expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
    expect(visible).toHaveBeenCalledWith(expect.stringContaining('Araç turu sınırına'));
  });
});
