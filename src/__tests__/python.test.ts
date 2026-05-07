import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// terminal.runCommand mock
const mockRunCommand = vi.hoisted(() => vi.fn());
vi.mock('../tools/terminal', () => ({
  runCommand: mockRunCommand,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import path from 'path';
import os from 'os';

const { detectPython, runPythonCode, toolRunPython, createVenv, installRequirements } = await import('../tools/python');

describe('detectPython', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('python3 bulunursa python3 dondurur', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'Python 3.11.0\n', stderr: '', exitCode: 0, duration: 100 });
    const result = await detectPython();
    expect(result).toBe('python3');
  });

  it('python bulunursa python dondurur', async () => {
    mockRunCommand
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue({ stdout: 'Python 3.11.0\n', stderr: '', exitCode: 0, duration: 100 });
    const result = await detectPython();
    expect(result).toBe('python');
  });

  it('hicbiri bulunamazsa null dondurur', async () => {
    mockRunCommand.mockRejectedValue(new Error('not found'));
    const result = await detectPython();
    expect(result).toBeNull();
  });
});

describe('runPythonCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
  });

  it('kodu gecici dosyaya yazar ve calistirir', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'hello\n', stderr: '', exitCode: 0, duration: 50 });

    const result = await runPythonCode('print("hello")', { timeout: 30 });
    expect(result.stdout).toContain('hello');
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled(); // temp file cleaned up
  });

  it('pip paketlerini kurar', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 50 });

    await runPythonCode('import numpy', { installPackages: ['numpy', 'pandas'], timeout: 30 });
    // pip install cagrisi yapilmali
    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.stringContaining('pip install numpy pandas'),
      expect.any(Object)
    );
  });

  it('hata durumunda stderr doner', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: 'SyntaxError', exitCode: 1, duration: 50 });
    const result = await runPythonCode('invalid code', { timeout: 30 });
    expect(result.exitCode).toBe(1);
  });

  it('venvPath kullanirsa dogru binaryi kullanir', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 50 });
    const platform = process.platform;
    const expectedDir = platform === 'win32' ? 'Scripts' : 'bin';

    await runPythonCode('print("test")', { venvPath: '/tmp/venv', timeout: 30 });
    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.stringContaining(expectedDir),
      expect.any(Object)
    );
  });
});

describe('toolRunPython', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
  });

  it('kod calistirir ve sonucu formatlar', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'hello\n', stderr: '', exitCode: 0, duration: 50 });

    const result = await toolRunPython({ code: 'print("hello")' });
    expect(result).toContain('STDOUT');
    expect(result).toContain('hello');
    expect(result).toContain('EXIT: 0');
  });

  it('code yoksa hata mesaji doner', async () => {
    const result = await toolRunPython({});
    expect(result).toContain('gerekli');
  });

  it('dosya okur ve calistirir', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('print("from file")');
    mockRunCommand.mockResolvedValue({ stdout: 'from file\n', stderr: '', exitCode: 0, duration: 50 });

    const result = await toolRunPython({ file: 'script.py' });
    expect(result).toContain('from file');
  });

  it('dosya yoksa hata doner', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await toolRunPython({ file: 'yok.py' });
    expect(result).toContain('bulunamadı');
  });
});

describe('createVenv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('venv olusturur ve path doner', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 1000 });

    const result = await createVenv('/tmp/project');
    expect(result).toContain('.venv');
    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.stringContaining('-m venv'),
      expect.any(Object)
    );
  });

  it('venv zaten varsa atlar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = await createVenv('/tmp/project');
    expect(result).toContain('.venv');
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('venv olusturma hatasinda throw eder', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: 'permission denied', exitCode: 1, duration: 100 });

    await expect(createVenv('/tmp/project')).rejects.toThrow();
  });
});

describe('installRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requirements.txt varsa paketleri kurar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 1000 });

    const result = await installRequirements('/tmp/venv', '/tmp/project');
    expect(result).toContain('Paketler kuruldu');
  });

  it('requirements.txt yoksa mesaj doner', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await installRequirements('/tmp/venv', '/tmp/project');
    expect(result).toContain('bulunamadı');
  });
});
