import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_FILE = '.deha/context.md';
const AUTO_CONTEXT_FILE = '.deha/auto-context.md';

// ─── Kullanıcı tanımlı context ──────────────────────────────────────────────

export function getUserContext(): string {
  const file = path.resolve(CONTEXT_FILE);
  if (!fs.existsSync(file)) return '';
  try {
    return fs.readFileSync(file, 'utf-8').trim();
  } catch {
    return '';
  }
}

export function setUserContext(content: string): void {
  const dir = path.resolve('.deha');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.resolve(CONTEXT_FILE), content, 'utf-8');
}

// ─── Otomatik context (proje yapısı) ─────────────────────────────────────────

export interface ProjectSummary {
  language: string;
  entryPoint: string;
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
  hasDockerfile: boolean;
  hasTsconfig: boolean;
  fileCount: number;
  topFiles: string[];
}

export function scanProject(): ProjectSummary {
  const root = path.resolve('.');
  const files = listAllFiles(root);

  return {
    language: detectLanguage(files),
    entryPoint: findEntryPoint(files),
    hasPackageJson: files.includes('package.json'),
    hasRequirementsTxt: files.includes('requirements.txt'),
    hasDockerfile: files.includes('Dockerfile') || files.includes('docker-compose.yml'),
    hasTsconfig: files.includes('tsconfig.json'),
    fileCount: files.length,
    topFiles: files.filter(f => !f.startsWith('.') && !f.includes('node_modules') && !f.includes('.git')).slice(0, 30),
  };
}

function listAllFiles(dir: string, prefix = ''): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git') continue;
        results.push(...listAllFiles(full, rel));
      } else {
        results.push(rel);
      }
    }
  } catch { /* */ }
  return results;
}

function detectLanguage(files: string[]): string {
  if (files.some(f => f.endsWith('.py'))) return 'Python';
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) return 'TypeScript';
  if (files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) return 'JavaScript';
  if (files.some(f => f.endsWith('.go'))) return 'Go';
  if (files.some(f => f.endsWith('.rs'))) return 'Rust';
  if (files.some(f => f.endsWith('.java'))) return 'Java';
  if (files.some(f => f.endsWith('.rb'))) return 'Ruby';
  if (files.some(f => f.endsWith('.php'))) return 'PHP';
  if (files.some(f => f.endsWith('.cs'))) return 'C#';
  return 'Unknown';
}

function findEntryPoint(files: string[]): string {
  const candidates = ['index.ts', 'index.js', 'main.py', 'app.py', 'main.go', 'main.rs', 'cmd/main.go', 'src/index.ts', 'src/main.py', 'bin/cli.ts', 'cli.ts'];
  for (const c of candidates) {
    if (files.includes(c)) return c;
  }
  return files[0] ?? '';
}

export function generateAutoContext(): string {
  const summary = scanProject();
  const lines: string[] = [
    '# Proje Otomatik Context',
    '',
    `**Dil:** ${summary.language}`,
    `**Giriş noktası:** ${summary.entryPoint}`,
    `**Dosya sayısı:** ${summary.fileCount}`,
    summary.hasPackageJson ? '- package.json mevcut' : '',
    summary.hasRequirementsTxt ? '- requirements.txt mevcut' : '',
    summary.hasDockerfile ? '- Dockerfile mevcut' : '',
    summary.hasTsconfig ? '- tsconfig.json mevcut' : '',
    '',
    '## Proje Yapısı (ilk 30 dosya)',
    ...summary.topFiles.map(f => `- \`${f}\``),
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildFullContext(): string {
  const userCtx = getUserContext();
  let autoCtx = '';
  try {
    autoCtx = generateAutoContext();
  } catch { /* */ }

  const parts: string[] = [];
  if (userCtx) parts.push(userCtx);
  if (autoCtx) parts.push(autoCtx);

  return parts.join('\n\n---\n\n');
}
