import chalk from 'chalk';
import axios from 'axios';
import { DehaConfig, Provider, getProviderLabel } from '../config';
import { logger } from '../services/logger';

export async function setup(config: DehaConfig): Promise<void> {
  logger.write('\n' + chalk.bold.cyan('═══ DEHA Kurulum & Bağlantı Testi ═══') + '\n');

  const provider = config.provider;
  logger.write(chalk.dim('Aktif Provider: ') + chalk.green(getProviderLabel(provider)));
  if (provider === 'custom') {
    logger.write(chalk.dim('Endpoint: ') + chalk.yellow(config.customApiUrl));
    logger.write(chalk.dim('Model: ') + chalk.yellow(config.customModel));
  }

  const ok = await testProvider(provider, config);

  if (ok) {
    logger.write('\n' + chalk.green('✓ Bağlantı başarılı! DEHA kullanıma hazır.'));
    logger.write(chalk.dim('  deha') + chalk.white(' komutuyla interaktif moda geçebilirsin.\n'));
  } else {
    logger.write('\n' + chalk.red('✗ Bağlantı kurulamadı.'));
    printFixHints(provider, config);
  }
}

async function testProvider(provider: Provider, config: DehaConfig): Promise<boolean> {
  process.stdout.write(chalk.dim('Bağlantı test ediliyor... '));

  try {
    switch (provider) {
      case 'claude': {
        if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY eksik');
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: config.anthropicApiKey });
        await client.messages.create({
          model: config.claudeModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        break;
      }
      case 'openai': {
        if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY eksik');
        await testOpenAICompat('https://api.openai.com/v1', config.openaiApiKey, config.openaiModel);
        break;
      }
      case 'deepseek': {
        if (!config.deepseekApiKey) throw new Error('DEEPSEEK_API_KEY eksik');
        await testOpenAICompat('https://api.deepseek.com', config.deepseekApiKey, config.deepseekModel);
        break;
      }
      case 'openrouter': {
        if (!config.openrouterApiKey) throw new Error('OPENROUTER_API_KEY eksik');
        await testOpenAICompat('https://openrouter.ai/api/v1', config.openrouterApiKey, config.openrouterModel);
        break;
      }
      case 'xai': {
        if (!config.xaiApiKey) throw new Error('XAI_API_KEY eksik');
        await testOpenAICompat('https://api.x.ai/v1', config.xaiApiKey, config.xaiModel);
        break;
      }
      case 'ollama': {
        await axios.get(`${config.ollamaHost}/api/tags`, { timeout: 5000 });
        break;
      }
      case 'custom': {
        // /models endpoint'i dene, yoksa /chat/completions ile kısa mesaj gönder
        const baseUrl = config.customApiUrl.replace(/\/$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.customApiKey) headers['Authorization'] = `Bearer ${config.customApiKey}`;

        try {
          await axios.get(`${baseUrl}/models`, { headers, timeout: 5000 });
        } catch {
          // /models yoksa doğrudan chat dene
          await testOpenAICompat(baseUrl, config.customApiKey, config.customModel);
        }
        break;
      }
    }

    logger.write(chalk.green('✓'));
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.write(chalk.red('✗'));
    logger.write(chalk.red('  Hata: ') + message);
    return false;
  }
}

async function testOpenAICompat(baseUrl: string, apiKey: string | undefined, model: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 },
    { headers, timeout: 10000 },
  );
}

function printFixHints(provider: Provider, config: DehaConfig): void {
  logger.write('\n' + chalk.bold('Çözüm önerileri:'));

  switch (provider) {
    case 'claude':
      logger.write(chalk.dim('  1. .env → ANTHROPIC_API_KEY'));
      logger.write(chalk.dim('  2. https://console.anthropic.com'));
      break;
    case 'openai':
      logger.write(chalk.dim('  1. .env → OPENAI_API_KEY'));
      logger.write(chalk.dim('  2. https://platform.openai.com'));
      break;
    case 'deepseek':
      logger.write(chalk.dim('  1. .env → DEEPSEEK_API_KEY'));
      logger.write(chalk.dim('  2. https://platform.deepseek.com'));
      break;
    case 'openrouter':
      logger.write(chalk.dim('  1. .env → OPENROUTER_API_KEY'));
      logger.write(chalk.dim('  2. https://openrouter.ai/keys'));
      break;
    case 'xai':
      logger.write(chalk.dim('  1. .env → XAI_API_KEY'));
      logger.write(chalk.dim('  2. https://console.x.ai'));
      break;
    case 'ollama':
      logger.write(chalk.dim('  1. Ollama kurulu mu? → https://ollama.ai'));
      logger.write(chalk.dim('  2. Servis çalışıyor mu? → ollama serve'));
      logger.write(chalk.dim('  3. Model var mı? → ollama pull llama3'));
      break;
    case 'custom':
      logger.write(chalk.dim(`  1. Endpoint erişilebilir mi? → ${config.customApiUrl}`));
      logger.write(chalk.dim('  2. .env → CUSTOM_API_URL, CUSTOM_MODEL, CUSTOM_API_KEY'));
      logger.write(chalk.dim('  3. Servisin OpenAI-uyumlu /chat/completions endpoint\'i var mı?'));
      logger.write(chalk.dim('     (LM Studio, vLLM, LocalAI, llama.cpp server, Kobold vb.)'));
      break;
  }

  logger.write('');
}
