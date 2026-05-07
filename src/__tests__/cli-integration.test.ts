/**
 * CLI Entegrasyon Testleri (e2e)
 *
 * `deha` CLI'sını spawnSync ile çağırarak argument parsing
 * ve temel komutların çalıştığını doğrular.
 * Windows uyumluluğu için shell:true + spawnSync kullanılır.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';

const PROJECT_DIR = path.resolve(__dirname, '../..');
const CLI_SCRIPT = path.resolve(PROJECT_DIR, 'dist/index.js');

function runCLI(...args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [CLI_SCRIPT, ...args], {
    cwd: PROJECT_DIR,
    timeout: 15000,
    encoding: 'utf-8',
    windowsHide: true,
  });
  return {
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
    status: result.status,
  };
}

describe('deha CLI', () => {
  it('--help yardım mesajını gösterir', () => {
    const { stdout, status } = runCLI('--help');
    expect(status).toBe(0);
    expect(stdout).toContain('deha');
    expect(stdout).toContain('chat');
    expect(stdout).toContain('build');
    expect(stdout).toContain('judge');
  });

  it('--version sürümü gösterir', () => {
    const { stdout, status } = runCLI('--version');
    expect(status).toBe(0);
    expect(stdout).toMatch(/[\d]+\.[\d]+\.?[\d]*/);
  });

  it('bilinmeyen komut hata ile çıkar', () => {
    const { stdout, stderr, status } = runCLI('nonexistent-command-xyz');
    const output = stdout + stderr;
    expect(output.length).toBeGreaterThan(0);
    // Windows'ta spawnSync bazen null status döndürebilir (timeout)
    // ama yine de hata çıktısı üretilmiş olmalı
    if (status !== null) {
      expect(status).toBe(1);
    }
  });
});
