export type Provider =
  | 'claude'
  | 'openai'
  | 'deepseek'
  | 'ollama'
  | 'openrouter'
  | 'xai'
  | 'custom';

// ─── Rol Konfigürasyonu ─────────────────────────────────────────────────────

export interface RoleConfig {
  provider: Provider;
  model: string;
  apiKey?: string;      // role-özgü key (global'i override eder)
  apiUrl?: string;      // custom provider için endpoint URL'i
  maxTokens?: number;
  temperature?: number;
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

  // Genel
  systemPrompt: string;
  maxTokens: number;
  temperature: number;

  // Pipeline
  pipeline: PipelineConfig;
}

// ─── Config Fabrikası ───────────────────────────────────────────────────────

export function getConfig(overrides: Partial<DehaConfig> = {}): DehaConfig {
  const base: DehaConfig = {
    provider: (process.env.DEHA_PROVIDER as Provider) || 'claude',

    anthropicApiKey:  process.env.ANTHROPIC_API_KEY,
    openaiApiKey:     process.env.OPENAI_API_KEY,
    deepseekApiKey:   process.env.DEEPSEEK_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    xaiApiKey:        process.env.XAI_API_KEY,
    customApiKey:     process.env.CUSTOM_API_KEY,

    claudeModel:      process.env.CLAUDE_MODEL      || 'claude-opus-4-6',
    openaiModel:      process.env.OPENAI_MODEL      || 'gpt-4o',
    deepseekModel:    process.env.DEEPSEEK_MODEL    || 'deepseek-chat',
    openrouterModel:  process.env.OPENROUTER_MODEL  || 'anthropic/claude-opus-4',
    xaiModel:         process.env.XAI_MODEL         || 'grok-3',
    customModel:      process.env.CUSTOM_MODEL      || 'local-model',

    ollamaHost:  process.env.OLLAMA_HOST  || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3',

    customApiUrl: process.env.CUSTOM_API_URL || 'http://localhost:8080/v1',

    systemPrompt: process.env.DEHA_SYSTEM_PROMPT ||
      'Sen DEHA adlı zeki bir kodlama asistanısın. Türkçe sorulara Türkçe, İngilizce sorulara İngilizce yanıt ver. Kod örneklerinde her zaman açıklama ekle.',

    maxTokens:   parseInt(process.env.DEHA_MAX_TOKENS   || '4096', 10),
    temperature: parseFloat(process.env.DEHA_TEMPERATURE || '0.7'),

    pipeline: {
      planner: {
        provider:    (process.env.PLANNER_PROVIDER as Provider) || 'claude',
        model:       process.env.PLANNER_MODEL   || 'claude-opus-4-6',
        apiKey:      process.env.PLANNER_API_KEY,
        apiUrl:      process.env.PLANNER_API_URL,
        maxTokens:   parseInt(process.env.PLANNER_MAX_TOKENS   || '2048', 10),
        temperature: parseFloat(process.env.PLANNER_TEMPERATURE || '0.3'),
      },
      coder: {
        provider:    (process.env.CODER_PROVIDER as Provider) || 'deepseek',
        model:       process.env.CODER_MODEL   || 'deepseek-chat',
        apiKey:      process.env.CODER_API_KEY,
        apiUrl:      process.env.CODER_API_URL,
        maxTokens:   parseInt(process.env.CODER_MAX_TOKENS   || '8192', 10),
        temperature: parseFloat(process.env.CODER_TEMPERATURE || '0.2'),
      },
      judge: {
        provider:    (process.env.JUDGE_PROVIDER as Provider) || 'xai',
        model:       process.env.JUDGE_MODEL   || 'grok-3',
        apiKey:      process.env.JUDGE_API_KEY,
        apiUrl:      process.env.JUDGE_API_URL,
        maxTokens:   parseInt(process.env.JUDGE_MAX_TOKENS   || '2048', 10),
        temperature: parseFloat(process.env.JUDGE_TEMPERATURE || '0.1'),
      },
      maxIterations: parseInt(process.env.PIPELINE_MAX_ITERATIONS || '3', 10),
    },
  };

  return { ...base, ...overrides };
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
