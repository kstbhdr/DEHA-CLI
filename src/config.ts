import { CHAT_PROMPT } from './prompts.config';

export type Provider =
  | 'claude'
  | 'openai'
  | 'deepseek'
  | 'ollama'
  | 'openrouter'
  | 'xai'
  | 'custom';

export type DeepSeekThinkingMode = 'enabled' | 'disabled';
export type DeepSeekReasoningEffort = 'high' | 'max';

// ─── Rol Konfigürasyonu ─────────────────────────────────────────────────────

export interface RoleConfig {
  provider: Provider;
  model: string;
  apiKey?: string;      // role-özgü key (global'i override eder)
  apiUrl?: string;      // custom provider için endpoint URL'i
  maxTokens?: number;
  temperature?: number;
  openrouterProvider?: string;  // OpenRouter sub-provider (e.g. "DeepInfra", "Chutes")
}

// ─── Pipeline Konfigürasyonu ────────────────────────────────────────────────

export interface PipelineConfig {
  planner: RoleConfig;
  coder: RoleConfig;
  judge: RoleConfig;
  maxIterations: number;
}

// ─── Ana Config ─────────────────────────────────────────────────────────────

export interface DehaConfig {
  provider: Provider;

  // API Keyleri (global)
  anthropicApiKey?: string;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  openrouterApiKey?: string;
  xaiApiKey?: string;
  customApiKey?: string;

  deepseekThinking: DeepSeekThinkingMode;
  deepseekReasoningEffort: DeepSeekReasoningEffort;

  // Model isimleri (global)
  claudeModel: string;
  openaiModel: string;
  deepseekModel: string;
  openrouterModel: string;
  xaiModel: string;
  customModel: string;

  // Ollama
  ollamaHost: string;
  ollamaModel: string;

  // Custom endpoint
  customApiUrl: string;

  // OpenRouter sub-provider routing (global default)
  openrouterProvider?: string;

  // Vision
  visionProvider: string;
  visionModel: string;
  visionApiKey?: string;
  visionApiUrl?: string;

  // Pricing per role (USD per million tokens)
  chatInputPrice: number;
  chatOutputPrice: number;
  plannerInputPrice: number;
  plannerOutputPrice: number;
  coderInputPrice: number;
  coderOutputPrice: number;
  judgeInputPrice: number;
  judgeOutputPrice: number;
  visionInputPrice: number;
  visionOutputPrice: number;
  agentInputPrice: number;
  agentOutputPrice: number;

  // Agent
  maxToolRounds: number;
  toolMaxTokens: number;

  // Genel
  systemPrompt: string;
  maxTokens: number;
  temperature: number;

  // Context yönetimi
  maxContextTokens: number;    // Model context window (token)
  compressThreshold: number;   // Context bu orana yaklaşınca compress et (0-1)
  minHotMessages: number;      // Her zaman tam tutulan minimum mesaj sayısı

  // Dil / i18n
  language: 'tr' | 'en';

  // Pipeline
  pipeline: PipelineConfig;
}

// ─── Config Fabrikası ───────────────────────────────────────────────────────

