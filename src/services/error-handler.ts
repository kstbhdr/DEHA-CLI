/**
 * Global Error Handler — Merkezi hata yönetimi
 *
 * Tüm yakalanmamış hataları ve promise rejection'ları yakalar,
 * kullanıcı dostu mesajlarla terminale basar.
 */

import { logger } from './logger';

export function setupGlobalErrorHandler(): void {
  process.on('uncaughtException', (err: Error) => {
    logger.error('Beklenmeyen hata', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const message =
      reason instanceof Error ? reason.message : String(reason);
    logger.warn('Promise rejection', message);
  });
}

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}
