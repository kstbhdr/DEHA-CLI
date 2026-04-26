import chalk from 'chalk';
import { DehaConfig } from '../config';
import { streamMessage, Message } from '../services/ai-service';

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
  const messages: Message[] = [...history, { role: 'user', content: prompt }];

  try {
    if (stream) {
      let full = '';
      await streamMessage(messages, config, (chunk) => {
        process.stdout.write(chunk);
        full += chunk;
      });
      process.stdout.write('\n');
      return full;
    }
    // Non-stream (deha chat "..." için)
    let full = '';
    process.stdout.write(chalk.bold.cyan('DEHA: '));
    await streamMessage(messages, config, (chunk) => {
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
