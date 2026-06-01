/**
 * Logger — Structured Logger
 *
 * Kullanım:
 *   import { logger } from './services/logger';
 *   logger.info('Başlatılıyor...');
 *   logger.error('Hata', err);
 *   logger.debug('API yanıtı', { status: 200 });
 *
 * Ortam değişkenleri:
 *   DEHA_LOG_LEVEL=debug    # debug | info | warn | error (default: info)
 *   DEHA_LOG_FILE=deha.log  # dosyaya da yaz (opsiyonel)
 *   DEHA_LOG_JSON=true      # JSON format (opsiyonel, terminal için uygun değil)
 */

import chalk from 'chalk';

export type LogLevel = 'trace' | 'debug' | 'info' | 'success' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  success: 2,
  warn: 3,
  error: 4,
};

const PREFIXES: Record<LogLevel, string> = {
  trace: chalk.dim('·'),
  debug: chalk.dim('●'),
  info: chalk.blue('ℹ'),
  success: chalk.green('✔'),
  warn: chalk.yellow('⚠'),
  error: chalk.red('✘'),
};

const COLORS: Record<LogLevel, (s: string) => string> = {
  trace: chalk.dim,
  debug: chalk.dim,
  info: chalk.white,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
};

let _minLevel: number | null = null;
let _logFile: string | null = null;
let _logJson = false;
let _logStream: import('fs').WriteStream | null = null;

function getMinLevel(): number {
  if (_minLevel === null) {
    const env = (process.env.DEHA_LOG_LEVEL || 'info').toLowerCase() as LogLevel;
    _minLevel = LOG_LEVELS[env] ?? 1;
  }
  return _minLevel;
}

function getLogFile(): string | null {
  if (_logFile === null) {
    _logFile = process.env.DEHA_LOG_FILE || null;
  }
  return _logFile;
}

function shouldLogJson(): boolean {
  if (_logJson === false && process.env.DEHA_LOG_JSON === 'true') {
    _logJson = true;
  }
  return _logJson;
}

function writeLog(level: LogLevel, message: string): void {
  const file = getLogFile();
  if (!file) return;

  try {
    if (!_logStream) {
      const fs = require('fs') as typeof import('fs');
      _logStream = fs.createWriteStream(file, { flags: 'a' });
    }
    const timestamp = new Date().toISOString();
    const line = shouldLogJson()
      ? JSON.stringify({ timestamp, level, message })
      : `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    _logStream.write(line + '\n');
  } catch {
    // dosyaya yazma hatası sessizce geç
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[level] < getMinLevel()) return;

  const prefix = PREFIXES[level] || '●';
  const timestamp = chalk.dim(new Date().toLocaleTimeString());
  const colorize = COLORS[level] || chalk.white;
  const formatted = args.length > 0 ? `${message} ${formatArgs(args)}` : message;

  console.log(`${timestamp} ${prefix} ${colorize(formatted)}`);

  // Dosyaya da yaz
  writeLog(level, args.length > 0 ? `${message} ${formatArgs(args)}` : message);
}

export const logger = {
  trace: (msg: string, ...args: unknown[]) => log('trace', msg, ...args),
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  success: (msg: string, ...args: unknown[]) => log('success', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),

  /** Kullanıcıya ham metin gösterir (renkli/chalk'lı) — log dosyasına da yazılır */
  write(msg: string): void {
    console.log(msg);
    writeLog('info', msg.replace(/\x1b\[[0-9;]*m/g, ''));
  },

  /** Ham metin yazdırır (renk çıkarmadan, satır sonu eklemeden) */
  raw(msg: string): void {
    process.stdout.write(msg);
  },

  /** Başarı kutusu */
  successBox(title: string, message?: string): void {
    const content = message ? `${title}: ${message}` : title;
    const width = Math.min(80, content.length + 6);
    const line = '─'.repeat(width - 2);
    this.write('\n' + chalk.green(`╭${line}╮`));
    this.write(chalk.green('│ ') + chalk.bold.white('✓ ' + title) + (message ? chalk.dim(': ' + message) : '') + chalk.green(' │'.padStart(width - (content.length + 2) + 1)));
    this.write(chalk.green(`╰${line}╯\n`));
  },

  /** Uyarı kutusu */
  warningBox(title: string, message?: string): void {
    const content = message ? `${title}: ${message}` : title;
    const width = Math.min(80, content.length + 6);
    const line = '─'.repeat(width - 2);
    this.write('\n' + chalk.yellow(`╭${line}╮`));
    this.write(chalk.yellow('│ ') + chalk.bold.white('⚠ ' + title) + (message ? chalk.dim(': ' + message) : '') + chalk.yellow(' │'.padStart(width - (content.length + 2) + 1)));
    this.write(chalk.yellow(`╰${line}╯\n`));
  },

  /** Test amaçlı iç durumu sıfırlar */
  _reset(): void {
    _minLevel = null;
    _logFile = null;
    _logJson = false;
    if (_logStream) {
      _logStream.end();
      _logStream = null;
    }
  },
};