export function getConfig(overrides: Partial<DehaConfig> = {}): DehaConfig {
  const base: DehaConfig = {
    provider: ((process.env.DEHA_PROVIDER || 'claude').toLowerCase() as Provider),

    anthropicApiKey:  process.env.ANTHROPIC_API_KEY,
    openaiApiKey:     process.env.OPENAI_API_KEY,
    deepseekApiKey:   process.env.DEEPSEEK_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    xaiApiKey:        process.env.XAI_API_KEY,
    customApiKey:     process.env.CUSTOM_API_KEY,

    deepseekThinking: parseDeepSeekThinking(process.env.DEEPSEEK_THINKING),
    deepseekReasoningEffort: parseDeepSeekReasoningEffort(process.env.DEEPSEEK_REASONING_EFFORT),

    claudeModel:      process.env.CLAUDE_MODEL      || 'claude-opus-4-6',
    openaiModel:      process.env.OPENAI_MODEL      || 'gpt-4o',
    deepseekModel:    process.env.DEEPSEEK_MODEL    || 'deepseek-chat',
    openrouterModel:  process.env.OPENROUTER_MODEL  || 'anthropic/claude-opus-4',
    xaiModel:         process.env.XAI_MODEL         || 'grok-3',
    customModel:      process.env.CUSTOM_MODEL      || 'local-model',

    ollamaHost:  process.env.OLLAMA_HOST  || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3',

    customApiUrl: process.env.CUSTOM_API_URL || 'http://localhost:8080/v1',

    openrouterProvider: process.env.OPENROUTER_PROVIDER || undefined,

    visionProvider: process.env.VISION_PROVIDER || 'openrouter',
    visionModel:    process.env.VISION_MODEL    || 'qwen/qwen3-vl-32b-instruct',
    visionApiKey:   process.env.VISION_API_KEY,
    visionApiUrl:   process.env.VISION_API_URL,

    chatInputPrice:     safeParseFloat(process.env.CHAT_INPUT_PRICE,     3.00),
    chatOutputPrice:    safeParseFloat(process.env.CHAT_OUTPUT_PRICE,    15.00),
    plannerInputPrice:  safeParseFloat(process.env.PLANNER_INPUT_PRICE,  3.00),
    plannerOutputPrice: safeParseFloat(process.env.PLANNER_OUTPUT_PRICE, 15.00),
    coderInputPrice:    safeParseFloat(process.env.CODER_INPUT_PRICE,    0.27),
    coderOutputPrice:   safeParseFloat(process.env.CODER_OUTPUT_PRICE,   1.10),
    judgeInputPrice:    safeParseFloat(process.env.JUDGE_INPUT_PRICE,    5.00),
    judgeOutputPrice:   safeParseFloat(process.env.JUDGE_OUTPUT_PRICE,   15.00),
    visionInputPrice:   safeParseFloat(process.env.VISION_INPUT_PRICE,   3.00),
    visionOutputPrice:  safeParseFloat(process.env.VISION_OUTPUT_PRICE,  15.00),
    agentInputPrice:    safeParseFloat(process.env.AGENT_INPUT_PRICE,    3.00),
    agentOutputPrice:   safeParseFloat(process.env.AGENT_OUTPUT_PRICE,   15.00),

    systemPrompt: process.env.DEHA_SYSTEM_PROMPT || (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CHAT_PROMPT } = require('./prompts.config');
      return CHAT_PROMPT as string;
    })(),

    maxToolRounds: safeParseInt(process.env.DEHA_MAX_TOOL_ROUNDS, 5),
    toolMaxTokens: safeParseInt(process.env.DEHA_TOOL_MAX_TOKENS, 48 * 1024),

    maxTokens:   safeParseInt(process.env.DEHA_MAX_TOKENS,   4096),
    temperature: safeParseFloat(process.env.DEHA_TEMPERATURE, 0.7),

    maxContextTokens:  safeParseInt(process.env.DEHA_MAX_CONTEXT_TOKENS, 0),  // 0 = otomatik
    compressThreshold: safeParseFloat(process.env.DEHA_COMPRESS_THRESHOLD, 0.75),
    minHotMessages:    safeParseInt(process.env.DEHA_MIN_HOT_MESSAGES, 10),

    language: ((process.env.DEHA_LANG || 'tr').toLowerCase() === 'en' ? 'en' : 'tr'),

    pipeline: {
      planner: {
        provider:           ((process.env.PLANNER_PROVIDER || 'claude').toLowerCase() as Provider),
        model:              process.env.PLANNER_MODEL   || 'claude-opus-4-6',
        apiKey:             process.env.PLANNER_API_KEY,
        apiUrl:             process.env.PLANNER_API_URL,
        maxTokens:          safeParseInt(process.env.PLANNER_MAX_TOKENS,   2048),
        temperature:        safeParseFloat(process.env.PLANNER_TEMPERATURE, 0.3),
        openrouterProvider: process.env.PLANNER_OPENROUTER_PROVIDER || undefined,
      },
      coder: {
        provider:           ((process.env.CODER_PROVIDER || 'deepseek').toLowerCase() as Provider),
        model:              process.env.CODER_MODEL   || 'deepseek-chat',
        apiKey:             process.env.CODER_API_KEY,
        apiUrl:             process.env.CODER_API_URL,
        maxTokens:          safeParseInt(process.env.CODER_MAX_TOKENS,   8192),
        temperature:        safeParseFloat(process.env.CODER_TEMPERATURE, 0.2),
        openrouterProvider: process.env.CODER_OPENROUTER_PROVIDER || undefined,
      },
      judge: {
        provider:           ((process.env.JUDGE_PROVIDER || 'xai').toLowerCase() as Provider),
        model:              process.env.JUDGE_MODEL   || 'grok-3',
        apiKey:             process.env.JUDGE_API_KEY,
        apiUrl:             process.env.JUDGE_API_URL,
        maxTokens:          safeParseInt(process.env.JUDGE_MAX_TOKENS,   2048),
        temperature:        safeParseFloat(process.env.JUDGE_TEMPERATURE, 0.1),
        openrouterProvider: process.env.JUDGE_OPENROUTER_PROVIDER || undefined,
      },
      maxIterations: safeParseInt(process.env.PIPELINE_MAX_ITERATIONS, 5),
    },
  };

  return { ...base, ...overrides };
}

