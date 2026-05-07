import { describe, it, expect, vi, beforeEach } from 'vitest';

// child_process.spawn mock
const mockProc = vi.hoisted(() => ({
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
}));

const mockSpawnFn = vi.hoisted(() => vi.fn(() => mockProc));

vi.mock('child_process', () => ({
  spawn: mockSpawnFn,
}));

import { runCommand, runSequence, toolRunTerminal } from '../tools/terminal';

// Helper: proc'u belli bir cikti ile yapilandir
function setupProc(proc: any, stdout = '', stderr = '', exitCode = 0) {
  proc.stdout.on.mockImplementation((event: string, cb: Function) => {
    if (event === 'data' && stdout) setTimeout(() => cb(Buffer.from(stdout)), 0);
    return proc.stdout;
  });
  proc.stderr.on.mockImplementation((event: string, cb: Function) => {
    if (event === 'data' && stderr) setTimeout(() => cb(Buffer.from(stderr)), 0);
    return proc.stderr;
  });
  proc.on.mockImplementation((event: string, cb: Function) => {
    if (event === 'close') setTimeout(() => cb(exitCode), 5);
    return proc;
  });
  return proc;
}

// Varsayilan proc: basarili, cikti yok
function resetDefaultProc() {
  setupProc(mockProc, '', '', 0);
  mockSpawnFn.mockImplementation(() => mockProc);
  mockProc.kill.mockReset();
}

describe('runCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaultProc();
  });

  it('basarili komutu calistirir ve stdout doner', async () => {
    setupProc(mockProc, 'hello world\n', '', 0);
    const result = await runCommand('echo hello', { shell: true });
    expect(result.stdout).toContain('hello world');
    expect(result.exitCode).toBe(0);
  });

  it('stderr yakalanir', async () => {
    setupProc(mockProc, '', 'hata\n', 1);
    const result = await runCommand('invalid-cmd', { shell: true });
    expect(result.stderr).toContain('hata');
    expect(result.exitCode).toBe(1);
  });

  it('timeout asiminda hata firlatir', async () => {
    // 'close' event'ini tetikleme — timeout'a birak
    mockProc.on.mockReturnValue(mockProc);
    await expect(runCommand('sleep 100', { timeout: 10, shell: true })).rejects.toThrow('Timeout');
    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('spawn hatasinda reject olur', async () => {
    const testErr = new Error('spawn failed');
    mockProc.on.mockImplementation((event: string, cb: Function) => {
      if (event === 'error') setTimeout(() => cb(testErr), 5);
      return mockProc;
    });
    await expect(runCommand('bad', { shell: true })).rejects.toThrow('spawn failed');
  });
});

describe('runSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('komutlari sirayla calistirir', async () => {
    // Her spawn cagrisi icin ayri proc
    const proc1 = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    const proc2 = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    setupProc(proc1, 'first\n', '', 0);
    setupProc(proc2, 'second\n', '', 0);

    let callIdx = 0;
    mockSpawnFn.mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? proc1 : proc2;
    });

    const results = await runSequence(['echo first', 'echo second'], { shell: true });
    expect(results).toHaveLength(2);
    expect(results[0].stdout).toContain('first');
    expect(results[1].stdout).toContain('second');
  });

  it('hata alinca durur', async () => {
    const proc1 = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    const proc2 = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    setupProc(proc1, '', 'error\n', 1);
    setupProc(proc2, 'unreachable\n', '', 0);

    let callIdx = 0;
    mockSpawnFn.mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? proc1 : proc2;
    });

    const results = await runSequence(['cmd1', 'cmd2'], { shell: true });
    expect(results).toHaveLength(1);
  });
});

describe('toolRunTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaultProc();
  });

  it('basarili sonucu formatlar', async () => {
    setupProc(mockProc, 'test output\n', '', 0);
    const result = await toolRunTerminal({ command: 'echo test', timeout: 30 });
    expect(result).toContain('STDOUT');
    expect(result).toContain('test output');
    expect(result).toContain('EXIT: 0');
  });

  it('stderr varsa ekler', async () => {
    setupProc(mockProc, 'ok\n', 'warning\n', 0);
    const result = await toolRunTerminal({ command: 'cmd', timeout: 30 });
    expect(result).toContain('STDOUT');
    expect(result).toContain('STDERR');
    expect(result).toContain('warning');
  });
});
