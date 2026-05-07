import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// console.log'u mock'la
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEHA_LOG_LEVEL;
    delete process.env.DEHA_LOG_FILE;
    delete process.env.DEHA_LOG_JSON;

    // Logger internal state'ini sıfırlamak için re-import
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('info seviyesinde mesaj loglar', async () => {
    const { logger } = await import('../services/logger');
    logger.info('test mesajı');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const call = consoleLogSpy.mock.calls[0][0] as string;
    expect(call).toContain('test mesajı');
  });

  it('debug seviyesi varsayılan olarak gösterilmez', async () => {
    const { logger } = await import('../services/logger');
    logger.debug('gizli mesaj');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('DEHA_LOG_LEVEL=debug ile debug mesajları gösterilir', async () => {
    process.env.DEHA_LOG_LEVEL = 'debug';
    const { logger } = await import('../services/logger');
    logger.debug('debug mesaj');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('success mesajı loglar', async () => {
    const { logger } = await import('../services/logger');
    logger.success('başarılı');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('warn mesajı loglar', async () => {
    const { logger } = await import('../services/logger');
    logger.warn('uyarı');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('error mesajı loglar', async () => {
    const { logger } = await import('../services/logger');
    logger.error('hata');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('Error nesnesini formatlar', async () => {
    const { logger } = await import('../services/logger');
    logger.error('İşlem başarısız', new Error('Bağlantı zaman aşımı'));
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('extra argümanları ekler', async () => {
    const { logger } = await import('../services/logger');
    logger.info('işlem', { id: 123, status: 'ok' });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});
