#!/usr/bin/env node
import * as path from 'path';
import * as dotenv from 'dotenv';

// Always load .env from the package directory, regardless of where `deha` is run from
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import chalk from 'chalk';
import { DehaCLI } from './cli';

const cli = new DehaCLI();

cli.run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red('\n✗ DEHA Hata: ') + message + '\n');
  process.exit(1);
});
