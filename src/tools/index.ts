import * as fs from 'fs';
import { createTwoFilesPatch } from 'diff';
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
        crawl_top:   { type: 'number', description: 'Fetch full page content from top N results (default: 2)' },
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
  {
    name: 'fetch_url',
    description: 'Send an HTTP request to any URL (GET, POST, PUT, DELETE) with custom headers, body, and timeout. Ideal for testing APIs or checking webhooks.',
    input_schema: {
      type: 'object',
      properties: {
        url:     { type: 'string', description: 'Target URL' },
        method:  { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Custom headers as key-value pairs' },
        body:    { type: 'string', description: 'Request body string (for POST/PUT)' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 15)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'diff_files',
    description: 'Compare two files and show the difference in unified diff format. Useful for reviewing code changes before committing.',
    input_schema: {
      type: 'object',
      properties: {
        file_a:  { type: 'string', description: 'First file path (original)' },
        file_b:  { type: 'string', description: 'Second file path (modified)' },
        context: { type: 'number', description: 'Number of context lines to show (default: 3)' },
      },
      required: ['file_a', 'file_b'],
    },
  },
  {
    name: 'find_files',
    description: 'Find files within a directory matching a glob pattern (e.g. **/*.ts, src/**/*.js). Automatically ignores node_modules, dist, and .git.',
    input_schema: {
      type: 'object',
      properties: {
        pattern:     { type: 'string', description: 'Glob pattern (e.g. **/*.ts, test-*.js)' },
        directory:   { type: 'string', description: 'Directory to search in' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default: 50)' },
      },
      required: ['pattern', 'directory'],
    },
  },
  {
    name: 'git',
    description: 'Execute Git commands in a secure and controlled environment. Read-only commands run instantly, write commands require approval.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Git command to run (e.g. "status", "diff", "commit -m \"msg\"", "push")' },
        cwd:     { type: 'string', description: 'Working directory path (optional)' },
      },
      required: ['command'],
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
      case 'write_file':
      case 'edit_file':
      case 'insert_lines':
      case 'delete_lines':    return `__ASYNC_TOOL__:${name}`;
      case 'list_dir':
      case 'ls':              return toolListDir(inp);
      case 'search_in_files':
      case 'grep':            return toolSearchInFiles(inp);
      case 'mkdir':           return toolMkdir(inp);
      case 'diff_files':      return toolDiffFiles(inp as any);
      case 'find_files':      return toolFindFiles(inp as any);
      // Async toollar için placeholder — agent.ts'te executeToolAsync kullanılır
      case 'run_terminal':
      case 'run_python':
      case 'smoke_test':
      case 'browser_action':
      case 'vision_analyze':
      case 'web_search':
      case 'crawl_url':
      case 'run_shell':
      case 'fetch_url':
      case 'git':
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
      case 'write_file':
        await ensureSafeFileAccess((input as ToolInput).path!, 'write_file');
        return toolWriteFile(input as ToolInput);
      case 'edit_file':
        await ensureSafeFileAccess((input as any).path, 'edit_file');
        return editFile(input as any);
      case 'insert_lines':
        await ensureSafeFileAccess((input as any).path, 'insert_lines');
        return insertLines(input as any);
      case 'delete_lines':
        await ensureSafeFileAccess((input as any).path, 'delete_lines');
        return deleteLines(input as any);
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
      case 'fetch_url':
        return await toolFetchUrl(input as any);
      case 'git':
        return await toolGit(input as any);
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
    fetch_url:       '🌐',
    diff_files:      '📊',
    find_files:       '🔎',
    git:             '🔀',
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

async function ensureSafeFileAccess(filePath: string, operationName: string): Promise<void> {
  if (!filePath) return;
  
  const SENSITIVE_PATTERNS = [
    /keystore/i,
    /\.key$/i,
    /\.pem$/i,
    /id_rsa/i,
    /\.env/i,
    /credentials/i,
    /\.jks$/i,
    /\.p12$/i,
    /secret/i
  ];
  
  const isSensitive = SENSITIVE_PATTERNS.some(p => p.test(filePath));
  if (!isSensitive) return;
  
  if (!autoAllowDangerousCommands) {
    const inquirer = await import('inquirer').then(m => m.default || m);
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.yellow(`\n⚠️ HASSAS DOSYA DEĞİŞİKLİĞİ TESPİT EDİLDİ:\n`) + 
                 chalk.white(`   Dosya: `) + chalk.cyan(filePath) + '\n' +
                 chalk.white(`   İşlem: `) + chalk.red(operationName) + '\n\n' +
                 chalk.bold('Ajan bu dosyanın içeriğini değiştirmek istiyor. İzin veriyor musunuz?'),
        choices: [
          { name: '❌ İptal Et (Agent\'a hata dön)', value: 'cancel' },
          { name: '✅ Sadece bu seferlik izin ver', value: 'once' },
          { name: '🔥 Bu oturum boyunca HER ŞEYE izin ver (Bir daha sorma)', value: 'always' },
        ],
      }
    ]);

    if (action === 'cancel') {
      throw new Error(`❌ Kullanıcı güvenlik nedeniyle '${filePath}' dosyasına '${operationName}' işlemini reddetti.`);
    } else if (action === 'always') {
      autoAllowDangerousCommands = true;
    }
  }
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
    timeout: Math.min(inp.timeout ?? 60, 86400) * 1000, // max 24 saat (86400 saniye)
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


