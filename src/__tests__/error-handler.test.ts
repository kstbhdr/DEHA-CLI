import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatErrorMessage } from '../services/error-handler';

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
