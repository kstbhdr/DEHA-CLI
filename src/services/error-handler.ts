/**
 * Global Error Handler — Merkezi hata yönetimi
 *
 * Tüm yakalanmamış hataları ve promise rejection'ları yakalar,
 * kullanıcı dostu mesajlarla terminale basar.
 *
 * Kullanım:
 *   import { handleError } from './services/error-handler';
 *   try { ... } catch (err) { handleError(err, 'API çağrısı'); }
 */

import chalk from 'chalk';
import { logger } from './logger';

// ─── Hata Kategorileri ──────────────────────────────────────────────────────

export type ErrorCategory =
  | 'network'      // Bağlantı, timeout, DNS
  | 'auth'         // API key, yetkilendirme
  | 'validation'   // Geçersiz input, config
  | 'system'       // Dosya, izin, kaynak
  | 'api'          // API'den dönen hatalar (rate limit, vs)
  | 'unknown';     // Kategorize edilemeyen

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  suggestion: string;
  original: unknown;
}

// ─── Hata Kategorilendirme ──────────────────────────────────────────────────

const NETWORK_PATTERNS = [
  /ENOTFOUND/i, /ECONNREFUSED/i, /ECONNRESET/i, /ETIMEDOUT/i,
  /socket hang up/i, /network/i, /connect/i, /request failed/i,
  /timeout.*exceeded/i, /fetch failed/i, /abort/i, /econn/i,
];

const AUTH_PATTERNS = [
  /401/i, /403/i, /unauthorized/i, /forbidden/i, /api.key/i,
  /api_key/i, /invalid.*key/i, /invalid.*api/i, /authentication/i,
  /auth.*fail/i, /permission denied/i, /not.*authorized/i,
  /x-api-key/i, /authorization/i,
];

const VALIDATION_PATTERNS = [
  /422/i, /400/i, /invalid/i, /validation/i, /malformed/i,
  /parse.*error/i, /schema/i, /required/i, /not found/i,
  /must be/i, /cannot be/i,
];

const API_PATTERNS = [
  /429/i, /rate limit/i, /too many/i, /quota/i, /overloaded/i,
  /service unavailable/i, /503/i, /502/i, /504/i, /internal server error/i,
  /500/i, /bad gateway/i,
];

const SYSTEM_PATTERNS = [
  /ENOENT/i, /EACCES/i, /EISDIR/i, /EMFILE/i, /ENOSPC/i,
  /permission/i, /no such/i, /cannot find/i, /is not recognized/i,
  /command failed/i, /spawn/i, /EXDEV/i,
];

export function categorizeError(err: unknown): CategorizedError {
  const msg = extractMessage(err);
  const fullText = err instanceof Error ? `${err.name} ${err.message} ${err.stack || ''}` : msg;

  // Network
  if (NETWORK_PATTERNS.some(p => p.test(fullText))) {
    return {
      category: 'network',
      message: msg,
      suggestion: 'İnternet bağlantını kontrol et. Servis çalışıyor mu? Proxy/firewall var mı?',
      original: err,
    };
  }

  // Auth
  if (AUTH_PATTERNS.some(p => p.test(fullText))) {
    return {
      category: 'auth',
      message: msg,
      suggestion: 'API anahtarını kontrol et. `.env` dosyanda doğru tanımlandığından emin ol. `deha doctor` ile test edebilirsin.',
      original: err,
    };
  }

  // Validation
  if (VALIDATION_PATTERNS.some(p => p.test(fullText))) {
    return {
      category: 'validation',
      message: msg,
      suggestion: 'Girdiğin değerleri kontrol et. Eksik veya hatalı parametre olabilir.',
      original: err,
    };
  }

  // API (rate limit, server error)
  if (API_PATTERNS.some(p => p.test(fullText))) {
    return {
      category: 'api',
      message: msg,
      suggestion: 'API sağlayıcında geçici bir sorun olabilir. Birkaç saniye sonra tekrar dene.',
      original: err,
    };
  }

  // System
  if (SYSTEM_PATTERNS.some(p => p.test(fullText))) {
    return {
      category: 'system',
      message: msg,
      suggestion: 'Dosya/dizin izinlerini kontrol et. Gerekli bağımlılıklar kurulu mu?',
      original: err,
    };
  }

  return {
    category: 'unknown',
    message: msg,
    suggestion: 'Beklenmeyen bir hata oluştu. `deha doctor` ile sistemini kontrol et.',
    original: err,
  };
}

// ─── Kullanıcı Dostu Hata Gösterimi ─────────────────────────────────────────

const CATEGORY_EMOJIS: Record<ErrorCategory, string> = {
  network:    '🌐',
  auth:       '🔑',
  validation: '⚠️',
  api:        '⚡',
  system:     '💻',
  unknown:    '❓',
};

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network:    'BAĞLANTI HATASI',
  auth:       'YETKİ HATASI',
  validation: 'DOĞRULAMA HATASI',
  api:        'API HATASI',
  system:     'SİSTEM HATASI',
  unknown:    'BEKLENMEYEN HATA',
};

export function formatUserError(err: unknown, context?: string): string {
  const cat = categorizeError(err);
  const emoji = CATEGORY_EMOJIS[cat.category];
  const label = CATEGORY_LABELS[cat.category];
  const ctx = context ? chalk.dim(` [${context}]`) : '';

  return [
    '',
    chalk.bold.red(`${emoji} ${label}${ctx}`),
    chalk.white(`  ${cat.message}`),
    chalk.yellow(`  💡 ${cat.suggestion}`),
    '',
  ].join('\n');
}

// ─── Merkezi Hata İşleyici ──────────────────────────────────────────────────

/**
 * Bir hatayı merkezi olarak işler:
 * 1. Kategorilendirir
 * 2. Kullanıcı dostu mesaj basar
 * 3. Log dosyasına detaylı yazar
 * 4. İsteğe bağlı process.exit() yapar
 */
export function handleError(
  err: unknown,
  context?: string,
  options?: { exit?: boolean; exitCode?: number },
): void {
  const cat = categorizeError(err);
  const userMsg = formatUserError(err, context);

  // Terminale kullanıcı dostu mesaj
  logger.write(userMsg);

  // Log dosyasına detaylı yaz
  const detail = err instanceof Error
    ? `[${cat.category.toUpperCase()}] ${err.stack || err.message}`
    : `[${cat.category.toUpperCase()}] ${cat.message}`;
  logger.error(detail);

  // İsteğe bağlı çıkış
  if (options?.exit !== false) {
    process.exit(options?.exitCode ?? 1);
  }
}

// ─── Global Error Handlers ──────────────────────────────────────────────────

export function setupGlobalErrorHandler(): void {
  process.on('uncaughtException', (err: Error) => {
    handleError(err, 'global', { exit: true });
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const cat = categorizeError(reason);
    logger.warn(`[${cat.category.toUpperCase()}] Promise rejection: ${cat.message}`);
  });
}

// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function formatErrorMessage(err: unknown): string {
  return extractMessage(err);
}
