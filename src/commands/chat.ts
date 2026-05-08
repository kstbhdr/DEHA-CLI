import chalk from 'chalk';
import { DehaConfig } from '../config';
import { streamMessage, Message } from '../services/ai-service';
import { detectIntent, enrichWithSearch } from '../services/intent';

export function formatResponse(text: string): string {
  let formatted = text;

  // Kod bloklarını renklendir
  formatted = formatted.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const header = lang
        ? chalk.bgGray.white(` ${lang} `) + '\n'
        : chalk.bgGray.white(' code ') + '\n';
      return '\n' + header + chalk.cyan(code.trimEnd()) + '\n' + chalk.gray('─'.repeat(50)) + '\n';
    },
  );

  // Inline kod
  formatted = formatted.replace(/`([^`]+)`/g, chalk.bgBlack.yellow(' $1 '));

  // Başlıklar
  formatted = formatted.replace(/^### (.+)$/gm, chalk.bold.magenta('▸ $1'));
  formatted = formatted.replace(/^## (.+)$/gm, chalk.bold.cyan('◆ $1'));
  formatted = formatted.replace(/^# (.+)$/gm, chalk.bold.white('═ $1 ═'));

  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'));

  // Liste maddeleri
  formatted = formatted.replace(/^- (.+)$/gm, chalk.gray('  •') + ' $1');

  return formatted;
}

export async function chat(
  prompt: string,
  config: DehaConfig,
  history: Message[] = [],
  stream = false,
): Promise<string> {
  // Intent detection — web search gerekiyor mu?
  let enrichedPrompt = prompt;
  let searchSystemAddendum = '';
  try {
    const intent = await detectIntent(prompt, config);
    if (intent.search && intent.keywords) {
      process.stdout.write(chalk.dim(`\n  🌍 Searching: "${intent.keywords}"... `));
      enrichedPrompt = await enrichWithSearch(prompt, intent.keywords);
      searchSystemAddendum = [
        '',
        '=== WEB ARAMA SONUÇLARI MEVCUT ===',
        'Kullanıcının sorusunu cevaplamak için yukarıdaki [WEB ARAMA SONUÇLARI] bölümündeki verileri KULLAN.',
        'Bu veriler gerçek zamanlıdır. Bunları kullanarak cevap ver.',
        'Kesinlikle "veriye erişimim yok", "canlı verim yok", "üzgünüm" gibi ifadeler KULLANMA.',
        'Verileri oku, özetle ve kaynaklarıyla birlikte sun.',
      ].join('\n');
      process.stdout.write(chalk.green('✓\n'));
    }
  } catch {
    // Intent hatası sessizce geç, normal akışa devam et
  }

  // Search yapıldıysa system prompt'una addendum ekle
  const activeConfig = { ...config };
  if (searchSystemAddendum) {
    activeConfig.systemPrompt = (config.systemPrompt || '') + '\n' + searchSystemAddendum;
  }

  const messages: Message[] = [...history, { role: 'user', content: enrichedPrompt }];

  try {
    if (stream) {
      let full = '';
      await streamMessage(messages, activeConfig, (chunk) => {
        process.stdout.write(chunk);
        full += chunk;
      });
      process.stdout.write('\n');
      return full;
    }
    // Non-stream (deha chat "..." için)
    let full = '';
    process.stdout.write(chalk.bold.cyan('DEHA: '));
    await streamMessage(messages, activeConfig, (chunk) => {
      process.stdout.write(chunk);
      full += chunk;
    });
    process.stdout.write('\n');
    return full;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }
}
