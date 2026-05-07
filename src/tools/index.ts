import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { ToolDefinition } from '../services/ai-service';
import { toolRunTerminal } from './terminal';
import { toolRunPython } from './python';
import { toolSmokeTest } from './smoke';
import { toolBrowserAction } from './browser';
import { toolWebSearch, toolCrawlUrl } from './search';
import { editFile, insertLines, deleteLines } from './edit';
import { logger } from '../services/logger';
// vision tool requires DehaConfig, handled separately in agent.ts

// ─── Tool definitions (Claude API schema) ──────────────────────────────────

export const DEHA_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Use for code analysis, debugging, or file inspection.',
    input_schema: {
      type: 'object',
      properties: {
        path:       { type: 'string', description: 'File path (absolute or relative)' },
        start_line: { type: 'number', description: 'Start line (optional)' },
        end_line:   { type: 'number', description: 'End line (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file. Use only for new files — prefer edit_file for existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit a specific part of a file without rewriting the whole thing. Saves tokens vs write_file. Requires exact string match including whitespace.',
    input_schema: {
      type: 'object',
      properties: {
        path:        { type: 'string', description: 'File path to edit' },
        old_string:  { type: 'string', description: 'Exact string to replace (whitespace sensitive)' },
        new_string:  { type: 'string', description: 'Replacement string' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'insert_lines',
    description: 'Insert lines into a file before a given line number.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path' },
        line:    { type: 'number', description: 'Insert BEFORE this line (1-indexed, 0 = prepend)' },
        content: { type: 'string', description: 'Content to insert' },
      },
      required: ['path', 'line', 'content'],
    },
  },
  {
    name: 'delete_lines',
    description: 'Delete a range of lines from a file.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'File path' },
        from_line: { type: 'number', description: 'Start line (1-indexed, inclusive)' },
        to_line:   { type: 'number', description: 'End line (1-indexed, inclusive)' },
      },
      required: ['path', 'from_line', 'to_line'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the contents of a directory.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_shell',
    description: 'Run a shell command. Use for builds, tests, git operations, etc. Safe commands only — destructive operations are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run (max 2000 chars, destructive commands blocked)' },
        cwd:     { type: 'string', description: 'Working directory (must be within project root)' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 30, max: 60)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_terminal',
    description: 'Run a shell command with streaming output, timeout, and env var support.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' },
        cwd:     { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
        env:     { type: 'object', description: 'Additional environment variables' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_python',
    description: 'Execute Python code from a snippet or file path. Supports pip install and virtualenv.',
    input_schema: {
      type: 'object',
      properties: {
        code:     { type: 'string', description: 'Python code to execute' },
        file:     { type: 'string', description: 'Path to a .py file to run' },
        packages: { type: 'array', items: { type: 'string' }, description: 'pip packages to install before running' },
        cwd:      { type: 'string', description: 'Working directory' },
        timeout:  { type: 'number', description: 'Timeout in seconds (default: 30)' },
        use_venv: { type: 'boolean', description: 'Use a virtual environment' },
      },
    },
  },
  {
    name: 'search_in_files',
    description: 'Search for a text pattern across files in a directory (like grep).',
    input_schema: {
      type: 'object',
      properties: {
        pattern:   { type: 'string', description: 'Text or regex pattern to search for' },
        directory: { type: 'string', description: 'Directory to search in' },
        extension: { type: 'string', description: 'File extension filter (e.g. .ts, .py)' },
      },
      required: ['pattern', 'directory'],
    },
  },
  {
    name: 'grep',
    description: 'Alias for search_in_files. Search for a text pattern across files in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        pattern:   { type: 'string', description: 'Text or regex pattern to search for' },
        directory: { type: 'string', description: 'Directory to search in' },
        extension: { type: 'string', description: 'File extension filter (e.g. .ts, .py)' },
      },
      required: ['pattern', 'directory'],
    },
  },
  {
    name: 'ls',
    description: 'Alias for list_dir. List the contents of a directory.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'cat',
    description: 'Alias for read_file. Read the contents of a file.',
    input_schema: {
      type: 'object',
      properties: {
        path:       { type: 'string', description: 'File path' },
        start_line: { type: 'number', description: 'Start line' },
        end_line:   { type: 'number', description: 'End line' },
      },
      required: ['path'],
    },
  },
  {
    name: 'mkdir',
    description: 'Create a new directory (including parents).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'smoke_test',
    description: 'Run HTTP health checks against one or more endpoints.',
    input_schema: {
      type: 'object',
      properties: {
        url:             { type: 'string', description: 'Base URL to test' },
        routes:          { type: 'array', items: { type: 'string' }, description: 'Routes to check (default: ["/"])' },
        expected_status: { type: 'number', description: 'Expected HTTP status code' },
        expected_body:   { type: 'string', description: 'String that must appear in the response body' },
        max_ms:          { type: 'number', description: 'Maximum allowed response time (ms)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_action',
    description: 'Browser automation via Playwright: navigate, click, fill forms, take screenshots, extract text.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL' },
        actions: {
          type: 'array',
          description: 'Sequence of browser actions to perform',
          items: {
            type: 'object',
            properties: {
              type:     { type: 'string', enum: ['click', 'fill', 'screenshot', 'wait', 'getText', 'getHtml', 'evaluate', 'scroll', 'waitForSelector'] },
              selector: { type: 'string' },
              value:    { type: 'string' },
              code:     { type: 'string' },
              timeout:  { type: 'number' },
            },
            required: ['type'],
          },
        },
        headless: { type: 'boolean', description: 'Run headless (default: true)' },
      },
      required: ['url', 'actions'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo and optionally crawl GitHub or StackOverflow for up-to-date information.',
    input_schema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'Search query' },
        source:      { type: 'string', enum: ['web', 'github', 'stackoverflow', 'all'], description: 'Where to search (default: web)' },
        max_results: { type: 'number', description: 'Max results per source (default: 8)' },
        crawl_top:   { type: 'number', description: 'Fetch full page content from top N results (default: 0)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'crawl_url',
    description: 'Fetch and extract readable text content from any URL (GitHub repo, StackOverflow answer, docs page, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        url:       { type: 'string', description: 'URL to crawl' },
        max_chars: { type: 'number', description: 'Max characters to return (default: 4000)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'vision_analyze',
    description: 'Take a screenshot of a URL and analyze it with a vision model. Detects UI bugs, layout issues, accessibility problems. Supports any OpenAI-compatible vision endpoint.',
    input_schema: {
      type: 'object',
      properties: {
        url:        { type: 'string', description: 'Web page URL to screenshot and analyze' },
        image_path: { type: 'string', description: 'Path to an existing image file' },
        prompt:     { type: 'string', description: 'Custom question or instruction for the vision model' },
        full_page:  { type: 'boolean', description: 'Capture full page (default: false)' },
        provider:   { type: 'string', enum: ['claude', 'openai'], description: 'Vision provider (default: claude)' },
        model:      { type: 'string', description: 'Model name override (e.g. gpt-4o, claude-opus-4-6)' },
        api_key:    { type: 'string', description: 'API key override (uses config key by default)' },
        api_url:    { type: 'string', description: 'Custom OpenAI-compatible endpoint URL (e.g. http://localhost:8080/v1)' },
      },
    },
  },
];

// ─── Tool Yürütücü ─────────────────────────────────────────────────────────

interface ToolInput {
  path?: string;
  content?: string;
  recursive?: boolean;
  command?: string;
  cwd?: string;
  timeout?: number;
  pattern?: string;
  directory?: string;
  extension?: string;
  start_line?: number;
  end_line?: number;
  // edit_file
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  // insert_lines
  line?: number;
  // delete_lines
  from_line?: number;
  to_line?: number;
}

// ─── Güvenlik sabitleri ──────────────────────────────────────────────────────

/** Proje kök dizini (deha-cli dizini) — shell komutları buradan dışarı çıkamaz */
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** İzin verilmeyen yıkıcı komut kalıpları */
const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+\//,       // rm -rf /
  /^rm\s+-rf\s+~/,         // rm -rf ~
  /^rm\s+-rf\s+\*/,        // rm -rf *
  /^rm\s+-rf\s+--no-preserve-root/,
  /^dd\s+if=/,             // dd if=/dev/zero...
  /^mkfs\./,               // mkfs.ext4, mkfs.btrfs
  /^fdisk\s/,              // fdisk
  /^format\s/,             // Windows format
  /^del\s+\/f\s+\/s\s+/,  // Windows force recursive delete
  /^rd\s+\/s\s+\/q\s+/,   // Windows force remove directory
  /^shutdown\s/,           // shutdown /s /r
  /^reboot\s?$/,
  /^init\s+0/,             // Linux shutdown
  /^halt\s?$/,
  /^poweroff\s?$/,
  /^>\/dev\/sda/,          // direct disk write
  /^chmod\s+-R\s+0\s+\//, // chmod 0 /
  /^:\(\)\s*\{/,           // fork bomb
];

/** Maksimum komut uzunluğu (karakter) */
const MAX_COMMAND_LENGTH = 2000;

/** Varsayılan timeout (ms) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maksimum timeout (ms) — 5 dakika */
const MAX_TIMEOUT_MS = 300_000;

// Sync toollar
export function executeTool(name: string, input: Record<string, unknown>): string {
  const inp = input as ToolInput;
  try {
    switch (name) {
      case 'read_file':
      case 'cat':             return toolReadFile(inp);
      case 'write_file':      return toolWriteFile(inp);
      case 'edit_file':       return editFile(inp as Parameters<typeof editFile>[0]);
      case 'insert_lines':    return insertLines(inp as Parameters<typeof insertLines>[0]);
      case 'delete_lines':    return deleteLines(inp as Parameters<typeof deleteLines>[0]);
      case 'list_dir':
      case 'ls':              return toolListDir(inp);
      case 'search_in_files':
      case 'grep':            return toolSearchInFiles(inp);
      case 'mkdir':           return toolMkdir(inp);
      // Async toollar için placeholder — agent.ts'te executeToolAsync kullanılır
      case 'run_terminal':
      case 'run_python':
      case 'smoke_test':
      case 'browser_action':
      case 'vision_analyze':
      case 'web_search':
      case 'crawl_url':
      case 'run_shell':
        return `__ASYNC_TOOL__:${name}`;
      default: return `Bilinmeyen tool: ${name}`;
    }
  } catch (err: unknown) {
    return `HATA: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Async toollar
export async function executeToolAsync(
  name: string,
  input: Record<string, unknown>,
  config?: import('../config').DehaConfig,
): Promise<string> {
  try {
    switch (name) {
      case 'run_shell':
        return await toolRunShell(input as ToolInput);
      case 'run_terminal':
        return await toolRunTerminal(input as Parameters<typeof toolRunTerminal>[0]);
      case 'run_python':
        return await toolRunPython(input as Parameters<typeof toolRunPython>[0]);
      case 'smoke_test':
        return await toolSmokeTest(input as Parameters<typeof toolSmokeTest>[0]);
      case 'browser_action':
        return await toolBrowserAction(input as Parameters<typeof toolBrowserAction>[0]);
      case 'vision_analyze': {
        if (!config) return 'vision_analyze için config gerekli';
        const { toolVisionAnalyze } = await import('./vision');
        return await toolVisionAnalyze(input as Parameters<typeof toolVisionAnalyze>[0], config);
      }
      case 'web_search':
        return await toolWebSearch(input as Parameters<typeof toolWebSearch>[0]);
      case 'crawl_url':
        return await toolCrawlUrl(input as Parameters<typeof toolCrawlUrl>[0]);
      default:
        return executeTool(name, input);
    }
  } catch (err: unknown) {
    return `HATA: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Araç görsel logu ──────────────────────────────────────────────────────

export function printToolCall(name: string, input: Record<string, unknown>): void {
  const icons: Record<string, string> = {
    read_file:       '📄',
    cat:             '📄',
    write_file:      '✏️ ',
    edit_file:       '🖊️ ',
    insert_lines:    '➕',
    delete_lines:    '🗑️ ',
    list_dir:        '📁',
    ls:              '📁',
    mkdir:           '📁',
    run_shell:       '⚡',
    run_terminal:    '💻',
    run_python:      '🐍',
    smoke_test:      '🧪',
    browser_action:  '🌐',
    vision_analyze:  '👁️ ',
    search_in_files: '🔍',
    grep:            '🔍',
    web_search:      '🌍',
    crawl_url:       '🕷️ ',
  };
  const icon = icons[name] ?? '🔧';
  const preview = Object.entries(input)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
    .join(', ');
  logger.write(chalk.dim(`\n  ${icon} `) + chalk.yellow(name) + chalk.dim(`(${preview})`));
}

// ─── Araç implementasyonları ───────────────────────────────────────────────

function toolReadFile(inp: ToolInput): string {
  if (!inp.path) throw new Error('path gerekli');
  const resolved = path.resolve(inp.path);
  const raw = fs.readFileSync(resolved, 'utf-8');
  const lines = raw.split('\n');

  const start = (inp.start_line ?? 1) - 1;
  const end = inp.end_line ?? lines.length;
  const sliced = lines.slice(start, end);

  const numbered = sliced.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
  return `[${resolved}]\n${numbered}`;
}

function toolWriteFile(inp: ToolInput): string {
  if (!inp.path || inp.content === undefined) throw new Error('path ve content gerekli');
  const resolved = path.resolve(inp.path);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, inp.content, 'utf-8');
  return `Dosya yazıldı: ${resolved} (${inp.content.length} karakter)`;
}

function toolListDir(inp: ToolInput): string {
  if (!inp.path) throw new Error('path gerekli');
  const resolved = path.resolve(inp.path);

  if (inp.recursive) {
    return listRecursive(resolved, resolved, 0, 4);
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const lines = entries.map((e) => {
    const isDir = e.isDirectory();
    return `${isDir ? '📁' : '📄'} ${e.name}${isDir ? '/' : ''}`;
  });
  return `[${resolved}]\n${lines.join('\n')}`;
}

function toolMkdir(inp: ToolInput): string {
  if (!inp.path) throw new Error('path gerekli');
  const resolved = path.resolve(inp.path);
  if (fs.existsSync(resolved)) return `Dizin zaten mevcut: ${resolved}`;
  fs.mkdirSync(resolved, { recursive: true });
  return `Dizin oluşturuldu: ${resolved}`;
}

function listRecursive(base: string, dir: string, depth: number, maxDepth: number): string {
  if (depth > maxDepth) return '';
  const indent = '  '.repeat(depth);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const lines: string[] = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const isDir = e.isDirectory();
    lines.push(`${indent}${isDir ? '📁' : '📄'} ${e.name}`);
    if (isDir) {
      lines.push(listRecursive(base, path.join(dir, e.name), depth + 1, maxDepth));
    }
  }
  return lines.filter(Boolean).join('\n');
}

// Tehlikeli/yıkıcı komut kalıpları — agent asla bunları çalıştıramaz
let autoAllowDangerousCommands = false;

const FORBIDDEN_PATTERNS = [
  /(\|\s*)?rm\s+(-rf?\s+)?(\/(\s|$)|\/\*|~(\s|$)|\$HOME|\$PWD|\.\s*$)/i,
  /(\|\s*)?dd\s+if=/i,
  /(\|\s*)?mkfs\b/i,
  /(\|\s*)?fdisk\b/i,
  /(\|\s*)?\bformat\s+/i,
  /(\|\s*)?sudo\s+(rm|dd|mkfs|fdisk|format|shutdown|reboot|poweroff|init)/i,
  /(\|\s*)?chmod\s+777\s+\//i,
  /(\|\s*)?chown\s/i,
  /(\|\s*)?>(\s*\/dev\/(sda|sdb|sdc|nvme|mmc))/i,
  /(\|\s*)?shred/i,
  /(\|\s*)?:\(\)\s*\{.*(:|;).*\};/i, // fork bomb
  /(\|\s*)?wget\s+-O\s+\/dev\/null/i,
  /(\|\s*)?shutdown\s/i,
  /(\|\s*)?reboot\s?$/i,
  /(\|\s*)?poweroff\s?$/i,
  /(\|\s*)?halt\s?$/i,
];

export function isSafeCommand(command: string): { safe: boolean; reason?: string } {
  // Maksimum komut uzunluğu
  if (command.length > 2000) {
    return { safe: false, reason: `Komut çok uzun (${command.length} karakter, maks. 2000)` };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Güvenlik nedeniyle engellendi: "${pattern}" ile eşleşen komut` };
    }
  }

  return { safe: true };
}

async function toolRunShell(inp: ToolInput): Promise<string> {
  if (!inp.command) throw new Error('command gerekli');

  // Güvenlik kontrolü
  const check = isSafeCommand(inp.command);
  if (!check.safe) {
    if (!autoAllowDangerousCommands) {
      const inquirer = await import('inquirer').then(m => m.default || m);
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: chalk.yellow(`\n⚠️ TEHLİKELİ KOMUT TESPİT EDİLDİ:\n`) + 
                   chalk.white(`   Komut: `) + chalk.cyan(inp.command) + '\n' +
                   chalk.white(`   Sebep: `) + chalk.red(check.reason) + '\n\n' +
                   chalk.bold('Bu komutu çalıştırmak istiyor musunuz?'),
          choices: [
            { name: '❌ İptal Et (Agent\'a hata dön)', value: 'cancel' },
            { name: '✅ Sadece bu seferlik izin ver', value: 'once' },
            { name: '🔥 Bu oturum boyunca HER ŞEYE izin ver (Bir daha sorma)', value: 'always' },
          ],
        }
      ]);

      if (action === 'cancel') {
        throw new Error(`❌ Kullanıcı güvenlik nedeniyle bu komutu reddetti.\nAgent shell komutları sınırlıdır. Dosya işlemleri için write_file/edit_file/read_file tool'larını kullanın.`);
      } else if (action === 'always') {
        autoAllowDangerousCommands = true;
      }
    }
  }

  // Çalışma dizinini proje köküyle sınırla
  const projectRoot = process.cwd();
  const cwd = inp.cwd ? path.resolve(inp.cwd) : projectRoot;

  // Proje dışına çıkışı engelle
  if (!cwd.startsWith(projectRoot)) {
    throw new Error(`❌ Çalışma dizini proje dışına çıkamaz: ${cwd}\nProje kökü: ${projectRoot}`);
  }

  const result = execSync(inp.command, {
    cwd,
    timeout: Math.min(inp.timeout ?? 30, 60) * 1000, // max 60 saniye
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });
  return result || '(çıktı yok)';
}

function toolSearchInFiles(inp: ToolInput): string {
  if (!inp.pattern || !inp.directory) throw new Error('pattern ve directory gerekli');
  const resolved = path.resolve(inp.directory);

  const results: string[] = [];
  if (!fs.existsSync(resolved)) {
    throw new Error(`Yol bulunamadı: ${resolved}`);
  }

  const stats = fs.statSync(resolved);
  if (stats.isFile()) {
    searchFile(resolved, inp.pattern, inp.extension, results);
  } else {
    searchDir(resolved, inp.pattern, inp.extension, results, 0, 5);
  }

  if (results.length === 0) return 'Eşleşme bulunamadı.';
  return results.slice(0, 50).join('\n');
}

function searchDir(
  dir: string,
  pattern: string,
  ext: string | undefined,
  results: string[],
  depth: number,
  maxDepth: number,
): void {
  if (depth > maxDepth || results.length >= 50) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      searchDir(full, pattern, ext, results, depth + 1, maxDepth);
    } else {
      searchFile(full, pattern, ext, results);
    }
  }
}

function searchFile(
  filePath: string,
  pattern: string,
  ext: string | undefined,
  results: string[],
): void {
  if (results.length >= 50) return;
  if (ext && !filePath.endsWith(ext)) return;

  const regex = new RegExp(pattern, 'gi');

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        results.push(`${filePath}:${i + 1}: ${line.trim()}`);
      }
    });
  } catch {
    /* skip binary or unreadable files */
  }
}
