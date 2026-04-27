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
    description: 'Run a shell command. Use for builds, tests, git operations, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' },
        cwd:     { type: 'string', description: 'Working directory (optional)' },
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

// Sync toollar
export function executeTool(name: string, input: Record<string, unknown>): string {
  const inp = input as ToolInput;
  try {
    switch (name) {
      case 'read_file':       return toolReadFile(inp);
      case 'write_file':      return toolWriteFile(inp);
      case 'edit_file':       return editFile(inp as Parameters<typeof editFile>[0]);
      case 'insert_lines':    return insertLines(inp as Parameters<typeof insertLines>[0]);
      case 'delete_lines':    return deleteLines(inp as Parameters<typeof deleteLines>[0]);
      case 'list_dir':        return toolListDir(inp);
      case 'run_shell':       return toolRunShell(inp);
      case 'search_in_files': return toolSearchInFiles(inp);
      // Async toollar için placeholder — agent.ts'te executeToolAsync kullanılır
      case 'run_terminal':
      case 'run_python':
      case 'smoke_test':
      case 'browser_action':
      case 'vision_analyze':
      case 'web_search':
      case 'crawl_url':
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
    write_file:      '✏️ ',
    edit_file:       '🖊️ ',
    insert_lines:    '➕',
    delete_lines:    '🗑️ ',
    list_dir:        '📁',
    run_shell:       '⚡',
    run_terminal:    '💻',
    run_python:      '🐍',
    smoke_test:      '🧪',
    browser_action:  '🌐',
    vision_analyze:  '👁️ ',
    search_in_files: '🔍',
    web_search:      '🌍',
    crawl_url:       '🕷️ ',
  };
  const icon = icons[name] ?? '🔧';
  const preview = Object.entries(input)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
    .join(', ');
  console.log(chalk.dim(`\n  ${icon} `) + chalk.yellow(name) + chalk.dim(`(${preview})`));
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

function toolRunShell(inp: ToolInput): string {
  if (!inp.command) throw new Error('command gerekli');
  const result = execSync(inp.command, {
    cwd: inp.cwd ?? process.cwd(),
    timeout: 30000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result || '(çıktı yok)';
}

function toolSearchInFiles(inp: ToolInput): string {
  if (!inp.pattern || !inp.directory) throw new Error('pattern ve directory gerekli');
  const resolved = path.resolve(inp.directory);

  const results: string[] = [];
  searchDir(resolved, inp.pattern, inp.extension, results, 0, 5);

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
  const regex = new RegExp(pattern, 'gi');

  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      searchDir(full, pattern, ext, results, depth + 1, maxDepth);
    } else {
      if (ext && !e.name.endsWith(ext)) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (regex.test(line)) {
            results.push(`${full}:${i + 1}: ${line.trim()}`);
          }
        });
      } catch { /* skip binary */ }
    }
  }
}
