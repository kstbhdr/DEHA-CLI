import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path';
import { getActiveTask, loadSession, resetSession, setActiveTask } from '../services/session-memory';
import { ImplementationGuard, createImplementationGuard, discoveryBudget, requiresImplementation } from '../services/implementation-guard';
import { runAgent } from '../commands/agent';
import * as ai from '../services/ai-service';
import * as tools from '../tools';
import { getConfig } from '../config';

vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return null; } async set() {} async del() {} async quit() {}
} }));
let dir: string;
beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-implement-')); await resetSession(dir);
  setActiveTask('Implement a real benchmark backend');
});

describe('Runtime implementation phase', () => {
  it('extracts an explicit pre-implementation tool budget without treating ordinary numbers as limits', () => {
    expect(discoveryBudget('Do not spend more than 10 additional tool calls before creating actual benchmark implementation files.')).toBe(10);
    expect(discoveryBudget('Run 20 actions and 476 tests.')).toBe(12);
    expect(requiresImplementation('Explain how the backend works')).toBe(false);
    expect(requiresImplementation('Implement the benchmark backend')).toBe(true);
    expect(requiresImplementation('Analysis only; no code changes')).toBe(false);
  });
  it('blocks broad discovery once exhausted, while allowing bounded specific pre-edit reads', () => {
    const gate = new ImplementationGuard(2);
    expect(gate.before('list_dir', { path: dir, recursive: true })).toBeUndefined();
    expect(gate.before('read_file', { path: 'source.py' })).toBeUndefined();
    expect(gate.before('list_dir', { path: dir })).toContain('[DISCOVERY LIMIT]');
    expect(gate.before('run_shell', { command: 'find . -name "*.py"' })).toContain('[DISCOVERY LIMIT]');
    const read = { path: 'source.py', start_line: 10, end_line: 30, purpose: 'Inspect the exact method before implementing its adapter' };
    expect(gate.before('read_file', read)).toBeUndefined();
    expect(gate.before('read_file', read)).toBeUndefined();
    expect(gate.before('read_file', read)).toContain('[DISCOVERY LIMIT]');
    expect(gate.before('run_shell', { command: 'python -m pytest tests -q' })).toBeUndefined();
    expect(gate.before('write_file', { path: 'backend.py', content: 'code' })).toBeUndefined();
  });
  it('notes/plan rewrites do not unlock discovery; successful code edits allow targeted reads', () => {
    const gate = new ImplementationGuard(1); gate.before('read_file', { path: 'source.py' });
    gate.after('write_file', { path: 'WORKING_NOTES.md' }, 'Dosya yazıldı');
    expect(gate.before('brain', { action: 'set_plan', steps: ['Read again'] })).toContain('[DISCOVERY LIMIT]');
    gate.after('write_file', { path: 'backend.py' }, 'HATA: permission denied');
    expect(getActiveTask()?.implementation?.changedFiles).toEqual([]);
    gate.after('write_file', { path: 'backend.py' }, 'Dosya yazıldı');
    expect(getActiveTask()?.implementation?.changedFiles).toEqual(['backend.py']);
    expect(getActiveTask()?.implementation?.focusedReads).toBe(2);
    expect(gate.before('list_dir', { path: dir })).toContain('[DISCOVERY LIMIT]');
  });
  it('preserves the phase and budget through a disk reload', async () => {
    const gate = new ImplementationGuard(1); gate.before('read_file', { path: 'source.py' });
    await loadSession(dir);
    const resumed = createImplementationGuard('devam et')!;
    expect(resumed.before('list_dir', { path: dir })).toContain('[DISCOVERY LIMIT]');
    vi.stubEnv('DEHA_IMPLEMENTATION_GUARD', '0'); expect(createImplementationGuard('devam et')).toBeUndefined();
  });
  for (const provider of ['deepseek', 'claude'] as const) {
    it(`${provider}: executes only the exploration budget and stops an uncooperative model without success`, async () => {
      vi.stubEnv('DEHA_DISCOVERY_CALLS', '2');
      const executed = vi.spyOn(tools, 'executeTool').mockReturnValue('Existing code, unchanged');
      let count = 0;
      const send = vi.spyOn(ai, provider === 'claude' ? 'sendWithTools' : 'sendWithToolsOpenAICompat').mockImplementation(async () => {
        const id = `read-${++count}`;
        return { text: '', toolCalls: [{ id, name: 'read_file', input: { path: 'source.py' } }],
          rawAssistantMsg: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{"path":"source.py"}' } }] },
          malformedToolCalls: 0, finishReason: 'tool_calls', stopReason: 'tool_use' };
      });
      const result = await runAgent('Implement a benchmark backend now', getConfig({ provider, maxToolRounds: 200 }), [], undefined, undefined, undefined, { sectioned: true });
      expect(executed).toHaveBeenCalledTimes(2); expect(send).toHaveBeenCalledTimes(8);
      expect(result.response).toContain('Görev tamamlanmadı'); expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
    });
  }
  it('executes real code creation and a shell verification after denied discovery', async () => {
    vi.stubEnv('DEHA_DISCOVERY_CALLS', '1');
    fs.writeFileSync(path.join(dir, 'existing.py'), 'def cognition_hook(): pass');
    const calls = [
      ['read_file', { path: 'existing.py' }],
      ['list_dir', { path: '.', recursive: true }],
      ['write_file', { path: 'backend.cjs', content: 'console.log("BACKEND_IMPLEMENTED_OK")' }],
      ['run_shell', { command: `"${process.execPath}" backend.cjs`, cwd: dir }],
    ] as const;
    let count = 0;
    vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockImplementation(async messages => {
      if (count === calls.length) {
        expect(JSON.stringify(messages)).toContain('BACKEND_IMPLEMENTED_OK');
        return { text: 'Backend verified [STATUS: COMPLETE]', toolCalls: [], rawAssistantMsg: { role: 'assistant', content: 'Backend verified [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop' };
      }
      const [name, input] = calls[count++]; const id = `tool-${count}`;
      return { text: '', toolCalls: [{ id, name, input }], rawAssistantMsg: { role: 'assistant', content: null,
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }, malformedToolCalls: 0, finishReason: 'tool_calls' };
    });
    const result = await runAgent('Implement a real benchmark backend', getConfig({ provider: 'deepseek' }), [], undefined, undefined, undefined, { sectioned: true });
    expect(fs.readFileSync(path.join(dir, 'backend.cjs'), 'utf8')).toContain('BACKEND_IMPLEMENTED_OK');
    expect(result.response).toContain('verified'); expect(getActiveTask()?.implementation?.changedFiles).toEqual(['backend.cjs']);
  });
});
