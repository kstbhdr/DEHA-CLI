import { describe, it, expect, vi, beforeEach } from 'vitest';

// Playwright mock
const mockPage = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue({ status: () => 200 }),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  textContent: vi.fn().mockResolvedValue('test content'),
  innerHTML: vi.fn().mockResolvedValue('<p>test</p>'),
  evaluate: vi.fn().mockResolvedValue('eval result'),
  screenshot: vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(undefined),
  check: vi.fn().mockResolvedValue(undefined),
  hover: vi.fn().mockResolvedValue(undefined),
}));

const mockContext = vi.hoisted(() => ({
  newPage: vi.fn().mockResolvedValue(mockPage),
}));

const mockBrowser = vi.hoisted(() => ({
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
}));

const mockChromium = vi.hoisted(() => ({
  launch: vi.fn().mockResolvedValue(mockBrowser),
}));

vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../tools/terminal', () => ({
  runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 100 }),
}));

import { ensurePlaywrightInstalled, runBrowserSession, takeScreenshot, toolBrowserAction, installPlaywright } from '../tools/browser';

describe('ensurePlaywrightInstalled', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('playwright import edilebiliyorsa true doner', async () => {
    const result = await ensurePlaywrightInstalled();
    expect(result).toBe(true);
  });
});

describe('runBrowserSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('navigate action calisir', async () => {
    const results = await runBrowserSession({
      actions: [{ type: 'navigate', url: 'https://example.com' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(mockPage.goto).toHaveBeenCalled();
  });

  it('click action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', selector: '#btn' },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[1].success).toBe(true);
    expect(mockPage.click).toHaveBeenCalledWith('#btn', expect.any(Object));
  });

  it('fill action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'fill', selector: '#input', value: 'test' },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test', expect.any(Object));
  });

  it('getText action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'getText', selector: 'h1' },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(results[1].data).toBe('test content');
  });

  it('getHtml action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'getHtml', selector: 'body' },
      ],
    });
    expect(results[1].success).toBe(true);
  });

  it('evaluate action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'evaluate', code: 'document.title' },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(results[1].data).toBe('eval result');
  });

  it('wait action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'wait', timeout: 500 },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it('waitForSelector action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'waitForSelector', selector: '.loaded' },
      ],
    });
    expect(results[1].success).toBe(true);
  });

  it('scroll action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'scroll' },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(mockPage.evaluate).toHaveBeenCalled();
  });

  it('select action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'select', selector: '#dropdown', value: 'option1' },
      ],
    });
    expect(results[1].success).toBe(true);
  });

  it('screenshot action calisir', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'screenshot', fullPage: true },
      ],
    });
    expect(results[1].success).toBe(true);
    expect(results[1].screenshotPath).toBeTruthy();
  });

  it('hata durumunda FAIL doner ve devami calismaz', async () => {
    mockPage.goto.mockRejectedValueOnce(new Error('Connection refused'));

    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', selector: '#btn' },
      ],
    });
    expect(results[0].success).toBe(false);
    expect(results).toHaveLength(1); // ikinci action calismaz
  });

  it('bilinmeyen action FAIL doner', async () => {
    const results = await runBrowserSession({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'unknown_action' as any },
      ],
    });
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('Bilinmeyen');
  });
});

describe('takeScreenshot', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('screenshot alir ve path doner', async () => {
    const result = await takeScreenshot('https://example.com');
    expect(typeof result).toBe('string');
    expect(result).toContain('.png');
  });

  it('hata durumunda throw eder', async () => {
    mockPage.goto.mockRejectedValueOnce(new Error('fail'));
    await expect(takeScreenshot('https://example.com')).rejects.toThrow();
  });
});

describe('toolBrowserAction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('action sonuclarini formatlar', async () => {
    const result = await toolBrowserAction({
      url: 'https://example.com',
      actions: [{ type: 'click', selector: '#btn' }],
    });
    expect(result).toContain('OK');
    expect(result).toContain('click');
  });
});
