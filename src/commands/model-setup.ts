import inquirer from 'inquirer';
import chalk from 'chalk';
import { DehaConfig, Provider } from '../config';
import { logger } from '../services/logger';

const PROVIDERS: { name: string; value: Provider }[] = [
  { name: 'Claude  (Anthropic)',  value: 'claude'      },
  { name: 'OpenAI  (GPT)',        value: 'openai'      },
  { name: 'DeepSeek',             value: 'deepseek'    },
  { name: 'OpenRouter',           value: 'openrouter'  },
  { name: 'xAI  (Grok)',          value: 'xai'         },
  { name: 'Ollama  (Local)',       value: 'ollama'      },
  { name: 'Custom  API',          value: 'custom'      },
];

// ─── Mevcut config'den varsayılan model adını döner ──────────────────────────

function defaultModel(provider: Provider, config: DehaConfig): string {
  switch (provider) {
    case 'claude':     return config.claudeModel;
    case 'openai':     return config.openaiModel;
    case 'deepseek':   return config.deepseekModel;
    case 'openrouter': return config.openrouterModel;
    case 'xai':        return config.xaiModel;
    case 'ollama':     return config.ollamaModel;
    case 'custom':     return config.customModel;
  }
}

function defaultKey(provider: Provider, config: DehaConfig): string {
  switch (provider) {
    case 'claude':     return config.anthropicApiKey  ?? '';
    case 'openai':     return config.openaiApiKey     ?? '';
    case 'deepseek':   return config.deepseekApiKey   ?? '';
    case 'openrouter': return config.openrouterApiKey ?? '';
    case 'xai':        return config.xaiApiKey        ?? '';
    case 'custom':     return config.customApiKey     ?? '';
    default:           return '';
  }
}

function defaultVisionModel(provider: string, config: DehaConfig): string {
  switch (provider) {
    case 'claude':     return config.claudeModel;
    case 'openai':     return config.openaiModel;
    case 'openrouter': return config.visionModel || config.openrouterModel;
    case 'custom':     return config.visionModel || config.customModel;
    default:           return config.visionModel;
  }
}

