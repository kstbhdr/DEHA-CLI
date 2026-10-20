#!/usr/bin/env node
import * as path from 'path';
import * as dotenv from 'dotenv';

// Always load .env from the package directory, regardless of where `deha` is run from
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import chalk from 'chalk';
import { DehaCLI } from './cli';
import { logger } from './services/logger';
import { setupGlobalErrorHandler } from './services/error-handler';

// Hiçbir yerde kayıtlı değildi: bir .catch() atlanmış promise reddi (örn. uzun
// bir agent oturumundaki job-polling/arşivleme/health-check interval'larından
// biri) Node 15+'ta varsayılan olarak TÜM process'i sessizce çökertiyordu —
// özellikle stdout pipe'landığı ortamlarda (Colab gibi) hiçbir hata mesajı
// görünmeden doğrudan shell'e düşülüyordu. Artık uncaughtException loglanıp
// çıkılıyor (flush garantili), unhandledRejection ise sadece uyarıp devam
// ediyor — interaktif REPL tek bir kaçak promise yüzünden ölmüyor.
setupGlobalErrorHandler();

const cli = new DehaCLI();

cli.run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(chalk.red('\n✗ DEHA Hata: ') + message + '\n');
  process.exit(1);
});
