import * as https from 'https';
import * as cheerio from 'cheerio';
import { getPlaywright } from './browser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── DuckDuckGo Search ───────────────────────────────────────────────────────

/** DuckDuckGo Lite search via native https (axios triggers bot detection) */
async function ddgLiteFetch(query: string): Promise<string> {
  // Try primary endpoint first, fallback to HTML version
  const endpoints = [
    { hostname: 'lite.duckduckgo.com', path: '/lite/', method: 'POST' as const, makeBody: (q: string) => `q=${encodeURIComponent(q)}&kl=wt-wt` },
    { hostname: 'html.duckduckgo.com', path: '/html/', method: 'POST' as const, makeBody: (q: string) => `q=${encodeURIComponent(q)}` },
  ];

  for (const ep of endpoints) {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const body = ep.makeBody(query);
        const options: https.RequestOptions = {
          hostname: ep.hostname,
          path: ep.path,
          method: ep.method,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `https://${ep.hostname}/`,
            'Origin': `https://${ep.hostname}`,
          },
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode !== 200) reject(new Error(`${ep.hostname} returned ${res.statusCode}`));
            else resolve(data);
          });
        });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error(`${ep.hostname} timeout`)); });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      return result;
    } catch {
      continue; // try next endpoint
    }
  }
  throw new Error('All DuckDuckGo endpoints failed');
}

export async function duckDuckGoSearch(
  query: string,
  maxResults = 8,
): Promise<SearchResult[]> {
  const html = await ddgLiteFetch(query);
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // DDG Lite structure: result links are plain <a href="https://..."> tags
  // Snippet is in the next <tr>'s last <td>
  $('a').each((_, el) => {
    if (results.length >= maxResults) return false;
    const href = $(el).attr('href') ?? '';
    if (!href.startsWith('http') || href.includes('duckduckgo.com')) return;
    const title = $(el).text().trim();
    const row = $(el).closest('tr');
    const nextRow = row.next('tr');
    const snippet = nextRow.find('td').last().text().trim();
    if (title && href) results.push({ title, url: href, snippet });
  });

  return results;
}

// ─── Bing Search (DuckDuckGo fallback'i) ────────────────────────────────────

/**
 * Bing artık ham HTTP isteklerini bot tespiti ile CAPTCHA'ya yönlendiriyor —
 * sadece gerçek bir (headless) tarayıcı üzerinden çalışıyor. Bu yüzden DDG'nin
 * hafif https-only yolundan farklı olarak Playwright kullanıyor. Sonuç
 * linkleri Bing'in kendi tıklama-takip yönlendirmesinden (`bing.com/ck/a?...&u=`)
 * geçiyor; gerçek URL `u=` parametresinin içinde base64 kodlu.
 */
export async function bingSearch(query: string, maxResults = 8): Promise<SearchResult[]> {
  const { chromium } = await getPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForSelector('h2', { timeout: 10000 }).catch(() => {});

    const raw = await page.evaluate((max: number) => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      return h2s.slice(0, max).map((h2) => {
        const a = h2.querySelector('a') ?? h2.closest('a');
        const li = h2.closest('li');
        let snippet = '';
        if (li) {
          const clone = li.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('h2').forEach((x) => x.remove());
          snippet = (clone.textContent ?? '').trim().replace(/\s+/g, ' ');
        }
        return {
          title: (h2.textContent ?? '').trim(),
          href: a ? a.getAttribute('href') : null,
          snippet,
        };
      });
    }, maxResults);

    return raw
      .filter((r): r is { title: string; href: string; snippet: string } => !!r.href && !!r.title)
      .map((r) => ({
        title: r.title,
        url: decodeBingRedirect(r.href),
        snippet: cleanBingSnippet(r.snippet),
      }));
  } finally {
    await browser.close();
  }
}

/** Bing'in `/ck/a?...&u=a1<base64url>&...` tıklama-takip linkinden gerçek URL'i çıkarır. */
function decodeBingRedirect(href: string): string {
  try {
    const u = new URL(href, 'https://www.bing.com');
    const uParam = u.searchParams.get('u');
    if (uParam && uParam.startsWith('a1')) {
      const b64 = uParam.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      return Buffer.from(padded, 'base64').toString('utf-8');
    }
  } catch {
    // decode edilemezse bing redirect linkini olduğu gibi döndür
  }
  return href;
}

