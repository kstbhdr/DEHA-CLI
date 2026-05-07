import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// context.ts içindeki fonksiyonları test etmek için fs modülünü mock'la
vi.mock('fs', () => ({
  default: {} as any,
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Modülü import et (mock'tan sonra)
const { getUserContext, setUserContext, scanProject, generateAutoContext, buildFullContext } = await import('../services/context');

describe('getUserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('context dosyası yoksa boş string döndürür', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getUserContext()).toBe('');
  });

  it('context dosyası varsa içeriğini döndürür', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('  Proje hakkında önemli not  ');
    expect(getUserContext()).toBe('Proje hakkında önemli not');
  });

  it('okuma hatasında boş string döndürür', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    expect(getUserContext()).toBe('');
  });
});

describe('setUserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('.deha dizini yoksa oluşturur ve dosyayı yazar', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    setUserContext('test context');
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.deha'),
      'test context',
      'utf-8'
    );
  });

  it('.deha dizini varsa doğrudan yazar', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    setUserContext('başka içerik');
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

describe('scanProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TypeScript projesini doğru tespit eder', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'src', isDirectory: () => true } as fs.Dirent,
    ]);
    // src altında index.ts var
    vi.mocked(fs.readdirSync).mockImplementation((dir: any) => {
      const dirStr = dir.toString();
      if (dirStr.includes('src')) {
        return [
          { name: 'index.ts', isDirectory: () => false } as fs.Dirent,
        ];
      }
      return [
        { name: 'src', isDirectory: () => true } as fs.Dirent,
        { name: 'package.json', isDirectory: () => false } as fs.Dirent,
        { name: 'tsconfig.json', isDirectory: () => false } as fs.Dirent,
      ];
    });

    const summary = scanProject();
    expect(summary.language).toBe('TypeScript');
    expect(summary.hasPackageJson).toBe(true);
    expect(summary.hasTsconfig).toBe(true);
  });

  it('gizli dizinleri ve node_modules/git atlar', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: '.git', isDirectory: () => true } as fs.Dirent,
      { name: 'node_modules', isDirectory: () => true } as fs.Dirent,
      { name: 'index.ts', isDirectory: () => false } as fs.Dirent,
    ]);
    const summary = scanProject();
    expect(summary.fileCount).toBe(1);
    expect(summary.topFiles).toContain('index.ts');
  });
});

describe('generateAutoContext', () => {
  it('Markdown formatında context üretir', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'index.ts', isDirectory: () => false } as fs.Dirent,
      { name: 'package.json', isDirectory: () => false } as fs.Dirent,
    ]);
    const result = generateAutoContext();
    expect(result).toContain('# Proje Otomatik Context');
    expect(result).toContain('**Dil:**');
    expect(result).toContain('**Dosya sayısı:** 2');
    expect(result).toContain('package.json mevcut');
  });
});

describe('buildFullContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user context + auto context birleştirir', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Kullanıcı notları');
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'main.py', isDirectory: () => false } as fs.Dirent,
    ]);
    const result = buildFullContext();
    expect(result).toContain('Kullanıcı notları');
    expect(result).toContain('Proje Otomatik Context');
    expect(result).toContain('---');
  });

  it('user context yoksa sadece auto context döner', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // context.md yok
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'app.py', isDirectory: () => false } as fs.Dirent,
    ]);
    const result = buildFullContext();
    expect(result).not.toContain('---');
    expect(result).toContain('Proje Otomatik Context');
  });
});
