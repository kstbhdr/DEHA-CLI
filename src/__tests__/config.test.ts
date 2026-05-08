import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, getProviderLabel, resolveApiKey, resolveApiUrl, RoleConfig, DehaConfig } from '../config';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Tüm DEHA_* ve pipeline env'lerini temizle — test izolasyonu
  delete process.env.DEHA_PROVIDER;
  delete process.env.DEHA_MAX_TOKENS;
  delete process.env.DEHA_TEMPERATURE;
  delete process.env.DEHA_MAX_TOOL_ROUNDS;
  delete process.env.DEHA_COMPRESS_THRESHOLD;
  delete process.env.DEHA_MIN_HOT_MESSAGES;
  delete process.env.DEHA_MAX_CONTEXT_TOKENS;
  delete process.env.DEHA_TOOL_MAX_TOKENS;
  delete process.env.DEEPSEEK_THINKING;
  delete process.env.DEEPSEEK_REASONING_EFFORT;
  delete process.env.PLANNER_PROVIDER;
  delete process.env.CODER_PROVIDER;
  delete process.env.JUDGE_PROVIDER;
  delete process.env.PIPELINE_MAX_ITERATIONS;
  // systemPrompt require() hatasını önlemek için env set et
  process.env.DEHA_SYSTEM_PROMPT = 'test prompt';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getConfig', () => {
  it('varsayılan değerlerle config döndürür', () => {
    const cfg = getConfig();
    expect(cfg.provider).toBe('claude');
    expect(cfg.claudeModel).toBe('claude-opus-4-6');
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.temperature).toBe(0.7);
    expect(cfg.maxToolRounds).toBe(5);
    expect(cfg.toolMaxTokens).toBe(49152);
    expect(cfg.visionProvider).toBe('openrouter');
    expect(cfg.visionModel).toBe('qwen/qwen3-vl-32b-instruct');
    expect(cfg.deepseekThinking).toBe('disabled');
    expect(cfg.deepseekReasoningEffort).toBe('high');
    expect(cfg.maxContextTokens).toBe(0);
    expect(cfg.compressThreshold).toBe(0.75);
    expect(cfg.minHotMessages).toBe(10);
  });

  it('provider küçük harfe dönüştürülür', () => {
    process.env.DEHA_PROVIDER = 'DeepSeek';
    expect(getConfig().provider).toBe('deepseek');
  });

  it('ortam değişkenlerini okur', () => {
    process.env.DEHA_MAX_TOKENS = '8192';
    process.env.DEHA_TEMPERATURE = '0.3';
    process.env.DEHA_MAX_TOOL_ROUNDS = '50';
    process.env.DEHA_COMPRESS_THRESHOLD = '0.85';
    process.env.DEEPSEEK_THINKING = 'on';
    process.env.DEEPSEEK_REASONING_EFFORT = 'xhigh';

    const cfg = getConfig();
    expect(cfg.maxTokens).toBe(8192);
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.maxToolRounds).toBe(50);
    expect(cfg.compressThreshold).toBe(0.85);
    expect(cfg.deepseekThinking).toBe('enabled');
    expect(cfg.deepseekReasoningEffort).toBe('max');
  });

  it('override değerler base değerleri ezer', () => {
    const cfg = getConfig({ maxTokens: 9999, temperature: 1.0 });
    expect(cfg.maxTokens).toBe(9999);
    expect(cfg.temperature).toBe(1.0);
    // override edilmeyenler varsayılan kalır
    expect(cfg.provider).toBeDefined();
  });

  it('pipeline yapılandırması doğru', () => {
    const cfg = getConfig();
    expect(cfg.pipeline.planner.provider).toBe('claude');
    expect(cfg.pipeline.coder.provider).toBe('deepseek');
    expect(cfg.pipeline.judge.provider).toBe('xai');
    expect(cfg.pipeline.maxIterations).toBe(5);
  });

  it('pipeline override çalışır', () => {
    const cfg = getConfig({
      pipeline: {
        planner: { provider: 'openai', model: 'gpt-4o' } as RoleConfig,
        coder: { provider: 'claude', model: 'claude-sonnet-4' } as RoleConfig,
        judge: { provider: 'deepseek', model: 'deepseek-chat' } as RoleConfig,
        maxIterations: 10,
      },
    });
    expect(cfg.pipeline.planner.provider).toBe('openai');
    expect(cfg.pipeline.coder.model).toBe('claude-sonnet-4');
    expect(cfg.pipeline.judge.provider).toBe('deepseek');
    expect(cfg.pipeline.maxIterations).toBe(10);
  });

  it('hatalı env değerinde varsayılan kullanılır (safeParseInt fix)', () => {
    process.env.DEHA_MAX_TOKENS = 'invalid';
    process.env.DEHA_TEMPERATURE = 'invalid';
    const cfg = getConfig();
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.temperature).toBe(0.7);
  });

  it('boş env değerinde varsayılan kullanılır', () => {
    process.env.DEHA_MAX_TOKENS = '';
    const cfg = getConfig();
    expect(cfg.maxTokens).toBe(4096);
  });
});

