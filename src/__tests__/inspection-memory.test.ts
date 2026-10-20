import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path';
import { resetSession, loadSession } from '../services/session-memory';
import { getWorkspace } from '../services/sectioned-context/store';
import { recordInspection, renderInspections } from '../services/sectioned-context/inspections';
import { executeBrainTool } from '../services/sectioned-context/brain';
import { createTurnAssembler } from '../services/sectioned-context';
import { getConfig } from '../config';
import { runAgent } from '../commands/agent';
import * as ai from '../services/ai-service';
import * as tools from '../tools';

vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return null; } async set() {} async del() {} async quit() {}
} }));
let dir: string;
beforeEach(async () => { vi.restoreAllMocks(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-inspect-')); await resetSession(dir); });

describe('Inspection evidence across context trimming', () => {
  it('warns on the third unchanged result; genuine copy progress resets the count', () => {
    const ws = getWorkspace(); const input = { command: 'du -sb qwen_local' };
    expect(recordInspection(ws, 'run_shell', input, '18000000000 qwen_local', 1)).toBeUndefined();
    expect(recordInspection(ws, 'run_shell', input, '18000000000 qwen_local', 2)).toBeUndefined();
    expect(recordInspection(ws, 'run_shell', input, '18000000000 qwen_local', 3)).toContain('identical output 3 times');
    expect(recordInspection(ws, 'run_shell', input, '19000000000 qwen_local', 4)).toBeUndefined();
    expect(ws.inspections?.[0].repeats).toBe(1);
  });
  it('keeps separate file ranges and caps stored evidence and prompt size', () => {
    const ws = getWorkspace();
    for (let i = 0; i < 50; i++) recordInspection(ws, 'read_file', { path: 'source.py', start_line: i + 1 }, `def method_${i}():\n` + 'x'.repeat(2000), i);
    expect(ws.inspections).toHaveLength(40);
    expect(ws.inspections?.every(item => item.repeats === 1 && item.excerpt.length <= 600)).toBe(true);
    const prompt = renderInspections(ws, 100000);
    expect(prompt.length).toBeLessThanOrEqual(2000 * 3.5);
    expect(prompt).toContain('method_49');
  });
  it('preserves useful read evidence after raw tool rounds roll out and after restart', async () => {
    const cfg = getConfig({ provider: 'deepseek', maxContextTokens: 64000, toolMaxTokens: 4096 });
    const assembler = createTurnAssembler(cfg, [], 'openai');
    const source = '[source.py]\n1: class ModelLoader:\n2: def load_verified_model():\n' + 'body-detail\n'.repeat(2000);
    const turn: any[] = [{ role: 'assistant', content: 'Inspect source' }, { role: 'tool', content: source, tool_call_id: 'read' }];
    assembler.recordTool('read_file', { path: 'source.py' }, source, undefined, 1);
    for (let i = 0; i < 5; i++) {
      turn.push({ role: 'assistant', content: 'Independent work ' + i }, { role: 'tool', content: 'output'.repeat(10000), tool_call_id: 'other-' + i });
    }
    const built = assembler.build({ systemPrompt: 'test', userMessage: 'continue', history: [], turn });
    expect(built.stats.rolledOver).toBe(true);
    expect(built.stats.nativeStart).toBeGreaterThan(1);
    expect(JSON.stringify(built.messages)).toContain('load_verified_model');
    await loadSession(dir);
    const resumed = createTurnAssembler(cfg, [], 'openai').build({ systemPrompt: 'test', userMessage: 'continue', history: [], turn: [] });
    expect(JSON.stringify(resumed.messages)).toContain('load_verified_model');
  });
  it('set_plan and rewrite retain matching completed/doing steps instead of resetting them', () => {
    executeBrainTool({ action: 'set_plan', steps: ['Read docs', 'Write benchmark'] });
    executeBrainTool({ action: 'update_step', index: 1, status: 'done' });
    executeBrainTool({ action: 'update_step', index: 2, status: 'doing' });
    executeBrainTool({ action: 'set_plan', steps: ['Read docs', 'Write benchmark', 'Verify results'] });
    expect(getWorkspace().brain.steps.map(s => s.status)).toEqual(['done', 'doing', 'todo']);
    executeBrainTool({ action: 'rewrite', section: 'steps', items: ['Read docs', 'Write benchmark'] });
    expect(getWorkspace().brain.steps.map(s => s.status)).toEqual(['done', 'doing']);
    executeBrainTool({ action: 'set_plan', steps: ['Read docs - DONE', '[~] Write benchmark'] });
    expect(getWorkspace().brain.steps).toEqual([{ text: 'Read docs', status: 'done' }, { text: 'Write benchmark', status: 'doing' }]);
  });
  for (const provider of ['deepseek', 'claude'] as const) it(`${provider}: the real agent forwards the repetition warning to the next model request`, async () => {
    const read = vi.spyOn(tools, 'executeTool').mockReturnValue('[fixture.py]\n1: def verified_read():\n2: return 42');
    let calls = 0;
    const send = vi.spyOn(ai, provider === 'claude' ? 'sendWithTools' : 'sendWithToolsOpenAICompat').mockImplementation(async messages => {
      calls++;
      if (calls === 4) {
        expect(JSON.stringify(messages)).toContain('[DEHA UNCHANGED INSPECTION]');
        return { text: 'Done [STATUS: COMPLETE]', toolCalls: [], rawAssistantMsg: { role: 'assistant', content: 'Done [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop', stopReason: 'end_turn' };
      }
      const id = `inspect-${calls}`;
      return { text: '', toolCalls: [{ id, name: 'read_file', input: { path: 'fixture.py' } }],
        rawAssistantMsg: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{"path":"fixture.py"}' } }] }, malformedToolCalls: 0, finishReason: 'tool_calls', stopReason: 'tool_use' };
    });
    await runAgent('Inspect fixture once', getConfig({ provider }), [], undefined, undefined, undefined, { sectioned: true });
    expect(read).toHaveBeenCalledTimes(3); expect(send).toHaveBeenCalledTimes(4);
  });
});
