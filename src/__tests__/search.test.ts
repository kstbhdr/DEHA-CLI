import { describe, it, expect, vi, beforeEach } from 'vitest';

// https modulunu mock'la — vi.hoisted ile initialize et
const { mockRequest, mockReq, mockRes } = vi.hoisted(() => {
  const mockReq = {
    write: vi.fn(),
    end: vi.fn(),
    setTimeout: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  const mockRes = {
    on: vi.fn(),
    statusCode: 200,
    headers: {} as Record<string, string>,
  };
  const mockRequest = vi.fn((options: any, callback: (res: any) => void) => {
    setTimeout(() => callback(mockRes), 0);
    return mockReq;
  });
  return { mockRequest, mockReq, mockRes };
});

vi.mock('https', () => ({
  default: { request: mockRequest },
  request: mockRequest,
}));

vi.mock('cheerio');

import { toolWebSearch, toolCrawlUrl } from '../tools/search';
import * as cheerio from 'cheerio';

describe('toolWebSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sonuc formatini dondurur', async () => {
    // Cheerio mock: DDG Lite HTML parse
    const cheerioMock = vi.hoisted(() => ({
      load: vi.fn().mockReturnValue((sel: string) => ({
        each: vi.fn((cb: Function) => {
          cb(0, {});
          return { length: 1 };
        }),
        text: vi.fn().mockReturnValue('Test'),
        attr: vi.fn((name: string) => name === 'href' ? 'https://example.com' : ''),
        closest: vi.fn().mockReturnThis(),
        next: vi.fn().mockReturnThis(),
        find: vi.fn().mockReturnThis(),
        last: vi.fn().mockReturnThis(),
      }) as any),
    }));
    vi.mocked(cheerio.load).mockImplementation(cheerioMock.load as any);

    mockRes.statusCode = 200;
    mockRes.on = vi.fn((event: string, cb: Function) => {
      if (event === 'data') cb(Buffer.from('<html><body><a href="https://example.com">Test</a></body></html>'));
      if (event === 'end') cb();
      return mockRes;
    });

    const result = await toolWebSearch({ query: 'test query', max_results: 5 });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('toolCrawlUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('URL icerigini getirir ve temizler', async () => {
    // cheerio load mock
    vi.mocked(cheerio.load).mockReturnValue(vi.fn((sel: string) => ({
      text: vi.fn().mockReturnValue('Test content for crawling'),
      remove: vi.fn(),
      length: sel === 'body' ? 1 : 0,
    }) as any) as any);

    mockRes.statusCode = 200;
    mockRes.headers = {};
    mockRes.on = vi.fn((event: string, cb: Function) => {
      if (event === 'data') cb(Buffer.from('<html><body><article><p>Test content</p></article></body></html>'));
      if (event === 'end') cb();
      return mockRes;
    });

    const result = await toolCrawlUrl({ url: 'https://example.com/test' });
    expect(result).toContain('Test content');
  });

  it('max_chars ile kisaltma yapar', async () => {
    const longText = 'x'.repeat(200);
    vi.mocked(cheerio.load).mockReturnValue(vi.fn((sel: string) => ({
      text: vi.fn().mockReturnValue(longText),
      remove: vi.fn(),
      length: 1,
    }) as any) as any);

    mockRes.on = vi.fn((event: string, cb: Function) => {
      if (event === 'data') cb(Buffer.from(`<html><body>${longText}</body></html>`));
      if (event === 'end') cb();
      return mockRes;
    });

    const result = await toolCrawlUrl({ url: 'https://example.com', max_chars: 10 });
    expect(result.length).toBeLessThanOrEqual(11);
  });

  it('gecersiz URLde hata firlatir', async () => {
    await expect(toolCrawlUrl({ url: 'not-a-url' })).rejects.toThrow();
  });
});