function defaultVisionKey(provider: string, config: DehaConfig): string {
  if (config.visionApiKey) return config.visionApiKey;
  switch (provider) {
    case 'claude':     return config.anthropicApiKey ?? '';
    case 'openai':     return config.openaiApiKey ?? '';
    case 'openrouter': return config.openrouterApiKey ?? '';
    case 'custom':     return config.customApiKey ?? '';
    default:           return '';
  }
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export async function modelSetup(config: DehaConfig): Promise<void> {
  logger.write('\n' + chalk.bold.cyan('╔══════════════════════════════════════════╗'));
  logger.write(chalk.bold.cyan('║') + chalk.bold.white('   Model & Provider Ayarları') + ' '.repeat(16) + chalk.bold.cyan('║'));
  logger.write(chalk.bold.cyan('╚══════════════════════════════════════════╝') + '\n');
  logger.write(chalk.dim('  Boş bıraktığın alanlar mevcut değeri korur.\n'));

  // ── 1. Ana chat modeli ─────────────────────────────────────────────────────
  logger.write(chalk.bold.yellow('  ── Chat (İnteraktif Mod) ─────────────────'));
  const chat = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: PROVIDERS,
      default: config.provider,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model adı:',
      default: (ans: { provider: Provider }) => defaultModel(ans.provider, config),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (boş = mevcut):',
      mask: '*',
      default: '',
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API URL (custom için):',
      default: config.customApiUrl,
      when: (ans: { provider: Provider }) => ans.provider === 'custom' || ans.provider === 'ollama',
    },
  ]);

  // ── 2. Planner ─────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.blue('  ── Planner (Plan çıkarır) ─────────────────'));
  const planner = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: PROVIDERS,
      default: config.pipeline.planner.provider,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model adı:',
      default: (ans: { provider: Provider }) =>
        config.pipeline.planner.model || defaultModel(ans.provider, config),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (boş = global key):',
      mask: '*',
      default: '',
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Custom API URL:',
      default: config.pipeline.planner.apiUrl ?? '',
      when: (ans: { provider: Provider }) => ans.provider === 'custom' || ans.provider === 'ollama',
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: 'Max tokens:',
      default: config.pipeline.planner.maxTokens ?? 2048,
    },
    {
      type: 'number',
      name: 'temperature',
      message: 'Temperature (0-1):',
      default: config.pipeline.planner.temperature ?? 0.3,
    },
  ]);

  // ── 3. Coder (Draft) ───────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.green('  ── Coder / Draft (Kodu yazar) ─────────────'));
  const coder = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: PROVIDERS,
      default: config.pipeline.coder.provider,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model adı:',
      default: (ans: { provider: Provider }) =>
        config.pipeline.coder.model || defaultModel(ans.provider, config),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (boş = global key):',
      mask: '*',
      default: '',
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Custom API URL:',
      default: config.pipeline.coder.apiUrl ?? '',
      when: (ans: { provider: Provider }) => ans.provider === 'custom' || ans.provider === 'ollama',
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: 'Max tokens:',
      default: config.pipeline.coder.maxTokens ?? 8192,
    },
    {
      type: 'number',
      name: 'temperature',
      message: 'Temperature (0-1):',
      default: config.pipeline.coder.temperature ?? 0.2,
    },
  ]);

  // ── 4. Judge ───────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.red('  ── Judge (Kodu inceler) ────────────────────'));
  const judge = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: PROVIDERS,
      default: config.pipeline.judge.provider,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model adı:',
      default: (ans: { provider: Provider }) =>
        config.pipeline.judge.model || defaultModel(ans.provider, config),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (boş = global key):',
      mask: '*',
      default: '',
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Custom API URL:',
      default: config.pipeline.judge.apiUrl ?? '',
      when: (ans: { provider: Provider }) => ans.provider === 'custom' || ans.provider === 'ollama',
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: 'Max tokens:',
      default: config.pipeline.judge.maxTokens ?? 2048,
    },
    {
      type: 'number',
      name: 'temperature',
      message: 'Temperature (0-1):',
      default: config.pipeline.judge.temperature ?? 0.1,
    },
  ]);

  // ── 5. Vision ──────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.magenta('  ── Vision (Görüntü analizi) ───────────────'));
  const vision = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: [
        { name: 'Claude  (Anthropic)', value: 'claude' },
        { name: 'OpenAI  (GPT-4o)',    value: 'openai' },
        { name: 'OpenRouter',          value: 'openrouter' },
        { name: 'Custom  API',         value: 'custom' },
      ],
      default: config.visionProvider || 'openrouter',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model adı:',
      default: (ans: { provider: string }) =>
        defaultVisionModel(ans.provider, config),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (boş = global key):',
      mask: '*',
      default: (ans: { provider: string }) => defaultVisionKey(ans.provider, config),
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Custom API URL:',
      default: config.visionApiUrl || config.customApiUrl,
      when: (ans: { provider: string }) => ans.provider === 'custom',
    },
  ]);

  // ── Pipeline max iterations ────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.white('  ── Pipeline Ayarları ──────────────────────'));
  const pipeline = await inquirer.prompt([
    {
      type: 'number',
      name: 'maxIterations',
      message: 'Max iterasyon (Judge FAIL → tekrar yaz):',
      default: config.pipeline.maxIterations,
    },
  ]);

  type ChatAns    = { provider: Provider; model: string; apiKey?: string; apiUrl?: string };
  type RoleAns    = { provider: Provider; model: string; apiKey?: string; apiUrl?: string; maxTokens?: number; temperature?: number };
  type VisionAns  = { provider: string;   model: string; apiKey?: string; apiUrl?: string };
  type PipeAns    = { maxIterations: number };

  // ── Config'e uygula ────────────────────────────────────────────────────────
  applyToConfig(config, {
    chat:     chat     as ChatAns,
    planner:  planner  as RoleAns,
    coder:    coder    as RoleAns,
    judge:    judge    as RoleAns,
    vision:   vision   as VisionAns,
    pipeline: pipeline as PipeAns,
  });

  // ── Özet göster ────────────────────────────────────────────────────────────
  logger.write('\n' + chalk.bold.cyan('  ✓ Ayarlar bu oturum için güncellendi:\n'));

  const row = (label: string, color: chalk.Chalk, p: string, m: string) =>
    logger.write(`  ${color(label.padEnd(10))}  ${chalk.dim('provider=')}${chalk.green(p)}  ${chalk.dim('model=')}${chalk.yellow(m)}`);

  row('Chat',    chalk.bold.yellow,   config.provider,                   getModelFromConfig(config, config.provider));
  row('Planner', chalk.bold.blue,     config.pipeline.planner.provider,  config.pipeline.planner.model);
  row('Coder',   chalk.bold.green,    config.pipeline.coder.provider,    config.pipeline.coder.model);
  row('Judge',   chalk.bold.red,      config.pipeline.judge.provider,    config.pipeline.judge.model);
  row('Vision',  chalk.bold.magenta,  (vision as VisionAns).provider,    (vision as VisionAns).model);
  logger.write('');
}

