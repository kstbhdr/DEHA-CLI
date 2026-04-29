import * as https from 'https';
import * as cheerio from 'cheerio';

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

// ─── Tool entrypoint ─────────────────────────────────────────────────────────

export async function toolWebSearch(input: {
  query: string;
  source?: 'web';
  max_results?: number;
}): Promise<string> {
  const { query, max_results = 8 } = input;
  const results = await duckDuckGoSearch(query, max_results);
  return formatResults('DuckDuckGo', results) || 'No results found.';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatResults(source: string, results: SearchResult[]): string {
  if (!results.length) return `**${source}**: No results found.`;
  const lines = results.map((r, i) =>
    `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
  );
  return `**${source} Results:**\n\n${lines.join('\n\n')}`;
}
