import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { runCommand } from './terminal';
import { logger } from '../services/logger';

// Playwright lazy import — yüklü değilse kullanıcıya sor
async function getPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'Playwright yüklü değil.\n' +
      'Kurmak için: npx playwright install --with-deps chromium\n' +
      'veya:        npm install -g playwright && playwright install chromium',
    );
  }
}

export interface BrowserAction {
  type:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'screenshot'
    | 'wait'
    | 'evaluate'
    | 'getText'
    | 'getHtml'
    | 'scroll'
    | 'hover'
    | 'select'
    | 'check'
    | 'waitForSelector';
  selector?: string;
  value?: string;
  url?: string;
  code?: string;        // evaluate için JS kodu
  timeout?: number;
  outputPath?: string;  // screenshot kayıt yolu
  fullPage?: boolean;
}

export interface BrowserSession {
  actions: BrowserAction[];
  baseUrl?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface ActionResult {
  action: string;
  success: boolean;
  data?: string;
  screenshotPath?: string;
  error?: string;
}

// ─── Oturum çalıştır ─────────────────────────────────────────────────────────

export async function runBrowserSession(session: BrowserSession): Promise<ActionResult[]> {
  const { chromium } = await getPlaywright();
  const results: ActionResult[] = [];

  const browser = await chromium.launch({ headless: session.headless ?? true });
  const context = await browser.newContext({
    viewport: session.viewport ?? { width: 1280, height: 720 },
    userAgent: session.userAgent,
  });
  const page = await context.newPage();

  try {
    for (const action of session.actions) {
      const result = await runAction(page, action, session.baseUrl);
      results.push(result);
      if (!result.success) break; // hata varsa dur
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ─── Tek action ──────────────────────────────────────────────────────────────

async function runAction(
  page: import('playwright').Page,
  action: BrowserAction,
  baseUrl?: string,
): Promise<ActionResult> {
  const timeout = action.timeout ?? 10_000;

  try {
    switch (action.type) {
      case 'navigate': {
        const url = action.url?.startsWith('http') ? action.url : `${baseUrl}${action.url}`;
        const resp = await page.goto(url!, { timeout, waitUntil: 'networkidle' });
        return { action: `navigate(${url})`, success: true, data: `Status: ${resp?.status()}` };
      }

      case 'click': {
        await page.click(action.selector!, { timeout });
        return { action: `click(${action.selector})`, success: true };
      }

      case 'fill': {
        await page.fill(action.selector!, action.value ?? '', { timeout });
        return { action: `fill(${action.selector})`, success: true };
      }

      case 'select': {
        await page.selectOption(action.selector!, action.value ?? '', { timeout });
        return { action: `select(${action.selector})`, success: true };
      }

      case 'check': {
        await page.check(action.selector!, { timeout });
        return { action: `check(${action.selector})`, success: true };
      }

      case 'hover': {
        await page.hover(action.selector!, { timeout });
        return { action: `hover(${action.selector})`, success: true };
      }

      case 'scroll': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => (globalThis as any).window?.scrollBy(0, 500));
        return { action: 'scroll', success: true };
      }

      case 'wait': {
        await page.waitForTimeout(action.timeout ?? 1000);
        return { action: `wait(${action.timeout}ms)`, success: true };
      }

      case 'waitForSelector': {
        await page.waitForSelector(action.selector!, { timeout });
        return { action: `waitForSelector(${action.selector})`, success: true };
      }

      case 'getText': {
        const text = await page.textContent(action.selector ?? 'body', { timeout });
        return { action: `getText(${action.selector})`, success: true, data: text ?? '' };
      }

      case 'getHtml': {
        const html = await page.innerHTML(action.selector ?? 'body', { timeout });
        return { action: `getHtml(${action.selector})`, success: true, data: html.slice(0, 2000) };
      }

      case 'evaluate': {
        const result = await page.evaluate(action.code ?? '""');
        return { action: `evaluate(...)`, success: true, data: String(result) };
      }

      case 'screenshot': {
        const screenshotDir = path.join(os.homedir(), '.deha', 'screenshots');
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

        const fileName = action.outputPath
          ?? path.join(screenshotDir, `screenshot_${Date.now()}.png`);

        await page.screenshot({ path: fileName, fullPage: action.fullPage ?? false });
        return { action: 'screenshot', success: true, screenshotPath: fileName };
      }

      default:
        return { action: action.type, success: false, error: 'Bilinmeyen action' };
    }
  } catch (err: unknown) {
    return {
      action: action.type,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Hızlı screenshot ────────────────────────────────────────────────────────

export async function takeScreenshot(
  url: string,
  opts: { fullPage?: boolean; outputPath?: string; waitMs?: number } = {},
): Promise<string> {
  const results = await runBrowserSession({
    actions: [
      { type: 'navigate', url },
      ...(opts.waitMs ? [{ type: 'wait' as const, timeout: opts.waitMs }] : []),
      { type: 'screenshot', fullPage: opts.fullPage, outputPath: opts.outputPath },
    ],
    headless: true,
  });

  const shot = results.find((r) => r.screenshotPath);
  if (!shot?.screenshotPath) {
    const err = results.find((r) => !r.success);
    throw new Error(err?.error ?? 'Screenshot alınamadı');
  }
  return shot.screenshotPath;
}

// ─── Playwright kurulum yardımcısı ───────────────────────────────────────────

export async function ensurePlaywrightInstalled(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

export async function installPlaywright(): Promise<void> {
  logger.write(chalk.cyan('\nPlaywright kuruluyor...\n'));
  await runCommand('npm install -g playwright', { stream: true, timeout: 120_000 });
  await runCommand('npx playwright install chromium', { stream: true, timeout: 300_000 });
}

// ─── Tool versiyonu ─────────────────────────────────────────────────────────

export async function toolBrowserAction(input: {
  url: string;
  actions: Array<{
    type: string;
    selector?: string;
    value?: string;
    code?: string;
    timeout?: number;
  }>;
  headless?: boolean;
}): Promise<string> {
  const actions = input.actions.map((a) => ({
    ...a,
    type: a.type as BrowserAction['type'],
  }));

  // Screenshot action'ı varsa screenshot dir'i hazırla
  const results = await runBrowserSession({
    actions: [{ type: 'navigate', url: input.url }, ...actions],
    headless: input.headless ?? true,
  });

  const lines = results.map((r) => {
    const status = r.success ? 'OK' : 'FAIL';
    const extra = r.data ? ` → ${r.data.slice(0, 100)}` : '';
    const shot = r.screenshotPath ? ` → ${r.screenshotPath}` : '';
    const err = r.error ? ` HATA: ${r.error}` : '';
    return `${status} ${r.action}${extra}${shot}${err}`;
  });

  return lines.join('\n');
}
