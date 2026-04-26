import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { ToolDefinition } from '../services/ai-service';
import { toolRunTerminal } from './terminal';
import { toolRunPython } from './python';
import { toolSmokeTest } from './smoke';
import { toolBrowserAction } from './browser';
import { editFile, insertLines, deleteLines } from './edit';
// vision tool DehaConfig gerektirdiği için agent.ts'te özel handle edilir

// ─── Tool Tanımları (Claude API şeması) ────────────────────────────────────

export const DEHA_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Bir dosyanın içeriğini okur. Kod analizi, hata ayıklama veya dosya inceleme için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Okunacak dosyanın yolu (mutlak veya göreceli)' },
        start_line: { type: 'number', description: 'Başlangıç satırı (opsiyonel)' },
        end_line: { type: 'number', description: 'Bitiş satırı (opsiyonel)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Bir dosyaya içerik yazar veya var olan dosyayı günceller.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Yazılacak dosyanın yolu' },
        content: { type: 'string', description: 'Dosyaya yazılacak içerik' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'Bir klasörün içeriğini listeler.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Listelenecek klasörün yolu' },
        recursive: { type: 'boolean', description: 'Alt klasörleri de listele (varsayılan: false)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_shell',
    description: 'Kabuk komutu çalıştırır. Derleme, test, git gibi işlemler için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Çalıştırılacak komut' },
        cwd: { type: 'string', description: 'Çalışma dizini (opsiyonel)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'edit_file',
    description: 'Dosyada belirli bir kodu değiştirir — tüm dosyayı yeniden yazmadan. Token tasarrufu için write_file yerine bunu kullan. old_string tam eşleşme gerektirir (girinti dahil).',
    input_schema: {
      type: 'object',
      properties: {
        path:        { type: 'string', description: 'Düzenlenecek dosyanın yolu' },
        old_string:  { type: 'string', description: 'Değiştirilecek mevcut kod (tam eşleşme, boşluklar dahil)' },
        new_string:  { type: 'string', description: 'Yeni kod' },
        replace_all: { type: 'boolean', description: 'Tüm eşleşmeleri değiştir (varsayılan: false)' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'insert_lines',
    description: 'Dosyaya belirtilen satır numarasından önce yeni satırlar ekler.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Dosya yolu' },
        line:    { type: 'number', description: 'Bu satırdan ÖNCE ekle (1-indexed, 0 = başa)' },
        content: { type: 'string', description: 'Eklenecek içerik' },
      },
      required: ['path', 'line', 'content'],
    },
  },
  {
    name: 'delete_lines',
    description: 'Dosyadan belirtilen satır aralığını siler.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Dosya yolu' },
        from_line: { type: 'number', description: 'Başlangıç satırı (1-indexed, dahil)' },
        to_line:   { type: 'number', description: 'Bitiş satırı (1-indexed, dahil)' },
      },
      required: ['path', 'from_line', 'to_line'],
    },
  },
  {
    name: 'search_in_files',
    description: 'Klasördeki dosyalarda metin arar (grep benzeri).',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Aranacak metin veya regex' },
        directory: { type: 'string', description: 'Aranacak klasör' },
        extension: { type: 'string', description: 'Dosya uzantısı filtresi (ör: .ts, .py)' },
      },
      required: ['pattern', 'directory'],
    },
  },
  {
    name: 'run_terminal',
    description: 'Terminal komutu çalıştırır ve çıktıyı döner. run_shell\'den farkı: timeout ve env desteği.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Çalıştırılacak komut' },
        cwd: { type: 'string', description: 'Çalışma dizini' },
        timeout: { type: 'number', description: 'Timeout saniye cinsinden (varsayılan: 30)' },
        env: { type: 'object', description: 'Ek çevresel değişkenler' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_python',
    description: 'Python kodu çalıştırır. Snippet veya dosya yolu kabul eder.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Çalıştırılacak Python kodu' },
        file: { type: 'string', description: 'Çalıştırılacak .py dosyasının yolu' },
        packages: { type: 'array', items: { type: 'string' }, description: 'Kurulacak pip paketleri' },
        cwd: { type: 'string', description: 'Çalışma dizini' },
        timeout: { type: 'number', description: 'Timeout saniye (varsayılan: 30)' },
        use_venv: { type: 'boolean', description: 'Sanal ortam kullan' },
      },
    },
  },
  {
    name: 'smoke_test',
    description: 'HTTP endpoint(lerin) sağlık kontrolünü yapar.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Test edilecek base URL' },
        routes: { type: 'array', items: { type: 'string' }, description: 'Test edilecek rotalar (varsayılan: ["/"])' },
        expected_status: { type: 'number', description: 'Beklenen HTTP status kodu' },
        expected_body: { type: 'string', description: 'Response body\'de bulunması gereken string' },
        max_ms: { type: 'number', description: 'Maksimum yanıt süresi (ms)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_action',
    description: 'Tarayıcı otomasyonu: navigate, click, fill, screenshot, getText. Playwright kullanır.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Başlangıç URL\'i' },
        actions: {
          type: 'array',
          description: 'Sırayla yapılacak işlemler',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['click', 'fill', 'screenshot', 'wait', 'getText', 'getHtml', 'evaluate', 'scroll', 'waitForSelector'] },
              selector: { type: 'string' },
              value: { type: 'string' },
              code: { type: 'string' },
              timeout: { type: 'number' },
            },
            required: ['type'],
          },
        },
        headless: { type: 'boolean', description: 'Görünmez mod (varsayılan: true)' },
      },
      required: ['url', 'actions'],
    },
  },
  {
    name: 'vision_analyze',
    description: 'URL\'nin ekran görüntüsünü al ve vision model ile analiz et. UI hataları, layout sorunları, erişilebilirlik tespiti.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Analiz edilecek web sayfası URL\'i' },
        image_path: { type: 'string', description: 'Mevcut görüntü dosyasının yolu' },
        prompt: { type: 'string', description: 'Vision modele özel soru/talimat' },
        full_page: { type: 'boolean', description: 'Tüm sayfayı yakala (varsayılan: false)' },
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
