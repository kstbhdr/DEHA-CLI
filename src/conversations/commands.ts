import * as readline from 'readline';
import chalk from 'chalk';
import {
  listConversations,
  readConversation,
  searchConversations,
  getConvDir,
  ConversationMeta,
} from './manager';

export async function handleHistoryCommand(args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] || 'list';

  switch (sub) {
    case 'list':
    case '':
      return showList();

    case 'search':
      return showSearch(parts.slice(1).join(' '));

    case 'open':
    case 'show':
      return showConversation(parts[1]);

    case 'dir':
      console.log(chalk.cyan('\n  Konum: ') + getConvDir() + '\n');
      return;

    default:
      // Sayı girildiyse o index'teki sohbeti aç
      if (/^\d+$/.test(sub)) {
        return showByIndex(parseInt(sub, 10) - 1);
      }
      // Direkt ID girilmişse aç
      return showConversation(sub);
  }
}

// ─── Liste ───────────────────────────────────────────────────────────────────

function showList(): void {
  const convs = listConversations(30);

  console.log('\n' + chalk.bold.cyan('═══ Sohbet Geçmişi ═══'));
  console.log(chalk.dim(`  Konum: ${getConvDir()}\n`));

  if (convs.length === 0) {
    console.log(chalk.dim('  Henüz kayıtlı sohbet yok.\n'));
    console.log(chalk.dim('  Sohbet bittiğinde otomatik kaydedilir.\n'));
    return;
  }

  convs.forEach((conv, i) => {
    const num    = chalk.dim(`${String(i + 1).padStart(2, ' ')}.`);
    const date   = chalk.dim(formatDisplayDate(conv.date));
    const title  = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
    const badge  = chalk.dim(`[${conv.provider}/${conv.model.split('-').slice(-2).join('-')}]`);
    const msgs   = chalk.dim(`${conv.messageCount} mesaj`);

    console.log(`  ${num} ${date}  ${chalk.white(title)}`);
    console.log(`       ${badge}  ${msgs}`);
  });

  console.log('');
  console.log(chalk.dim('  /oldconversations 3       → 3. sohbeti görüntüle'));
  console.log(chalk.dim('  /oldconversations search <kelime>  → ara'));
  console.log('');
}

// ─── Arama ───────────────────────────────────────────────────────────────────

function showSearch(query: string): void {
  if (!query) {
    console.log(chalk.red('\n  Kullanım: /oldconversations search <kelime>\n'));
    return;
  }

  const results = searchConversations(query);
  console.log(`\n${chalk.bold.cyan('Arama:')} "${query}"  — ${results.length} sonuç\n`);

  if (results.length === 0) {
    console.log(chalk.dim('  Eşleşen sohbet bulunamadı.\n'));
    return;
  }

  results.slice(0, 15).forEach((conv, i) => {
    const num   = chalk.dim(`${String(i + 1).padStart(2, ' ')}.`);
    const date  = chalk.dim(formatDisplayDate(conv.date));
    const title = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
    console.log(`  ${num} ${date}  ${chalk.white(title)}`);
    console.log(chalk.dim(`       ID: ${conv.id}`));
  });

  console.log('');
}

// ─── Sohbet görüntüle (index ile) ────────────────────────────────────────────

function showByIndex(index: number): void {
  const convs = listConversations(30);
  if (index < 0 || index >= convs.length) {
    console.log(chalk.red(`\n  Geçersiz numara. 1-${convs.length} arasında gir.\n`));
    return;
  }
  showConversation(convs[index].id);
}

// ─── Sohbet görüntüle (ID ile) ───────────────────────────────────────────────

function showConversation(id: string): void {
  if (!id) {
    console.log(chalk.red('\n  Kullanım: /oldconversations <numara|id>\n'));
    return;
  }

  const raw = readConversation(id);
  if (!raw) {
    console.log(chalk.red(`\n  Sohbet bulunamadı: ${id}\n`));
    return;
  }

  // Frontmatter'ı çıkar, geri kalanı göster
  const body = raw.replace(/^---[\s\S]*?---\n/, '');
  const lines = body.split('\n');

  console.log('\n' + chalk.dim('─'.repeat(60)));

  // Sayfalı göster (uzun sohbetler için)
  const PAGE = 40;
  if (lines.length <= PAGE) {
    console.log(renderMarkdown(body));
  } else {
    paginate(lines, PAGE);
  }

  console.log(chalk.dim('─'.repeat(60)) + '\n');
}

// ─── Basit sayfalama ─────────────────────────────────────────────────────────

function paginate(lines: string[], pageSize: number): void {
  let offset = 0;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const showPage = () => {
    const slice = lines.slice(offset, offset + pageSize);
    console.log(renderMarkdown(slice.join('\n')));
    offset += pageSize;

    if (offset >= lines.length) {
      rl.close();
      return;
    }

    rl.question(chalk.dim('  [Enter: devam, q: çık] '), (ans) => {
      if (ans.trim().toLowerCase() === 'q') {
        rl.close();
      } else {
        showPage();
      }
    });
  };

  showPage();
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