// ─── Config'e yansıt ─────────────────────────────────────────────────────────

function applyToConfig(
  config: DehaConfig,
  answers: {
    chat:     { provider: Provider; model: string; apiKey?: string; apiUrl?: string };
    planner:  { provider: Provider; model: string; apiKey?: string; apiUrl?: string; maxTokens?: number; temperature?: number };
    coder:    { provider: Provider; model: string; apiKey?: string; apiUrl?: string; maxTokens?: number; temperature?: number };
    judge:    { provider: Provider; model: string; apiKey?: string; apiUrl?: string; maxTokens?: number; temperature?: number };
    vision:   { provider: string;   model: string; apiKey?: string; apiUrl?: string };
    pipeline: { maxIterations: number };
  },
): void {
  const { chat, planner, coder, judge, vision, pipeline } = answers;

  // Chat
  config.provider = chat.provider;
  setModel(config, chat.provider, chat.model);
  if (chat.apiKey) setKey(config, chat.provider, chat.apiKey);
  if (chat.apiUrl) config.customApiUrl = chat.apiUrl;

  // Planner
  config.pipeline.planner.provider    = planner.provider;
  config.pipeline.planner.model       = planner.model;
  if (planner.apiKey)      config.pipeline.planner.apiKey      = planner.apiKey;
  if (planner.apiUrl)      config.pipeline.planner.apiUrl      = planner.apiUrl;
  if (planner.maxTokens)   config.pipeline.planner.maxTokens   = planner.maxTokens;
  if (planner.temperature !== undefined) config.pipeline.planner.temperature = planner.temperature;

  // Coder
  config.pipeline.coder.provider    = coder.provider;
  config.pipeline.coder.model       = coder.model;
  if (coder.apiKey)      config.pipeline.coder.apiKey      = coder.apiKey;
  if (coder.apiUrl)      config.pipeline.coder.apiUrl      = coder.apiUrl;
  if (coder.maxTokens)   config.pipeline.coder.maxTokens   = coder.maxTokens;
  if (coder.temperature !== undefined) config.pipeline.coder.temperature = coder.temperature;

  // Judge
  config.pipeline.judge.provider    = judge.provider;
  config.pipeline.judge.model       = judge.model;
  if (judge.apiKey)      config.pipeline.judge.apiKey      = judge.apiKey;
  if (judge.apiUrl)      config.pipeline.judge.apiUrl      = judge.apiUrl;
  if (judge.maxTokens)   config.pipeline.judge.maxTokens   = judge.maxTokens;
  if (judge.temperature !== undefined) config.pipeline.judge.temperature = judge.temperature;

  // Vision — config'deki vision alanlarına yaz
  config.visionProvider = vision.provider;
  config.visionModel    = vision.model;
  if (vision.apiKey) config.visionApiKey = vision.apiKey;
  if (vision.apiUrl) config.visionApiUrl = vision.apiUrl;

  // Pipeline
  config.pipeline.maxIterations = pipeline.maxIterations;
}

function setModel(config: DehaConfig, provider: Provider, model: string): void {
  if (!model) return;
  switch (provider) {
    case 'claude':     config.claudeModel     = model; break;
    case 'openai':     config.openaiModel     = model; break;
    case 'deepseek':   config.deepseekModel   = model; break;
    case 'openrouter': config.openrouterModel = model; break;
    case 'xai':        config.xaiModel        = model; break;
    case 'ollama':     config.ollamaModel     = model; break;
    case 'custom':     config.customModel     = model; break;
  }
}

function setKey(config: DehaConfig, provider: Provider, key: string): void {
  switch (provider) {
    case 'claude':     config.anthropicApiKey  = key; break;
    case 'openai':     config.openaiApiKey     = key; break;
    case 'deepseek':   config.deepseekApiKey   = key; break;
    case 'openrouter': config.openrouterApiKey = key; break;
    case 'xai':        config.xaiApiKey        = key; break;
    case 'custom':     config.customApiKey     = key; break;
  }
}

function getModelFromConfig(config: DehaConfig, provider: Provider): string {
  switch (provider) {
    case 'claude':     return config.claudeModel;
    case 'openai':     return config.openaiModel;
    case 'deepseek':   return config.deepseekModel;
    case 'openrouter': return config.openrouterModel;
    case 'xai':        return config.xaiModel;
    case 'ollama':     return config.ollamaModel;
    case 'custom':     return config.customModel;
  }
}
