import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Message } from '../services/ai-service';

export interface ConversationMeta {
  id: string;           // dosya adı (uzantısız)
  date: string;         // ISO tarih
  title: string;        // ilk mesajdan türetilir
  provider: string;
  model: string;
  messageCount: number;
  filePath: string;
}

const CONV_DIR = path.join(os.homedir(), '.deha', 'conversations');

export function getConvDir(): string {
  if (!fs.existsSync(CONV_DIR)) fs.mkdirSync(CONV_DIR, { recursive: true });
  return CONV_DIR;
}

// ─── Kaydet ─────────────────────────────────────────────────────────────────

export function saveConversation(
  messages: Message[],
  provider: string,
  model: string,
): string | null {
  if (messages.length < 2) return null; // çok kısa, kaydetme

  const now = new Date();
  const dateStr = formatDate(now);            // 2026-04-26
  const timeStr = formatTime(now);            // 14-30-00
  const title   = makeTitle(messages[0].content);
  const slug    = slugify(title).slice(0, 40);
  const id      = `${dateStr}_${timeStr}_${slug}`;
  const filePath = path.join(getConvDir(), `${id}.md`);

  const md = buildMarkdown(messages, { date: now.toISOString(), title, provider, model });
  fs.writeFileSync(filePath, md, 'utf-8');

  return filePath;
}

// ─── Listele ────────────────────────────────────────────────────────────────

export function listConversations(limit = 50): ConversationMeta[] {
  const dir = getConvDir();
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map((file) => {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseMeta(raw, file.replace('.md', ''), filePath);
  });
}

// ─── Oku ────────────────────────────────────────────────────────────────────

export function readConversation(id: string): string | null {
  const filePath = path.join(getConvDir(), `${id}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function loadConversationMessages(id: string): Message[] | null {
  const raw = readConversation(id);
  if (!raw) return null;

  const messages: Message[] = [];
  // Split on role headers
  const parts = raw.split(/^## (?:🧑 Kullanıcı|🤖 DEHA)\s*$/m);

  // Determine role order by scanning headers in order
  const headerMatches = [...raw.matchAll(/^## (🧑 Kullanıcı|🤖 DEHA)\s*$/gm)];

  for (let i = 0; i < headerMatches.length; i++) {
    const header = headerMatches[i][1];
    const role = header === '🧑 Kullanıcı' ? 'user' : 'assistant';
    const content = (parts[i + 1] || '')
      .replace(/\n---\s*$/, '') // trailing separator
      .trim();
    if (content) messages.push({ role, content });
  }

  return messages.length > 0 ? messages : null;
}

export function searchConversations(query: string): ConversationMeta[] {
  const dir = getConvDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const results: ConversationMeta[] = [];
  const q = query.toLowerCase();

  for (const file of files) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (raw.toLowerCase().includes(q)) {
      results.push(parseMeta(raw, file.replace('.md', ''), filePath));
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Markdown builder ────────────────────────────────────────────────────────

function buildMarkdown(
  messages: Message[],
  meta: { date: string; title: string; provider: string; model: string },
): string {
  const lines: string[] = [
    '---',
    `title: "${meta.title.replace(/"/g, "'")}"`,
    `date: ${meta.date}`,
    `provider: ${meta.provider}`,
    `model: ${meta.model}`,
    `messages: ${messages.length}`,
    '---',
    '',
    `# ${meta.title}`,
    '',
    `> **Tarih:** ${new Date(meta.date).toLocaleString('tr-TR')}  `,
    `> **Model:** ${meta.provider} / ${meta.model}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`## 🧑 Kullanıcı`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    } else {
      lines.push(`## 🤖 DEHA`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Meta parser (frontmatter'dan okur) ─────────────────────────────────────

function parseMeta(raw: string, id: string, filePath: string): ConversationMeta {
  const get = (key: string): string => {
    const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match ? match[1].replace(/^"|"$/g, '').trim() : '';
  };

  return {
    id,
    date:         get('date') || id.slice(0, 10),
    title:        get('title') || id,
    provider:     get('provider') || '?',
    model:        get('model') || '?',
    messageCount: parseInt(get('messages') || '0', 10),
    filePath,
  };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function makeTitle(firstMessage: string): string {
  return firstMessage
    .replace(/```[\s\S]*?```/g, '')  // kod bloklarını çıkar
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 60)
    || 'Sohbet';
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