// ─── Güvenli sayı dönüşümleri (NaN önleme) ─────────────────────────────────

function safeParseInt(value: string | undefined, defaultVal: number): number {
  if (value === undefined || value === '') return defaultVal;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

function safeParseFloat(value: string | undefined, defaultVal: number): number {
  if (value === undefined || value === '') return defaultVal;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultVal : parsed;
}

function parseDeepSeekThinking(value: string | undefined): DeepSeekThinkingMode {
  const normalized = (value || '').trim().toLowerCase();
  if (['enabled', 'enable', 'on', 'true', '1', 'yes'].includes(normalized)) return 'enabled';
  if (['disabled', 'disable', 'off', 'false', '0', 'no'].includes(normalized)) return 'disabled';
  return 'disabled';
}

function parseDeepSeekReasoningEffort(value: string | undefined): DeepSeekReasoningEffort {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'max' || normalized === 'xhigh') return 'max';
  return 'high';
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────

export function getProviderLabel(provider: Provider): string {
  const labels: Record<Provider, string> = {
    claude:      'Claude (Anthropic)',
    openai:      'OpenAI GPT',
    deepseek:    'DeepSeek',
    ollama:      'Ollama (Yerel)',
    openrouter:  'OpenRouter',
    xai:         'xAI (Grok)',
    custom:      'Custom API',
  };
  return labels[provider];
}

/** Bir RoleConfig için geçerli API key'i döner (role-özgü > global) */
export function resolveApiKey(role: RoleConfig, global: DehaConfig): string | undefined {
  if (role.apiKey) return role.apiKey;
  switch (role.provider) {
    case 'claude':      return global.anthropicApiKey;
    case 'openai':      return global.openaiApiKey;
    case 'deepseek':    return global.deepseekApiKey;
    case 'openrouter':  return global.openrouterApiKey;
    case 'xai':         return global.xaiApiKey;
    case 'custom':      return global.customApiKey;
    case 'ollama':      return undefined;
  }
}

/** Bir RoleConfig için geçerli API URL'ini döner */
export function resolveApiUrl(role: RoleConfig, global: DehaConfig): string {
  // role-özgü URL varsa onu kullan
  if (role.apiUrl) return role.apiUrl;
  // custom provider için global CUSTOM_API_URL
  if (role.provider === 'custom') return global.customApiUrl;
  // diğer providerlar için sabit URL'ler
  const urls: Partial<Record<Provider, string>> = {
    openai:     'https://api.openai.com/v1',
    deepseek:   'https://api.deepseek.com',
    openrouter: 'https://openrouter.ai/api/v1',
    xai:        'https://api.x.ai/v1',
    ollama:     global.ollamaHost,
  };
  return urls[role.provider] ?? global.customApiUrl;
}
