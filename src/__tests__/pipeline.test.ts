import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConfig, DehaConfig } from '../config';
import * as ai from '../services/ai-service';
import { runPipeline, pipelineHistory } from '../pipeline/orchestrator';
import { loadLatestPlan, planPath } from '../pipeline/task-plan';
import { parsePipelineInput } from '../pipeline/options';
import { pipelineSetup, persistConfig } from '../commands/model-setup';
import inquirer from 'inquirer';
import { runJudge } from '../pipeline/judge';
import { applyCoderOutput } from '../pipeline/apply-output';
import { configForRole } from '../pipeline/role-config';
import { resetSession, getActiveTask } from '../services/session-memory';
import { logger } from '../services/logger';

vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return null; } async set() {} async del() {} async quit() {}
} }));
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));

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
  config.pipeline.coderMode = 'blocks';
  vi.spyOn(logger, 'write').mockImplementation(() => {});
  vi.spyOn(logger, 'raw').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue({
    text: 'Implement the complete change [STATUS: COMPLETE]', toolCalls: [],
    rawAssistantMsg: { role: 'assistant', content: 'Implement the complete change [STATUS: COMPLETE]' },
    malformedToolCalls: 0, finishReason: 'stop',
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Planner -> Coder -> Judge pipeline', () => {
  it('runs all roles, rejects an unapplied PASS, retries with disk evidence, and preserves chat context', async () => {
    fs.writeFileSync(path.join(dir, 'existing.js'), 'old\n');
    let coderCalls = 0;
    const roleCalls = vi.spyOn(ai, 'callRole').mockImplementation(async (role, _cfg, messages, _prompt, _chunk, label) => {
      expect(JSON.stringify(messages)).not.toContain('keep public API unchanged'); // Only Planner receives the bounded session transcript.
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
    expect(JSON.stringify(vi.mocked(ai.sendWithToolsOpenAICompat).mock.calls[0][0])).toContain('keep public API unchanged');
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

describe('Optional pipeline stages and persisted handoff', () => {
  it.each([[true, true], [true, false], [false, true], [false, false]])('Planner=%s Judge=%s calls only enabled roles', async (planner, judge) => {
    config.pipeline.plannerEnabled = planner; config.pipeline.judgeEnabled = judge;
    const calls = vi.spyOn(ai, 'callRole').mockImplementation(async (_r, _c, _m, _p, _chunk, label) => label === 'coder'
      ? create('optional.js', 'optional') + '\nSTEP_DONE: 1 | Created optional.js with the requested implementation'
      : pass);
    const result = await runPipeline('Create optional.js', config);
    expect(result.success).toBe(true);
    expect(result.judgeRan).toBe(judge);
    expect(result.verdict.pass).toBe(judge); // Skipping Judge must not fabricate a PASS.
    expect(vi.mocked(ai.sendWithToolsOpenAICompat).mock.calls.length).toBe(planner ? 1 : 0);
    expect(calls.mock.calls.filter(c => c[5] === 'judge')).toHaveLength(judge ? 1 : 0);
    expect(fs.existsSync(result.taskFile)).toBe(true);
    expect(loadLatestPlan(dir).steps.every(s => s.status === 'done')).toBe(true);
  });

  it('saves a plan without coding, then executes it with tools without calling Planner or Judge again', async () => {
    const planned = await runPipeline('Create a fixture', config, [], undefined, { planOnly: true });
    expect(planned.status).toBe('planned'); expect(planned.iterations).toBe(0);
    expect(fs.existsSync(planPath(loadLatestPlan(dir)))).toBe(true);
    expect(getActiveTask()?.taskState).toBe('ACTIVE');
    let round = 0;
    vi.mocked(ai.sendWithToolsOpenAICompat).mockImplementation(async (_messages, cfg, tools) => {
      expect(cfg.roleOverride?.model).toBe('coder-model');
      expect(tools.some(t => t.name === 'task_plan')).toBe(true);
      expect(tools.some(t => t.name === 'generate_image')).toBe(false);
      const toolCalls = ++round === 1 ? [
        { id: 'write', name: 'write_file', input: { path: 'agent.js', content: 'agent implementation' } },
        { id: 'step', name: 'task_plan', input: { action: 'update_step', index: 1, status: 'done', evidence: 'Created agent.js with the requested implementation.' } },
      ] : [];
      const text = toolCalls.length ? '' : 'Implemented [STATUS: COMPLETE]';
      return { text, toolCalls, rawAssistantMsg: { role: 'assistant', content: text, ...(toolCalls.length ? { tool_calls: toolCalls.map(t => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: JSON.stringify(t.input) } })) } : {}) }, malformedToolCalls: 0, finishReason: toolCalls.length ? 'tool_calls' : 'stop' };
    });
    const roleCalls = vi.spyOn(ai, 'callRole');
    const result = await runPipeline('', config, [], undefined, { useSavedPlan: true, coderMode: 'agent', judge: false });
    expect(result.status).toBe('applied'); expect(result.judgeRan).toBe(false);
    expect(roleCalls).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, 'agent.js'), 'utf8')).toBe('agent implementation');
    expect(fs.readFileSync(result.taskFile, 'utf8')).toContain('[x]');
    expect(result.taskFile).toBe(planned.taskFile);
    const requestCount = vi.mocked(ai.sendWithToolsOpenAICompat).mock.calls.length;
    const repeated = await runPipeline('', config, [], undefined, { useSavedPlan: true, coderMode: 'agent', judge: false });
    expect(repeated.iterations).toBe(0);
    expect(vi.mocked(ai.sendWithToolsOpenAICompat).mock.calls).toHaveLength(requestCount);
  });

  it('does not finish an agent task when the model leaves saved checklist steps open', async () => {
    config.pipeline.maxIterations = 1;
    let round = 0;
    vi.mocked(ai.sendWithToolsOpenAICompat).mockImplementation(async () => {
      const calls = ++round === 1 ? [{ id: 'w', name: 'write_file', input: { path: 'partial.js', content: 'partial' } }] : [];
      const text = calls.length ? '' : 'Done [STATUS: COMPLETE]';
      return { text, toolCalls: calls, rawAssistantMsg: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls.map(t => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: JSON.stringify(t.input) } })) } : {}) }, malformedToolCalls: 0, finishReason: calls.length ? 'tool_calls' : 'stop' };
    });
    const result = await runPipeline('Implement full task', config, [], undefined, { planner: false, judge: false, coderMode: 'agent' });
    expect(result.success).toBe(false); expect(result.judgeRan).toBe(false);
    expect(loadLatestPlan(dir).steps[0].status).toBe('todo');
    expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
  });

  it('bounds historical chat and parses only leading per-run flags', () => {
    expect(pipelineHistory([{ role: 'user', content: 'x'.repeat(10000) }], 10)).toHaveLength(35);
    expect(pipelineHistory([{ role: 'user', content: 'old' }], 0)).toBe('');
    expect(parsePipelineInput('--no-judge --coder-mode=agent Implement a flag --no-planner')).toEqual({ options: { judge: false, coderMode: 'agent' }, task: 'Implement a flag --no-planner' });
    expect(() => parsePipelineInput('--unknown task')).toThrow('Unknown pipeline option');
  });

  it('configures economy mode and the cheap Coder independently, without altering Chat', async () => {
    const save = vi.fn();
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ section: 'flow' }).mockResolvedValueOnce({ profile: 'economy' })
      .mockResolvedValueOnce({ section: 'coder' }).mockResolvedValueOnce({ provider: 'custom', model: 'qwen-9b', apiKey: 'local', apiUrl: 'http://localhost:1234/v1', maxTokens: 2048, maxToolRounds: 30, maxContextTokens: 32768 })
      .mockResolvedValueOnce({ section: 'done' });
    await pipelineSetup(config, save);
    expect(config.pipeline).toMatchObject({ plannerEnabled: true, judgeEnabled: false, coderMode: 'agent' });
    expect(config.pipeline.coder).toMatchObject({ model: 'qwen-9b', maxTokens: 2048, maxToolRounds: 30 });
    expect(config.customModel).toBe('chat-model');
    expect(save).toHaveBeenCalled();
    expect(configForRole(config, config.pipeline.coder).maxContextTokens).toBe(32768);
    const envFile = path.join(dir, 'settings.env');
    persistConfig(config, envFile);
    const written = fs.readFileSync(envFile, 'utf8');
    expect(written).toContain('PIPELINE_JUDGE_ENABLED=0');
    expect(written).toContain('PIPELINE_CODER_MODE=agent');
    expect(written).toContain('CODER_MAX_CONTEXT_TOKENS=32768');
    expect(written).toContain('CODER_MAX_TOOL_ROUNDS=30');
    vi.stubEnv('PIPELINE_JUDGE_ENABLED', '0'); vi.stubEnv('PIPELINE_CODER_MODE', 'agent');
    vi.stubEnv('CODER_MAX_TOOL_ROUNDS', '30'); vi.stubEnv('CODER_MAX_CONTEXT_TOKENS', '32768');
    expect(getConfig().pipeline).toMatchObject({ judgeEnabled: false, coderMode: 'agent', coder: { maxToolRounds: 30, maxContextTokens: 32768 } });
  });
});
