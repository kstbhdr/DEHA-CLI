import chalk from 'chalk';
import { logger } from '../services/logger';
import {
  listConversations,
  readConversation,
  loadConversationMessages,
  searchConversations,
  getConvDir,
  ConversationMeta,
} from './manager';
import type { Message } from '../services/ai-service';

export interface HistorySelection {
  id: string;
  messages: Message[];
}

export async function handleHistoryCommand(args: string): Promise<HistorySelection | null> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || 'list';

  switch (sub) {
    case 'list':
    case '':
      showList();
      return null;

    case 'search':
      showSearch(parts.slice(1).join(' '));
      return null;

    case 'open':
    case 'show':
      return showConversation(parts[1]);

    case 'dir':
      logger.write(chalk.cyan('\n  Konum: ') + getConvDir() + '\n');
      return null;

    default:
      if (/^\d+$/.test(sub)) {
        return showByIndex(parseInt(sub, 10) - 1);
      }
      return showConversation(sub);
  }
}

// ─── Liste ───────────────────────────────────────────────────────────────────

function showList(): void {
  const convs = listConversations(100);

  logger.write('\n' + chalk.bold.cyan('═══ Sohbet Geçmişi ═══'));
  logger.write(chalk.dim(`  Konum: ${getConvDir()}\n`));

  if (convs.length === 0) {
    logger.write(chalk.dim('  Henüz kayıtlı sohbet yok.\n'));
    logger.write(chalk.dim('  Sohbet bittiğinde otomatik kaydedilir.\n'));
    return;
  }

  convs.forEach((conv, i) => {
    const num    = chalk.dim(`${String(i + 1).padStart(2, ' ')}.`);
    const date   = chalk.dim(formatDisplayDate(conv.date));
    const title  = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
    const badge  = chalk.dim(`[${conv.provider}/${conv.model.split('-').slice(-2).join('-')}]`);
    const msgs   = chalk.dim(`${conv.messageCount} mesaj`);

    logger.write(`  ${num} ${date}  ${chalk.white(title)}`);
    logger.write(`       ${badge}  ${msgs}`);
  });

  logger.write('');
  logger.write(chalk.dim('  /oldconversations 3       → 3. sohbeti görüntüle'));
  logger.write(chalk.dim('  /oldconversations search <kelime>  → ara'));
  logger.write('');
}

// ─── Arama ───────────────────────────────────────────────────────────────────

function showSearch(query: string): void {
  if (!query) {
    logger.write(chalk.red('\n  Kullanım: /oldconversations search <kelime>\n'));
    return;
  }

  const results = searchConversations(query);
  logger.write(`\n${chalk.bold.cyan('Arama:')} "${query}"  — ${results.length} sonuç\n`);

  if (results.length === 0) {
    logger.write(chalk.dim('  Eşleşen sohbet bulunamadı.\n'));
    return;
  }

  results.slice(0, 15).forEach((conv, i) => {
    const num   = chalk.dim(`${String(i + 1).padStart(2, ' ')}.`);
    const date  = chalk.dim(formatDisplayDate(conv.date));
    const title = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
    logger.write(`  ${num} ${date}  ${chalk.white(title)}`);
    logger.write(chalk.dim(`       ID: ${conv.id}`));
  });

  logger.write('');
}

// ─── Sohbet görüntüle (index ile) ────────────────────────────────────────────

function showByIndex(index: number): HistorySelection | null {
  const convs = listConversations(100);
  if (index < 0 || index >= convs.length) {
    logger.write(chalk.red(`\n  Geçersiz numara. 1-${convs.length} arasında gir.\n`));
    return null;
  }
  return showConversation(convs[index].id);
}

// ─── Sohbet görüntüle (ID ile) ───────────────────────────────────────────────

function showConversation(id: string): HistorySelection | null {
  if (!id) {
    logger.write(chalk.red('\n  Kullanım: /oldconversations <numara|id>\n'));
    return null;
  }

  const raw = readConversation(id);
  if (!raw) {
    logger.write(chalk.red(`\n  Sohbet bulunamadı: ${id}\n`));
    return null;
  }

  const body = raw.replace(/^---[\s\S]*?---\n/, '');

  logger.write('\n' + chalk.dim('─'.repeat(60)));
  // Tüm içeriği tek seferde yazdır — ikinci readline çakışmasını önle
  logger.write(renderMarkdown(body));
  logger.write(chalk.dim('─'.repeat(60)) + '\n');

  const messages = loadConversationMessages(id);
  if (!messages) {
    logger.write(chalk.yellow('  Sohbet görüntülendi ama mesajlar aktif bağlama yüklenemedi.\n'));
    return null;
  }

  logger.write(chalk.dim('  Aktif sohbet olarak yüklendi. Devam: ') + chalk.cyan(`deha resume ${id}`) + '\n');
  return { id, messages };
}

// ─── Markdown → terminal renderer (minimal) ──────────────────────────────────

function renderMarkdown(md: string): string {
  return md
    .replace(/^## 🧑 (.+)$/gm, chalk.bold.green('👤 $1'))
    .replace(/^## 🤖 (.+)$/gm, chalk.bold.cyan('🤖 $1'))
    .replace(/^# (.+)$/gm, chalk.bold.white('$1'))
    .replace(/^> (.+)$/gm, chalk.dim('  $1'))
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      chalk.bgGray.white(` ${lang || 'code'} `) + '\n' + chalk.cyan(code.trimEnd()) + '\n',
    )
    .replace(/`([^`]+)`/g, chalk.yellow('$1'))
    .replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'))
    .replace(/^---$/gm, chalk.dim('─'.repeat(50)));
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso.slice(0, 10);
  }
}
