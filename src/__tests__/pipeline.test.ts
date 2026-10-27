import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConfig, DehaConfig } from '../config';
import * as ai from '../services/ai-service';
import { runPipeline } from '../pipeline/orchestrator';
import { runJudge } from '../pipeline/judge';
import { applyCoderOutput } from '../pipeline/apply-output';
import { configForRole } from '../pipeline/role-config';
import { resetSession, getActiveTask } from '../services/session-memory';
import { logger } from '../services/logger';

vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return null; } async set() {} async del() {} async quit() {}
} }));

let dir: string;
let config: DehaConfig;
const pass = 'VERDICT: PASS\nSCORE: 9/10\n## REQUIRED FIXES\nNone';
const create = (file: string, code: string) => '```js\n// FILE: ' + file + '\n' + code + '\n```';
const edit = (file: string, old: string, code: string) => `EDIT: ${file}\n<<<OLD>>>\n${old}\n<<<NEW>>>\n${code}\n<<<END>>>`;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-pipeline-'));
  await resetSession(dir);
  config = getConfig({ provider: 'custom', customModel: 'chat-model', maxContextTokens: 64000 });
  for (const name of ['planner', 'coder', 'judge'] as const) {
    config.pipeline[name] = { provider: 'custom', model: name + '-model', apiKey: name + '-key', apiUrl: 'http://127.0.0.1:1/' + name };
  }
  config.pipeline.maxIterations = 2;
  vi.spyOn(logger, 'write').mockImplementation(() => {});
  vi.spyOn(logger, 'raw').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue({
    text: 'Implement the complete change [STATUS: COMPLETE]', toolCalls: [],
    rawAssistantMsg: { role: 'assistant', content: 'Implement the complete change [STATUS: COMPLETE]' },
    malformedToolCalls: 0, finishReason: 'stop',
  });
});
afterEach(() => vi.restoreAllMocks());

describe('Planner -> Coder -> Judge pipeline', () => {
  it('runs all roles, rejects an unapplied PASS, retries with disk evidence, and preserves chat context', async () => {
    fs.writeFileSync(path.join(dir, 'existing.js'), 'old\n');
    let coderCalls = 0;
    const roleCalls = vi.spyOn(ai, 'callRole').mockImplementation(async (role, _cfg, messages, _prompt, _chunk, label) => {
      expect(JSON.stringify(messages)).toContain('keep public API unchanged');
      expect(getActiveTask()?.taskState).toBe('ACTIVE'); // Planner COMPLETE is only stage completion.
      if (label === 'coder') {
        coderCalls++;
        if (coderCalls === 2) {
          expect(messages.at(-1)?.content).toContain('HATA:');
          expect(messages.at(-1)?.content).toContain('old\n');
        }
        return edit('existing.js', coderCalls === 1 ? 'does not exist' : 'old', 'new');
      }
      expect(role.model).toBe('judge-model');
      expect(messages.at(-1)?.content).toContain('APPLICATION RESULTS AND CURRENT FILES');
      return pass;
    });
    const result = await runPipeline('Fix existing file', config, [{ role: 'user', content: 'keep public API unchanged' }]);
    expect(result.verdict.pass).toBe(true);
    expect(result.iterations).toBe(2);
    expect(fs.readFileSync(path.join(dir, 'existing.js'), 'utf8')).toBe('new\n');
    expect(roleCalls.mock.calls.map(c => c[5])).toEqual(['coder', 'judge', 'coder', 'judge']);
    const plannerConfig = vi.mocked(ai.sendWithToolsOpenAICompat).mock.calls[0][1];
    expect(plannerConfig.roleOverride).toBe(config.pipeline.planner);
    expect(plannerConfig.customModel).toBe('planner-model');
    expect(getActiveTask()).toMatchObject({ originalUserRequest: 'Fix existing file', taskState: 'COMPLETE' });
    expect(config.customModel).toBe('chat-model');
  });

  it('reviews earlier iteration files as well as the current output', async () => {
    let coder = 0, judge = 0;
    vi.spyOn(ai, 'callRole').mockImplementation(async (_role, _cfg, messages, _prompt, _chunk, label) => {
      if (label === 'coder') return ++coder === 1 ? create('first.js', 'first') : create('second.js', 'second');
      if (++judge === 1) return 'VERDICT: FAIL\nSCORE: 5/10\n## REQUIRED FIXES\nAdd second.js';
      const review = messages.at(-1)?.content || '';
      expect(review).toContain('first.js'); expect(review).toContain('second.js');
      return pass;
    });
    const result = await runPipeline('Create two files', config);
    expect(result.verdict.pass).toBe(true);
    expect(result.finalCode).toContain('first.js'); expect(result.finalCode).toContain('second.js');
  });

  it.each(['No code was produced', create('existing.js', 'replacement')])('cannot pass when output is not applicable: %s', async output => {
    config.pipeline.maxIterations = 1;
    fs.writeFileSync(path.join(dir, 'existing.js'), 'keep this');
    vi.spyOn(ai, 'callRole').mockImplementation(async (_role, _cfg, _m, _p, _c, label) => label === 'coder' ? output : pass);
    const result = await runPipeline('Fix existing file', config);
    expect(result.verdict.pass).toBe(false);
    expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
    expect(fs.readFileSync(path.join(dir, 'existing.js'), 'utf8')).toBe('keep this');
  });

  it('cancels between Coder and file application without writing or calling Judge', async () => {
    const controller = new AbortController();
    const roles = vi.spyOn(ai, 'callRole').mockImplementation(async (...args) => {
      expect(args[7]).toBe(controller.signal);
      controller.abort(); return create('cancelled.js', 'must not write');
    });
    await expect(runPipeline('Create a file', config, [], controller.signal)).rejects.toBeDefined();
    expect(roles).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir, 'cancelled.js'))).toBe(false);
    expect(getActiveTask()?.taskState).toBe('CANCELLED');
  });

  it('rejects paths and junctions that escape the active project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-pipeline-outside-'));
    fs.symlinkSync(outside, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const results = await applyCoderOutput(create('../escape.js', 'no') + '\n' + create('linked/escape.js', 'no'), dir, config);
    expect(results.every(r => !r.success)).toBe(true);
    expect(fs.existsSync(path.join(outside, 'escape.js'))).toBe(false);
  });

  it.each(['PASS', 'Example VERDICT: PASS\nSCORE: 9/10', 'VERDICT: PASS\nSCORE: 2/10', 'VERDICT: PASS\nSCORE: 20/10'])('rejects malformed or below-threshold Judge output: %s', async output => {
    vi.spyOn(ai, 'callRole').mockResolvedValue(output);
    expect((await runJudge('task', 'plan', 'code', config)).pass).toBe(false);
  });

  it('maps specialized roles without mutating chat model or credentials', () => {
    const role = { provider: 'claude' as const, model: 'role-claude', apiKey: 'role-key' };
    const mapped = configForRole(config, role);
    expect(mapped).toMatchObject({ provider: 'claude', claudeModel: 'role-claude', anthropicApiKey: 'role-key', roleOverride: role });
    expect(config.provider).toBe('custom'); expect(config.customModel).toBe('chat-model');
    expect(config.roleOverride).toBeUndefined();
  });
});
