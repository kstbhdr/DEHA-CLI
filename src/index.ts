#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { DehaCLI } from './cli';

const cli = new DehaCLI();

cli.run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red('\n✗ DEHA Hata: ') + message + '\n');
  process.exit(1);
});