/**
 * Bing snippet'in başına, aralarında boşluk olmadan, kısa bir domain breadcrumb'ı
 * ("typescriptlang.org") ve hemen ardından tam URL'i ("https://www.typescriptlang.org/…")
 * yapıştırıyor. Lookahead ile sadece gerçekten bir URL'in hemen öncesindeki domain'i
 * hedefliyoruz, böylece asıl snippet metnine (küçük harfle başlasa bile) dokunmuyor.
 */
function cleanBingSnippet(text: string): string {
  // NOT: `i` bayrağı yok — domain/TLD metni Bing'de her zaman küçük harf, `i`
  // ile eşleştirince TLD deseni ("org") hemen ardından gelen büyük harfli asıl
  // metne ("TypeScript") de taşıp onu yanlışlıkla yutuyordu.
  return text
    .replace(/^[a-z0-9.-]+\.[a-z]{2,24}(?=https?:\/\/)/, '')
    .replace(/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,24}(?:\/\S*)?/, '')
    .trim();
}

// ─── Tool entrypoints ────────────────────────────────────────────────────────

export async function toolWebSearch(input: {
  query: string;
  source?: 'web';
  max_results?: number;
  crawl_top?: number;
}): Promise<string> {
  const { query, max_results = 8, crawl_top = 2 } = input;

  let results: SearchResult[];
  let engine: string;
  try {
    results = await duckDuckGoSearch(query, max_results);
    if (results.length === 0) throw new Error('0 sonuç döndü (sayfa yapısı değişmiş olabilir)');
    engine = 'DuckDuckGo';
  } catch (ddgErr) {
    try {
      results = await bingSearch(query, max_results);
      engine = 'Bing';
    } catch (bingErr) {
      const ddgMsg = ddgErr instanceof Error ? ddgErr.message : String(ddgErr);
      const bingMsg = bingErr instanceof Error ? bingErr.message : String(bingErr);
      throw new Error(
        `Web araması başarısız — DuckDuckGo: ${ddgMsg} | Bing: ${bingMsg}\n` +
        `(Not: Yandex ve Google otomatik sorguları CAPTCHA ile engelliyor; bu iki motor için scraping fallback yok.)`,
      );
    }
  }

  let output = formatResults(engine, results) || 'No results found.';

  if (crawl_top > 0 && results.length > 0) {
    const urlsToCrawl = results.slice(0, crawl_top);
    output += `\n\n=== Crawling Top ${urlsToCrawl.length} Search Results ===\n`;
    for (const res of urlsToCrawl) {
      output += `\n--- Content from: ${res.title} (${res.url}) ---\n`;
      try {
        const pageContent = await toolCrawlUrl({ url: res.url });
        output += pageContent + '\n';
      } catch (err) {
        output += `Error crawling URL: ${err instanceof Error ? err.message : String(err)}\n`;
      }
    }
  }
  
  return output;
}

export async function toolCrawlUrl(input: {
  url: string;
  max_chars?: number;
}): Promise<string> {
  const { url, max_chars = 4000 } = input;

  const html = await new Promise<string>((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    const req = https.request(options, (res) => {
      // Follow redirects (up to 3)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        try {
          const redirectUrl = new URL(res.headers.location, url).toString();
          toolCrawlUrl({ url: redirectUrl, max_chars }).then(resolve).catch(reject);
        } catch { reject(new Error(`Redirect hatası: ${res.headers.location}`)); }
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.end();
  });

  // Extract readable text
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, header, footer, iframe, noscript, meta, link').remove();

  // Try to get main content
  const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '.markdown-body', '.post-content', '.entry-content', 'body'];
  let text = '';
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length > 0 && el.text().trim().length > 100) {
      text = el.text();
      break;
    }
  }
  if (!text) text = $('body').text();

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > max_chars) {
    text = text.slice(0, max_chars) + '…';
  }

  return text || 'Sayfa içeriği alınamadı.';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatResults(source: string, results: SearchResult[]): string {
  if (!results.length) return `**${source}**: No results found.`;
  const lines = results.map((r, i) =>
    `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
  );
  return `**${source} Results:**\n\n${lines.join('\n\n')}`;
}
