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
  workDir: string;      // sohbetin başlatıldığı proje dizini ('' = eski kayıt, dizin bilinmiyor)
}

const CONV_DIR = path.join(os.homedir(), '.deha', 'conversations');

export interface SaveConversationOptions {
  conversationId?: string;
  title?: string;
}

export function getConvDir(): string {
  if (!fs.existsSync(CONV_DIR)) fs.mkdirSync(CONV_DIR, { recursive: true });
  return CONV_DIR;
}

export function createConversationId(title = 'Sohbet'): string {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const slug = slugify(title).slice(0, 40) || 'sohbet';
  return `${dateStr}_${timeStr}_${slug}`;
}

// ─── Kaydet ─────────────────────────────────────────────────────────────────

export function saveConversation(
  messages: Message[],
  provider: string,
  model: string,
  options: SaveConversationOptions = {},
): string | null {
  if (messages.length < 1) return null;

  const now = new Date();
  const firstUserMsg = messages.find(m => m.role === 'user');
  const title   = options.title || makeTitle(firstUserMsg?.content || 'Sohbet');
  const id      = options.conversationId || createConversationId(title);
  const filePath = path.join(getConvDir(), `${id}.md`);

  const md = buildMarkdown(messages, { date: now.toISOString(), title, provider, model, workDir: process.cwd() });
  fs.writeFileSync(filePath, md, 'utf-8');

  return filePath;
}

// ─── Listele ────────────────────────────────────────────────────────────────

/**
 * `workDir` filtresi verildiğinde sadece o projeden kaydedilmiş sohbetleri
 * döndürür — farklı (ilgisiz) projelerin geçmişinin karışıp yanlışlıkla
 * `deha resume` ile açılmasını önlemek için. `workDir` alanı olmayan eski
 * kayıtlar (bu alan eklenmeden önce kaydedilmiş) hangi projeye ait olduğu
 * bilinmediğinden filtrelenmiş listede gösterilmez.
 */
export function listConversations(limit = 200, workDir?: string): ConversationMeta[] {
  const dir = getConvDir();
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  const resolvedFilter = workDir ? path.resolve(workDir) : undefined;

  const all = files.map((file) => {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseMeta(raw, file.replace('.md', ''), filePath);
  });

  const filtered = resolvedFilter
    ? all.filter((c) => c.workDir && path.resolve(c.workDir) === resolvedFilter)
    : all;

  return filtered.slice(0, limit);
}

// ─── Oku ────────────────────────────────────────────────────────────────────

export function readConversation(id: string): string | null {
  const filePath = path.join(getConvDir(), `${id}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function getConversationMeta(id: string): ConversationMeta | null {
  const raw = readConversation(id);
  if (!raw) return null;
  return parseMeta(raw, id, path.join(getConvDir(), `${id}.md`));
}

export function loadConversationMessages(id: string): Message[] | null {
  const raw = readConversation(id);
  if (!raw) return null;

  const messages: Message[] = [];
  // Split on role headers
  const parts = raw.split(/^## (?:🧑 Kullanıcı|🤖 DEHA|🛠 Tool Sonucu.*)\s*$/m);

  // Determine role order by scanning headers in order
  const headerMatches = [...raw.matchAll(/^## (🧑 Kullanıcı|🤖 DEHA|🛠 Tool Sonucu.*?)\s*$/gm)];

  for (let i = 0; i < headerMatches.length; i++) {
    const header = headerMatches[i][1];
    let role: 'user' | 'assistant' | 'tool' = 'user';
    let tool_call_id: string | undefined;

    if (header === '🧑 Kullanıcı') {
      role = 'user';
    } else if (header === '🤖 DEHA') {
      role = 'assistant';
    } else if (header.startsWith('🛠 Tool Sonucu')) {
      role = 'tool';
      const idMatch = header.match(/id: ([\w-]+)/);
      if (idMatch) tool_call_id = idMatch[1];
    }

    const content = (parts[i + 1] || '')
      .replace(/\n---\s*$/, '') // trailing separator
      .trim();

    if (content || role === 'assistant') {
      if (role === 'tool') {
        // Markdown round-trip loses the assistant-side tool_calls array (only a
        // truncated preview text is stored, with no id) — so a resumed
        // 'tool'-role message can never re-pair with anything. Both agent
        // loops then discard it as "orphaned": sanitizeHistoryForOpenAI drops
        // any tool result whose call_id isn't found among live tool_calls,
        // and toClaudeMessages filters out the 'tool' role entirely. Net
        // effect: every tool result from a resumed session vanished from
        // what the model actually sees, while the transcript displayed above
        // still shows all past commands as attempted. Folding it into a
        // plain 'user' message (matching the existing <previous_tool_result>
        // convention already used for old-tool-result summarization) keeps
        // the actual output intact and immune to the pairing/role filters.
        const idAttr = tool_call_id ? ` id=${tool_call_id}` : '';
        messages.push({
          role: 'user',
          content: `<previous_tool_result${idAttr}>\n${content}\n</previous_tool_result>`,
        });
      } else {
        messages.push({ role, content, tool_call_id });
      }
    }
  }

  return messages.length > 0 ? mergeConsecutiveSameRole(messages) : null;
}

/**
 * Folding every 'tool' message into 'user' (above) can leave several
 * adjacent 'user' entries in a row (one per tool call in a multi-tool
 * round). The OpenAI-compatible APIs tolerate that fine, but Anthropic's
 * Messages API requires strict user/assistant alternation and returns a 400
 * ("roles must alternate") otherwise — so merge same-role neighbors into one
 * message before this history reaches either provider.
 */
function mergeConsecutiveSameRole(messages: Message[]): Message[] {
  const merged: Message[] = [];
  for (const msg of messages) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role && (prev.role === 'user' || prev.role === 'assistant')) {
      prev.content = `${prev.content || ''}\n\n${msg.content || ''}`;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
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
  meta: { date: string; title: string; provider: string; model: string; workDir: string },
): string {
  const lines: string[] = [
    '---',
    `title: "${meta.title.replace(/"/g, "'")}"`,
    `date: ${meta.date}`,
    `provider: ${meta.provider}`,
    `model: ${meta.model}`,
    `messages: ${messages.length}`,
    `workdir: "${meta.workDir.replace(/"/g, "'")}"`,
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
      lines.push(msg.content || '');
      lines.push('');
    } else if (msg.role === 'assistant') {
      lines.push(`## 🤖 DEHA`);
      lines.push('');
      if (msg.reasoning_content) {
         lines.push(`> 💭 **Thinking:** ${msg.reasoning_content.slice(0, 500)}${msg.reasoning_content.length > 500 ? '...' : ''}\n`);
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
         for (const tc of msg.tool_calls) {
            const args = typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
            lines.push(`[Tool Call: **${tc.function.name}**(${args.slice(0, 100)}${args.length > 100 ? '...' : ''})]`);
         }
         lines.push('');
      }
      lines.push(msg.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    } else if (msg.role === 'tool') {
      lines.push(`## 🛠 Tool Sonucu (id: ${msg.tool_call_id || 'unknown'})`);
      lines.push('');
      lines.push(msg.content || '');
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
    workDir:      get('workdir') || '',
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