describe('getProviderLabel', () => {
  it('geçerli providerlar için etiket döndürür', () => {
    expect(getProviderLabel('claude')).toContain('Claude');
    expect(getProviderLabel('openai')).toContain('OpenAI');
    expect(getProviderLabel('deepseek')).toContain('DeepSeek');
    expect(getProviderLabel('ollama')).toContain('Ollama');
    expect(getProviderLabel('openrouter')).toContain('OpenRouter');
    expect(getProviderLabel('xai')).toContain('Grok');
    expect(getProviderLabel('custom')).toContain('Custom');
  });
});

describe('resolveApiKey', () => {
  const fakeGlobal: DehaConfig = {
    provider: 'claude',
    anthropicApiKey: 'sk-ant-xxx',
    openaiApiKey: 'sk-openai-xxx',
    deepseekApiKey: 'sk-deep-xxx',
    openrouterApiKey: 'sk-or-xxx',
    xaiApiKey: 'sk-xai-xxx',
    customApiKey: 'sk-custom-xxx',
    deepseekThinking: 'disabled',
    deepseekReasoningEffort: 'high',
    claudeModel: 'claude-opus-4-6',
    openaiModel: 'gpt-4o',
    deepseekModel: 'deepseek-chat',
    openrouterModel: 'anthropic/claude-opus-4',
    xaiModel: 'grok-3',
    customModel: 'local-model',
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'llama3',
    customApiUrl: 'http://localhost:8080/v1',
    visionProvider: 'openrouter',
    visionModel: 'qwen/qwen3-vl-32b-instruct',
    chatInputPrice: 3,
    chatOutputPrice: 15,
    plannerInputPrice: 3,
    plannerOutputPrice: 15,
    coderInputPrice: 0.27,
    coderOutputPrice: 1.10,
    judgeInputPrice: 5,
    judgeOutputPrice: 15,
    visionInputPrice: 3,
    visionOutputPrice: 15,
    agentInputPrice: 3,
    agentOutputPrice: 15,
    systemPrompt: '',
    maxTokens: 4096,
    temperature: 0.7,
    maxToolRounds: 5,
    toolMaxTokens: 49152,
    maxContextTokens: 0,
    compressThreshold: 0.75,
    minHotMessages: 10,
    pipeline: {} as any,
  };

  it('role-özgü key global keyi ezer', () => {
    const role: RoleConfig = { provider: 'claude', model: 'x', apiKey: 'role-specific-key' };
    expect(resolveApiKey(role, fakeGlobal)).toBe('role-specific-key');
  });

  it('ollama için undefined döndürür', () => {
    const role: RoleConfig = { provider: 'ollama', model: 'llama3' };
    expect(resolveApiKey(role, fakeGlobal)).toBeUndefined();
  });

  it('provider bazlı global keyi döndürür', () => {
    expect(resolveApiKey({ provider: 'claude', model: 'x' } as RoleConfig, fakeGlobal)).toBe('sk-ant-xxx');
    expect(resolveApiKey({ provider: 'openai', model: 'x' } as RoleConfig, fakeGlobal)).toBe('sk-openai-xxx');
    expect(resolveApiKey({ provider: 'deepseek', model: 'x' } as RoleConfig, fakeGlobal)).toBe('sk-deep-xxx');
    expect(resolveApiKey({ provider: 'xai', model: 'x' } as RoleConfig, fakeGlobal)).toBe('sk-xai-xxx');
  });
});

describe('resolveApiUrl', () => {
  const fakeGlobal: DehaConfig = {
    ollamaHost: 'http://localhost:11434',
    customApiUrl: 'http://localhost:8080/v1',
  } as DehaConfig;

  it('role-özgü URL global URLi ezer', () => {
    const role: RoleConfig = { provider: 'openai', model: 'x', apiUrl: 'https://custom.url/v1' };
    expect(resolveApiUrl(role, fakeGlobal)).toBe('https://custom.url/v1');
  });

  it('custom provider için global CUSTOM_API_URL döndürür', () => {
    const role: RoleConfig = { provider: 'custom', model: 'x' };
    expect(resolveApiUrl(role, fakeGlobal)).toBe('http://localhost:8080/v1');
  });

  it('ollama için ollamaHost döndürür', () => {
    const role: RoleConfig = { provider: 'ollama', model: 'x' };
    expect(resolveApiUrl(role, fakeGlobal)).toBe('http://localhost:11434');
  });

  it('openai için varsayılan URL döndürür', () => {
    const role: RoleConfig = { provider: 'openai', model: 'x' };
    expect(resolveApiUrl(role, fakeGlobal)).toBe('https://api.openai.com/v1');
  });
});
