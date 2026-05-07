import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  formatErrorMessage,
  categorizeError,
  formatUserError,
  handleError,
} from '../services/error-handler';

describe('formatErrorMessage', () => {
  it('Error nesnesinden message alanını döndürür', () => {
    expect(formatErrorMessage(new Error('Bir hata oluştu'))).toBe('Bir hata oluştu');
  });

  it('string hataları olduğu gibi döndürür', () => {
    expect(formatErrorMessage('kritik hata')).toBe('kritik hata');
  });

  it('number hataları JSON.stringify ile döndürür', () => {
    expect(formatErrorMessage(42)).toBe('42');
  });

  it('object hataları JSON.stringify ile döndürür', () => {
    expect(formatErrorMessage({ code: 500, msg: 'Server Error' })).toBe('{"code":500,"msg":"Server Error"}');
  });

  it('null/undefined güvenli', () => {
    expect(formatErrorMessage(null)).toBe('null');
    expect(formatErrorMessage(undefined)).toBe(undefined);
  });

  it('Error alt sınıflarını da doğru işler', () => {
    class CustomError extends Error {
      constructor() { super('Custom error msg'); }
    }
    expect(formatErrorMessage(new CustomError())).toBe('Custom error msg');
  });
});

describe('categorizeError', () => {
  it('network hatası kategorilendirir', () => {
    const result = categorizeError(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    expect(result.category).toBe('network');
    expect(result.suggestion).toContain('İnternet bağlantını');
  });

  it('auth hatası kategorilendirir', () => {
    const result = categorizeError(new Error('401 Unauthorized - invalid API key'));
    expect(result.category).toBe('auth');
    expect(result.suggestion).toContain('API anahtarını');
  });

  it('api hatası kategorilendirir (rate limit)', () => {
    const result = categorizeError(new Error('429 Too Many Requests - rate limit exceeded'));
    expect(result.category).toBe('api');
    expect(result.suggestion).toContain('API sağlayıcında');
  });

  it('validation hatası kategorilendirir', () => {
    const result = categorizeError(new Error('422 Validation Error: name is required'));
    expect(result.category).toBe('validation');
  });

  it('system hatası kategorilendirir (ENOENT)', () => {
    const result = categorizeError(new Error('ENOENT: no such file or directory'));
    expect(result.category).toBe('system');
  });

  it('string hata kategorilendirir', () => {
    const result = categorizeError('timeout exceeded');
    expect(result.category).toBe('network');
  });

  it('bilinmeyen hata unknown kategorisine düşer', () => {
    const result = categorizeError(new Error('bir şey oldu ama ne?'));
    expect(result.category).toBe('unknown');
  });
});

describe('formatUserError', () => {
  it('kullanıcı dostu hata mesajı formatlar', () => {
    const msg = formatUserError(new Error('ECONNREFUSED'), 'test');
    expect(msg).toContain('BAĞLANTI HATASI');
    expect(msg).toContain('ECONNREFUSED');
    expect(msg).toContain('💡');
  });

  it('context eklenebilir', () => {
    const msg = formatUserError(new Error('hata'), 'API çağrısı');
    expect(msg).toContain('API çağrısı');
  });
});

describe('handleError', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hata mesajını loglar ve exit eder', () => {
    handleError(new Error('test error'), 'ctx', { exit: true });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exit:false ile çıkış yapmaz', () => {
    handleError(new Error('test error'), undefined, { exit: false });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('özel exit code ile çıkabilir', () => {
    handleError(new Error('test'), undefined, { exit: true, exitCode: 42 });
    expect(exitSpy).toHaveBeenCalledWith(42);
  });
});
