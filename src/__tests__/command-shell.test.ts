import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { resolveCommandShell } from '../services/command-shell';
vi.mock('fs', async original => {
  const actual = await original<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('Shell choice for model commands', () => {
  it('selects Bash on Unix when available, including explicit shell:true callers', () => {
    vi.stubEnv('DEHA_SHELL', ''); vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(resolveCommandShell(undefined, 'linux')).toBe('/bin/bash');
    expect(resolveCommandShell(true, 'linux')).toBe('/bin/bash');
  });
  it('falls back to the system shell when Bash is absent and preserves Windows defaults', () => {
    vi.stubEnv('DEHA_SHELL', ''); vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolveCommandShell(true, 'linux')).toBe(true);
    expect(resolveCommandShell(true, 'win32')).toBe(true);
  });
  it('respects explicit shell choice, disabling the shell and environment overrides', () => {
    vi.stubEnv('DEHA_SHELL', '/bin/sh');
    expect(resolveCommandShell(true, 'linux')).toBe('/bin/sh');
    expect(resolveCommandShell('/usr/bin/zsh', 'linux')).toBe('/usr/bin/zsh');
    expect(resolveCommandShell(false, 'linux')).toBe(false);
  });
});
