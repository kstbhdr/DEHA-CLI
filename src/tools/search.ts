import axios from 'axios';
import * as cheerio from 'cheerio';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
}

// ─── DuckDuckGo Search ───────────────────────────────────────────────────────

export async function duckDuckGoSearch(
  query: string,
  maxResults = 8,
): Promise<SearchResult[]> {
  // DuckDuckGo HTML endpoint — no API key needed
  const res = await axios.get('https://html.duckduckgo.com/html/', {
    params: { q: query },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);
  const results: SearchResult[] = [];

  $('.result__body').each((_, el) => {
    if (results.length >= maxResults) return false;

    const titleEl = $(el).find('.result__title a');
    const snippetEl = $(el).find('.result__snippet');

    const title = titleEl.text().trim();
    let url = titleEl.attr('href') ?? '';
    const snippet = snippetEl.text().trim();

    // DuckDuckGo wraps links — extract real URL from uddg param
    if (url.startsWith('//duckduckgo.com/l/')) {
      try {
        const parsed = new URL('https:' + url);
        url = decodeURIComponent(parsed.searchParams.get('uddg') ?? url);
      } catch { /* keep original */ }
    }

    if (title && url) results.push({ title, url, snippet });
  });

  return results;
}

// ─── Generic Web Crawl ───────────────────────────────────────────────────────

export async function crawlPage(url: string, maxChars = 4000): Promise<CrawlResult> {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 15000,
    maxContentLength: 2 * 1024 * 1024, // 2 MB
  });

  const $ = cheerio.load(res.data);

  // Remove noise
  $('script, style, nav, footer, header, .ads, #ads, [aria-hidden="true"]').remove();

  const title = $('title').text().trim() || url;

  // Prefer main content areas
  const mainSelectors = ['main', 'article', '#content', '.content', '#main', '.main', 'body'];
  let content = '';
  for (const sel of mainSelectors) {
    const text = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (text.length > 200) { content = text; break; }
  }

  if (!content) content = $('body').text().replace(/\s+/g, ' ').trim();

  return { url, title, content: content.slice(0, maxChars) };
}

// ─── GitHub Crawl ────────────────────────────────────────────────────────────

export async function crawlGitHub(query: string, maxResults = 5): Promise<SearchResult[]> {
  // GitHub code search — no token needed for basic results
  const res = await axios.get('https://github.com/search', {
    params: { q: query, type: 'repositories' },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);
  const results: SearchResult[] = [];

  $('[data-testid="results-list"] > div, .repo-list-item').each((_, el) => {
    if (results.length >= maxResults) return false;
    const titleEl = $(el).find('a[href*="/"]').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href') ?? '';
    const snippet = $(el).find('p').first().text().trim();
    if (title && href) {
      results.push({ title, url: `https://github.com${href}`, snippet });
    }
  });

  return results;
}

// ─── StackOverflow Crawl ─────────────────────────────────────────────────────

export async function crawlStackOverflow(query: string, maxResults = 5): Promise<SearchResult[]> {
  const res = await axios.get('https://stackoverflow.com/search', {
    params: { q: query },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);
  const results: SearchResult[] = [];

  $('.question-summary, [class*="s-post-summary"]').each((_, el) => {
    if (results.length >= maxResults) return false;
    const titleEl = $(el).find('.question-hyperlink, h3 a').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href') ?? '';
    const snippet = $(el).find('.excerpt, [class*="s-post-summary--content-excerpt"]').first().text().trim();
    if (title && href) {
      const url = href.startsWith('http') ? href : `https://stackoverflow.com${href}`;
      results.push({ title, url, snippet });
    }
  });

  return results;
}

// ─── Tool entrypoint ─────────────────────────────────────────────────────────

export async function toolWebSearch(input: {
  query: string;
  source?: 'web' | 'github' | 'stackoverflow' | 'all';
  max_results?: number;
  crawl_top?: number;
}): Promise<string> {
  const { query, source = 'web', max_results = 8, crawl_top = 0 } = input;

  const parts: string[] = [];

  if (source === 'web' || source === 'all') {
    const results = await duckDuckGoSearch(query, max_results);
    parts.push(formatResults('DuckDuckGo', results));
    if (crawl_top > 0) {
      parts.push(await crawlTopResults(results, crawl_top));
    }
  }

  if (source === 'github' || source === 'all') {
    const results = await crawlGitHub(query, max_results);
    parts.push(formatResults('GitHub', results));
  }

  if (source === 'stackoverflow' || source === 'all') {
    const results = await crawlStackOverflow(query, max_results);
    parts.push(formatResults('StackOverflow', results));
    if (crawl_top > 0 && (source === 'stackoverflow')) {
      parts.push(await crawlTopResults(results, crawl_top));
    }
  }

  return parts.filter(Boolean).join('\n\n---\n\n') || 'No results found.';
}

export async function toolCrawlUrl(input: {
  url: string;
  max_chars?: number;
}): Promise<string> {
  const result = await crawlPage(input.url, input.max_chars ?? 4000);
  return `# ${result.title}\nURL: ${result.url}\n\n${result.content}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatResults(source: string, results: SearchResult[]): string {
  if (!results.length) return `**${source}**: No results found.`;
  const lines = results.map((r, i) =>
    `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
  );
  return `**${source} Results:**\n\n${lines.join('\n\n')}`;
}

async function crawlTopResults(results: SearchResult[], count: number): Promise<string> {
  const top = results.slice(0, count);
  const crawled = await Promise.allSettled(top.map(r => crawlPage(r.url, 2000)));
  const parts = crawled
    .map((r, i) =>
      r.status === 'fulfilled'
        ? `### ${top[i].title}\n${r.value.content}`
        : `### ${top[i].title}\n(Could not fetch page)`,
    );
  return `**Page Contents:**\n\n${parts.join('\n\n---\n\n')}`;
}