// ─── New Tool Implementations ──────────────────────────────────────────────

async function toolFetchUrl(inp: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number }): Promise<string> {
  const { url, method = 'GET', headers = {}, body, timeout = 15 } = inp;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout * 1000);
  
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(url, {
      method,
      headers,
      body: (method !== 'GET' && method !== 'HEAD' && body) ? body : undefined,
      signal: controller.signal as any
    });
    
    let resBody = await res.text();
    try {
      const json = JSON.parse(resBody);
      resBody = JSON.stringify(json, null, 2);
    } catch {} // Not JSON, keep as text
    
    if (resBody.length > 50000) {
      resBody = resBody.slice(0, 50000) + `\n\n[TRUNCATED: Response body exceeded 50KB. Original size: ${resBody.length} bytes]`;
    }
    
    return `HTTP ${res.status} ${res.statusText}\nHeaders: ${JSON.stringify(res.headers.raw())}\n\n${resBody}`;
  } finally {
    clearTimeout(id);
  }
}

function toolDiffFiles(inp: { file_a: string; file_b: string; context?: number }): string {
  const pathA = path.resolve(inp.file_a);
  const pathB = path.resolve(inp.file_b);
  const ctx = inp.context ?? 3;
  
  let contentA = '', contentB = '';
  if (fs.existsSync(pathA)) contentA = fs.readFileSync(pathA, 'utf-8');
  if (fs.existsSync(pathB)) contentB = fs.readFileSync(pathB, 'utf-8');
  
  if (!contentA && !contentB) return 'İki dosya da bulunamadı.';
  
  const patch = createTwoFilesPatch(pathA, pathB, contentA, contentB, '', '', { context: ctx });
  return patch || 'Fark bulunamadı (dosyalar aynı).';
}

function toolFindFiles(inp: { pattern: string; directory: string; max_results?: number }): string {
  const { minimatch } = require('minimatch');
  const dir = path.resolve(inp.directory);
  const pattern = inp.pattern;
  const max = inp.max_results ?? 50;
  
  if (!fs.existsSync(dir)) throw new Error(`Dizin bulunamadı: ${dir}`);
  
  const results = [];
  
  function walk(currentDir: string, depth: number) {
    if (depth > 10 || results.length >= max) return;
    
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch { return; }
    
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      
      const fullPath = path.join(currentDir, e.name);
      const relPath = path.relative(dir, fullPath).replace(/\\/g, '/'); // Normalize to forward slash for minimatch
      
      if (e.isDirectory()) {
        walk(fullPath, depth + 1);
      } else {
        if (minimatch(relPath, pattern, { matchBase: true, dot: true })) {
          const size = fs.statSync(fullPath).size;
          results.push(`${fullPath} (${Math.round(size/1024)} KB)`);
        }
      }
    }
  }
  
  walk(dir, 0);
  
  if (results.length === 0) return 'Eşleşen dosya bulunamadı.';
  if (results.length >= max) results.push(`\n[TRUNCATED: Maksimum limit (${max}) ulaşıldı]`);
  return results.join('\n');
}

async function toolGit(inp: { command: string; cwd?: string }): Promise<string> {
  let cmd = inp.command.trim();
  if (cmd.startsWith('git ')) cmd = cmd.substring(4);
  
  const safeCommands = ['status', 'diff', 'log', 'branch', 'show', 'blame', 'ls-files'];
  const baseCmd = cmd.split(' ')[0];
  const isSafe = safeCommands.includes(baseCmd);
  
  if (!isSafe && !autoAllowDangerousCommands) {
      const inquirer = await import('inquirer').then(m => m.default || m);
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: chalk.yellow(`\n⚠️ GIT DEĞİŞİKLİK KOMUTU:\n`) + 
                   chalk.white(`   Komut: `) + chalk.cyan(`git ${cmd}`) + '\n\n' +
                   chalk.bold('Bu işlemi onaylıyor musunuz?'),
          choices: [
            { name: '❌ İptal Et', value: 'cancel' },
            { name: '✅ İzin ver', value: 'once' },
            { name: '🔥 Her zaman izin ver', value: 'always' },
          ],
        }
      ]);

      if (action === 'cancel') {
        throw new Error(`❌ Kullanıcı git işlemini iptal etti.`);
      } else if (action === 'always') {
        autoAllowDangerousCommands = true;
      }
  }
  
  const cwd = inp.cwd ? path.resolve(inp.cwd) : process.cwd();
  try {
    const result = execSync(`git ${cmd}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result || '(çıktı yok)';
  } catch (err: any) {
    throw new Error(`Git hatası: ${err.stderr || err.message}`);
  }
}
