/**
 * CLI Entegrasyon Testleri (e2e)
 *
 * `deha` CLI'sını execSync ile çağırarak argument parsing
 * ve temel komutların çalıştığını doğrular.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_DIR = path.resolve(__dirname, '../..');
const CLI = `node "${path.resolve(PROJECT_DIR, 'dist/index.js')}"`;

describe('deha CLI', () => {
  it('--help yardım mesajını gösterir', () => {
    const out = execSync(`${CLI} --help`, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(out).toContain('deha');
    expect(out).toContain('chat');
    expect(out).toContain('build');
    expect(out).toContain('judge');
  });

  it('--version sürümü gösterir', () => {
    const out = execSync(`${CLI} --version`, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(out).toMatch(/[\d]+\.[\d]+\.[\d]+/);
  });

  it('bilinmeyen komut hata ile çıkar', () => {
    try {
      execSync(`${CLI} nonexistent-command-xyz`, {
        cwd: PROJECT_DIR,
        encoding: 'utf-8',
        timeout: 10000,
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number; signal?: string };
      const output = ((e.stdout || '').toString()) + ((e.stderr || '').toString());
      expect(output.length).toBeGreaterThan(0);
      expect(e.signal).toBeUndefined();
      expect(e.status).toBe(1);
    }
  });
});
