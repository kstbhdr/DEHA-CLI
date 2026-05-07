import { copyFile, access, writeFile, readFile } from 'fs/promises';
import { constants, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createInterface } from 'readline';
import { promisify } from 'util';
import { execSync } from 'child_process';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function rlQuestion(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  console.log(`\n${BOLD}${CYAN}⚡ DEHA Project Initialization${RESET}\n`);

  // 1. .env dosyası
  const envPath = resolve(cwd, '.env');
  const envExamplePath = resolve(cwd, '.env.example');
  const packageEnvPath = resolve(__dirname, '../../.env.example');

  try {
    await access(envPath, constants.R_OK);
    const answer = await rlQuestion(`  ${YELLOW}⚠${RESET} .env already exists. Overwrite? (y/N) `);
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(`  ${YELLOW}→${RESET} Skipped .env`);
    } else {
      await copyDotenv(envPath, envExamplePath, packageEnvPath);
    }
  } catch {
    await copyDotenv(envPath, envExamplePath, packageEnvPath);
  }

  // 2. API key'leri interactive sor
  console.log(`\n${BOLD}API Keys${RESET} (leave blank to skip)`);
  let envContent = '';
  try {
    envContent = await readFile(envPath, 'utf-8');
  } catch {
    envContent = '';
  }

  const keys = [
    { var: 'OPENAI_API_KEY', label: 'OpenAI API Key', prefix: 'sk-' },
    { var: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', prefix: 'sk-ant-' },
    { var: 'GROQ_API_KEY', label: 'Groq API Key', prefix: 'gsk_' },
    { var: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', prefix: 'sk-' },
    { var: 'XAI_API_KEY', label: 'xAI API Key', prefix: 'xai-' },
    { var: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', prefix: 'sk-or-' },
  ];

  for (const key of keys) {
    const existing = envContent.match(new RegExp(`^${key.var}=(.+)$`, 'm'));
    const currentVal = existing ? existing[1] : '';
    const masked = currentVal ? currentVal.slice(0, 8) + '…' : '(not set)';
    const answer = await rlQuestion(`  ${key.label} [${masked}]: `);
    if (answer) {
      // Replace or add
      if (envContent.includes(`${key.var}=`)) {
        envContent = envContent.replace(new RegExp(`^${key.var}=.*$`, 'm'), `${key.var}=${answer}`);
      } else {
        envContent += `\n${key.var}=${answer}`;
      }
    }
  }

  await writeFile(envPath, envContent.trim() + '\n', 'utf-8');
  console.log(`  ${GREEN}✔${RESET} .env updated\n`);

  // 3. MCP config dosyası
  const mcpPath = resolve(cwd, 'mcp.json');
  try {
    await access(mcpPath, constants.R_OK);
    console.log(`  ${GREEN}✔${RESET} mcp.json already exists`);
  } catch {
    const answer = await rlQuestion(`  Create default mcp.json? (Y/n) `);
    if (answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no') {
      const defaultMcp = {
        mcpServers: {
          fetch: { command: 'uvx', args: ['mcp-server-fetch'] },
          playwright: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
        },
      };
      await writeFile(mcpPath, JSON.stringify(defaultMcp, null, 2) + '\n', 'utf-8');
      console.log(`  ${GREEN}✔${RESET} mcp.json created`);
    }
  }

  // 4. Playwright kontrolü
  console.log(`\n${BOLD}Dependencies${RESET}`);
  try {
    execSync('npx playwright --version', { stdio: 'pipe', timeout: 10_000 });
    const answer = await rlQuestion(`  Install Playwright Chromium browser? (Y/n) `);
    if (answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no') {
      console.log(`  ${YELLOW}→${RESET} Installing Chromium...`);
      execSync('npx playwright install chromium', { stdio: 'inherit', timeout: 120_000 });
      console.log(`  ${GREEN}✔${RESET} Chromium installed`);
    }
  } catch {
    console.log(`  ${YELLOW}⚠${RESET} Playwright not found. Run: npm install playwright`);
  }

  // 5. .deha/ dizini
  const dehaDir = resolve(cwd, '.deha');
  if (!existsSync(dehaDir)) {
    const { mkdir } = await import('fs/promises');
    await mkdir(dehaDir, { recursive: true });
    await writeFile(join(dehaDir, '.gitkeep'), '', 'utf-8');
    console.log(`  ${GREEN}✔${RESET} .deha/ directory created`);
  }

  console.log(`\n${GREEN}${BOLD}✅ DEHA initialization complete!${RESET}`);
  console.log(`  ${YELLOW}→${RESET} Run ${BOLD}deha doctor${RESET} to verify setup\n`);
}

async function copyDotenv(envPath: string, envExamplePath: string, packageEnvPath: string): Promise<void> {
  try {
    await access(envExamplePath, constants.R_OK);
    await copyFile(envExamplePath, envPath);
    console.log(`  ${GREEN}✔${RESET} .env created from .env.example`);
  } catch {
    try {
      await access(packageEnvPath, constants.R_OK);
      await copyFile(packageEnvPath, envPath);
      console.log(`  ${GREEN}✔${RESET} .env created from package .env.example`);
    } catch {
      // Create minimal .env
      const minimal = `# DEHA Configuration\n# Get API keys from your provider's dashboard\n\nOPENAI_API_KEY=\nANTHROPIC_API_KEY=\nGROQ_API_KEY=\nDEEPSEEK_API_KEY=\nXAI_API_KEY=\nOPENROUTER_API_KEY=\n`;
      await writeFile(envPath, minimal, 'utf-8');
      console.log(`  ${GREEN}✔${RESET} Minimal .env created`);
    }
  }
}
