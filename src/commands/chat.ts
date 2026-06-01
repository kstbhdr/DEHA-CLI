import chalk from 'chalk';
import { DehaConfig } from '../config';
import { streamMessage, Message } from '../services/ai-service';
import { detectIntent, enrichWithSearch } from '../services/intent';

export function formatResponse(text: string): string {
  let formatted = text;

  // Kod bloklarını renklendir ve çerçevele
  formatted = formatted.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const cleanCode = code.trimEnd();
      const lines = cleanCode.split('\n');
      const width = Math.min(80, Math.max(...lines.map((l: string) => l.length)) + 4);
      
      const top = chalk.gray('╭' + '─'.repeat(width - 2) + '╮');
      const header = lang 
        ? chalk.gray('│ ') + chalk.bgWhite.black(` ${lang.toUpperCase()} `) + chalk.gray('─'.repeat(width - lang.length - 5) + '┤')
        : chalk.gray('├' + '─'.repeat(width - 2) + '┤');
      const bottom = chalk.gray('╰' + '─'.repeat(width - 2) + '╯');
      
      const body = lines.map((l: string) => chalk.gray('│ ') + chalk.cyan(l.padEnd(width - 4)) + chalk.gray(' │')).join('\n');
      
      return '\n' + top + '\n' + header + '\n' + body + '\n' + bottom + '\n';
    },
  );

  // Inline kod
  formatted = formatted.replace(/`([^`]+)`/g, chalk.bgGray.yellow(' $1 '));

  // Başlıklar - Daha modern stiller
  formatted = formatted.replace(/^### (.+)$/gm, chalk.bold.magenta('● $1'));
  formatted = formatted.replace(/^## (.+)$/gm, chalk.bold.cyan('❯ $1'));
  formatted = formatted.replace(/^# (.+)$/gm, (match, p1) => {
    const title = p1.trim();
    const line = '═'.repeat(title.length + 4);
    return chalk.bold.white(`\n${line}\n  ${title}\n${line}`);
  });

  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, chalk.bold.yellow('$1'));

  // Liste maddeleri
  formatted = formatted.replace(/^- (.+)$/gm, chalk.cyan('  •') + ' $1');

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
