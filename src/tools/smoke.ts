import axios, { AxiosResponse } from 'axios';
import chalk from 'chalk';

export interface SmokeCheck {
  name: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  body?: unknown;
  headers?: Record<string, string>;
  expectedStatus?: number | number[];
  expectedBody?: string;       // response body'de bulunması gereken string
  expectedJson?: Record<string, unknown>; // JSON key-value kontrolleri
  maxMs?: number;              // maksimum yanıt süresi (ms)
  allowInsecure?: boolean;
}

export interface SmokeResult {
  name: string;
  url: string;
  pass: boolean;
  status?: number;
  durationMs: number;
  error?: string;
  failures: string[];
}

export interface SmokeReport {
  total: number;
  passed: number;
  failed: number;
  results: SmokeResult[];
  durationMs: number;
}

// ─── Tek check ──────────────────────────────────────────────────────────────

export async function runSmokeCheck(check: SmokeCheck): Promise<SmokeResult> {
  const start = Date.now();
  const failures: string[] = [];

  let response: AxiosResponse | undefined;
  let error: string | undefined;

  try {
    response = await axios.request({
      url: check.url,
      method: check.method ?? 'GET',
      data: check.body,
      headers: check.headers,
      timeout: check.maxMs ?? 10_000,
      validateStatus: () => true,  // tüm status kodlarını kabul et
    });
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - start;

  if (error) {
    return { name: check.name, url: check.url, pass: false, durationMs, error, failures };
  }

  const status = response!.status;

  // Status kontrolü
  const expectedStatuses = Array.isArray(check.expectedStatus)
    ? check.expectedStatus
    : [check.expectedStatus ?? 200];
  if (!expectedStatuses.includes(status)) {
    failures.push(`Status ${status} ≠ beklenen ${expectedStatuses.join('|')}`);
  }

  // Yanıt süresi kontrolü
  if (check.maxMs && durationMs > check.maxMs) {
    failures.push(`Yanıt süresi ${durationMs}ms > ${check.maxMs}ms`);
  }

  // Body string kontrolü
  if (check.expectedBody) {
    const body = typeof response!.data === 'string'
      ? response!.data
      : JSON.stringify(response!.data);
    if (!body.includes(check.expectedBody)) {
      failures.push(`Response body "${check.expectedBody}" içermiyor`);
    }
  }

  // JSON key kontrolü
  if (check.expectedJson && typeof response!.data === 'object') {
    for (const [key, val] of Object.entries(check.expectedJson)) {
      const actual = (response!.data as Record<string, unknown>)[key];
      if (JSON.stringify(actual) !== JSON.stringify(val)) {
        failures.push(`JSON[${key}] = ${JSON.stringify(actual)} ≠ ${JSON.stringify(val)}`);
      }
    }
  }

  return {
    name: check.name,
    url: check.url,
    pass: failures.length === 0,
    status,
    durationMs,
    failures,
  };
}

// ─── Birden fazla check ──────────────────────────────────────────────────────

export async function runSmokeTests(checks: SmokeCheck[]): Promise<SmokeReport> {
  const start = Date.now();
  const results = await Promise.all(checks.map(runSmokeCheck));

  return {
    total:  results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
    durationMs: Date.now() - start,
  };
}

// ─── Raporu yazdır ───────────────────────────────────────────────────────────

export function printSmokeReport(report: SmokeReport): void {
  console.log('\n' + chalk.bold('═══ Smoke Test Raporu ═══\n'));

  for (const r of report.results) {
    const icon = r.pass ? chalk.green('✓') : chalk.red('✗');
    const name = r.pass ? chalk.white(r.name) : chalk.red(r.name);
    const meta = chalk.dim(`${r.status ?? 'ERR'} • ${r.durationMs}ms`);
    console.log(`  ${icon}  ${name}  ${meta}`);

    if (!r.pass) {
      if (r.error) console.log(chalk.red(`     Hata: ${r.error}`));
      for (const f of r.failures) console.log(chalk.red(`     ✗ ${f}`));
    }
  }

  console.log('');
  const total   = chalk.dim(`Toplam: ${report.total}`);
  const passed  = chalk.green(`✓ ${report.passed}`);
  const failed  = report.failed > 0 ? chalk.red(`✗ ${report.failed}`) : chalk.dim('✗ 0');
  const elapsed = chalk.dim(`${report.durationMs}ms`);
  console.log(`  ${total}  ${passed}  ${failed}  ${elapsed}\n`);
}

// ─── URL'den otomatik check listesi oluştur ──────────────────────────────────

export function buildQuickChecks(baseUrl: string, routes: string[] = ['/']): SmokeCheck[] {
  return routes.map((route) => ({
    name: route === '/' ? 'Ana Sayfa' : route,
    url: baseUrl.replace(/\/$/, '') + route,
    expectedStatus: [200, 201, 301, 302],
    maxMs: 5000,
  }));
}

// ─── Tool versiyonu ─────────────────────────────────────────────────────────

export async function toolSmokeTest(input: {
  url: string;
  routes?: string[];
  expected_status?: number;
  expected_body?: string;
  max_ms?: number;
}): Promise<string> {
  const routes = input.routes ?? ['/'];
  const checks: SmokeCheck[] = routes.map((r) => ({
    name: r,
    url: input.url.replace(/\/$/, '') + r,
    expectedStatus: input.expected_status ? [input.expected_status] : [200, 201, 301, 302],
    expectedBody: input.expected_body,
    maxMs: input.max_ms ?? 5000,
  }));

  const report = await runSmokeTests(checks);
  const lines: string[] = [];
  for (const r of report.results) {
    lines.push(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.status ?? 'ERR'} ${r.durationMs}ms`);
    if (!r.pass) {
      if (r.error) lines.push(`  HATA: ${r.error}`);
      lines.push(...r.failures.map((f) => `  ✗ ${f}`));
    }
  }
  lines.push(`\nSonuç: ${report.passed}/${report.total} geçti`);
  return lines.join('\n');
}
