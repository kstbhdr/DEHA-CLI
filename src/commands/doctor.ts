import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { logger } from '../services/logger';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(label: string, detail = '') {
  passed++;
  logger.write(`  ${GREEN}✔${RESET} ${label}${detail ? ` ${YELLOW}(${detail})${RESET}` : ''}`);
}

function fail(label: string, hint: string) {
  failed++;
  logger.write(`  ${RED}✘${RESET} ${label}`);
  logger.write(`    ${YELLOW}→${RESET} ${hint}`);
}

function warn(label: string, hint: string) {
  warnings++;
  logger.write(`  ${YELLOW}⚠${RESET} ${label}`);
  logger.write(`    ${YELLOW}→${RESET} ${hint}`);
}

async function checkPlaywright(): Promise<void> {
  try {
    // Check if playwright is installed
    const browsers = execSync('npx playwright --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    ok('Playwright installed', browsers.trim());

    // Check if chromium browser is available
    try {
      const chromiumPath = execSync('npx playwright install --dry-run chromium', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      if (chromiumPath.includes('already installed') || chromiumPath.includes('No install')) {
        ok('Playwright Chromium browser', 'installed');
      } else {
        warn('Playwright Chromium browser', 'Not installed. Run: npx playwright install chromium');
      }
    } catch {
      warn('Playwright Chromium browser', 'Could not verify. Run: npx playwright install chromium');
    }
  } catch {
    fail('Playwright', 'Not installed. Run: npm install playwright');
  }
}

async function checkPython(): Promise<void> {
  try {
    const version = execSync('python --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    ok('Python', version.trim());
  } catch {
    try {
      const version = execSync('python3 --version', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
      });
      ok('Python (python3)', version.trim());
    } catch {
      fail('Python', 'Python not found. Install Python 3.10+ from https://python.org');
    }
  }
}

async function checkNode(): Promise<void> {
  try {
    const version = execSync('node --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    const verNum = parseInt(version.trim().replace('v', '').split('.')[0], 10);
    if (verNum >= 18) {
      ok('Node.js', version.trim());
    } else {
      fail('Node.js', `Version ${version.trim()} is too old. Need 18+.`);
    }
  } catch {
    fail('Node.js', 'Node.js not found. Install from https://nodejs.org');
  }
}

async function checkOllama(): Promise<void> {
  try {
    const version = execSync('ollama --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    ok('Ollama', version.trim());

    // Check if ollama server is running
    try {
      const res = execSync('ollama list', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      ok('Ollama server', 'running');
      const models = res.split('\n').filter(l => l.includes(':')).length;
      if (models > 0) {
        ok(`Ollama models`, `${models} model(s) available`);
      } else {
        warn('Ollama models', 'No models pulled. Run: ollama pull <model>');
      }
    } catch {
      fail('Ollama server', 'Server not running. Start with: ollama serve');
    }
  } catch {
    warn('Ollama', 'Not installed. Optional unless using local models.');
  }
}

async function checkEnvFile(): Promise<void> {
  const envPath = resolve(process.cwd(), '.env');
  try {
    await access(envPath, constants.R_OK);
    const content = await readFile(envPath, 'utf-8');
    const openaiMatch = content.match(/^OPENAI_API_KEY=(.+)$/m);
    const anthropicMatch = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    const groqMatch = content.match(/^GROQ_API_KEY=(.+)$/m);

    if (openaiMatch && openaiMatch[1].trim()) ok('OPENAI_API_KEY', 'set');
    else warn('OPENAI_API_KEY', 'Not set in .env');

    if (anthropicMatch && anthropicMatch[1].trim()) ok('ANTHROPIC_API_KEY', 'set');
    else warn('ANTHROPIC_API_KEY', 'Not set in .env');

    if (groqMatch && groqMatch[1].trim()) ok('GROQ_API_KEY', 'set');
    else warn('GROQ_API_KEY', 'Not set in .env');
  } catch {
    warn('.env file', 'Not found. Run: deha init or copy .env.example to .env');
  }
}

async function checkMCPConfig(): Promise<void> {
  const mcpPath = resolve(process.cwd(), 'mcp.json');
  try {
    await access(mcpPath, constants.R_OK);
    const content = await readFile(mcpPath, 'utf-8');
    try {
      JSON.parse(content);
      ok('mcp.json', 'valid JSON');
    } catch {
      fail('mcp.json', 'Invalid JSON format');
    }
  } catch {
    warn('mcp.json', 'Not found. Optional MCP configuration file.');
  }
}

async function checkDiskSpace(): Promise<void> {
  try {
    const cmd = process.platform === 'win32'
      ? 'fsutil volume diskfree C:'
      : 'df -h .';
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    ok('Disk access', 'readable');
  } catch {
    warn('Disk space', 'Could not check (non-critical)');
  }
}

export async function doctor() {
  logger.write(`\n${BOLD}🔍 DEHA Diagnostic Report${RESET}\n`);
  logger.write(`${BOLD}System Checks${RESET}`);

  await checkNode();
  await checkPython();
  await checkPlaywright();
  await checkOllama();

  logger.write(`\n${BOLD}Configuration Checks${RESET}`);
  await checkEnvFile();
  await checkMCPConfig();

  logger.write(`\n${BOLD}Environment Checks${RESET}`);
  await checkDiskSpace();

  const total = passed + failed + warnings;
  const emoji = failed === 0 ? '✅' : '❌';
  logger.write(`\n${emoji} ${BOLD}Results${RESET}: ${passed} passed, ${failed} failed, ${warnings} warnings (${total} total)`);

  if (failed > 0) {
    logger.write(`\n${YELLOW}Tip:${RESET} Fix the failed checks first, then re-run ${BOLD}deha doctor${RESET}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}
