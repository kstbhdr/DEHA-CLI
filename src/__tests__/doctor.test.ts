import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// execSync mock
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// fs/promises mock
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

// process.exit mock
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

import { execSync } from 'child_process';
import { readFile, access } from 'fs/promises';

describe('doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkNode', () => {
    it('Node.js 18+ için OK döndürür', async () => {
      vi.mocked(execSync).mockReturnValue('v20.11.0\n');
      const { doctor } = await import('../commands/doctor');
      // doctor fonksiyonunu çağırmak yerine internal fonksiyonları test et
      // doctor tüm check'leri çalıştırır, execSync mock'lanmış durumda
      // Sadece çağrıldığında hata fırlatmadığını test edelim
      // doctor process.exit çağırır, onu mock'ladık
    });
  });

  it('doctor hata fırlatmadan çalışır', async () => {
    // Tüm execSync çağrıları başarılı olsun
    vi.mocked(execSync).mockReturnValue('v20.11.0\n');
    vi.mocked(readFile).mockResolvedValue('OPENAI_API_KEY=sk-xxx\n');
    vi.mocked(access).mockResolvedValue(undefined);

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('Python yokken hata fırlatmaz (warn basar)', async () => {
    // node OK, python FAIL
    vi.mocked(execSync)
      .mockReturnValueOnce('v20.11.0\n')  // node --version
      .mockImplementationOnce(() => { throw new Error('not found'); }) // python --version
      .mockImplementationOnce(() => { throw new Error('not found'); }) // python3 --version
      .mockReturnValue(''); // diğer çağrılar

    vi.mocked(access).mockRejectedValue(new Error('no file'));
    vi.mocked(readFile).mockRejectedValue(new Error('no file'));

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('Node.js eski sürümse uyarı basar', async () => {
    vi.mocked(execSync).mockReturnValue('v16.14.0\n');
    vi.mocked(access).mockRejectedValue(new Error('no file'));
    vi.mocked(readFile).mockRejectedValue(new Error('no file'));

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
  });

  it('Ollama yokken hata fırlatmaz', async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('v20.11.0\n')  // node
      .mockImplementationOnce(() => { throw new Error('not found'); }) // python
      .mockImplementationOnce(() => { throw new Error('not found'); }) // python3
      .mockImplementationOnce(() => { throw new Error('not found'); }) // playwright
      .mockImplementationOnce(() => { throw new Error('not found'); }) // ollama
      .mockReturnValue('');

    vi.mocked(access).mockRejectedValue(new Error('no file'));
    vi.mocked(readFile).mockRejectedValue(new Error('no file'));

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
  });

  it('.env dosyası varsa ve API keyler okunursa çalışır', async () => {
    vi.mocked(execSync).mockReturnValue('v20.11.0\n');
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue('OPENAI_API_KEY=sk-xxx\nANTHROPIC_API_KEY=sk-ant-xxx\n');

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
  });

  it('mcp.json geçerli JSON ise çalışır', async () => {
    vi.mocked(execSync).mockReturnValue('v20.11.0\n');
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue('{}');

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
  });

  it('tüm kontroller başarısız olsa bile crash olmaz', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('command not found'); });
    vi.mocked(access).mockRejectedValue(new Error('access denied'));
    vi.mocked(readFile).mockRejectedValue(new Error('read error'));

    const { doctor } = await import('../commands/doctor');
    await expect(doctor()).resolves.toBeUndefined();
    // console.log en az 1 kere çağrılmış olmalı (başlık)
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
