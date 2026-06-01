"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeError = categorizeError;
exports.formatUserError = formatUserError;
exports.handleError = handleError;
exports.setupGlobalErrorHandler = setupGlobalErrorHandler;
exports.formatErrorMessage = formatErrorMessage;
var chalk_1 = require("chalk");
var logger_1 = require("./logger");
// ─── Hata Kategorilendirme ──────────────────────────────────────────────────
var NETWORK_PATTERNS = [
    /ENOTFOUND/i, /ECONNREFUSED/i, /ECONNRESET/i, /ETIMEDOUT/i,
    /socket hang up/i, /network/i, /connect/i, /request failed/i,
    /timeout.*exceeded/i, /fetch failed/i, /abort/i, /econn/i,
];
var AUTH_PATTERNS = [
    /401/i, /403/i, /unauthorized/i, /forbidden/i, /api.key/i,
    /api_key/i, /invalid.*key/i, /invalid.*api/i, /authentication/i,
    /auth.*fail/i, /permission denied/i, /not.*authorized/i,
    /x-api-key/i, /authorization/i,
];
var VALIDATION_PATTERNS = [
    /422/i, /400/i, /invalid/i, /validation/i, /malformed/i,
    /parse.*error/i, /schema/i, /required/i, /not found/i,
    /must be/i, /cannot be/i,
];
var API_PATTERNS = [
    /429/i, /rate limit/i, /too many/i, /quota/i, /overloaded/i,
    /service unavailable/i, /503/i, /502/i, /504/i, /internal server error/i,
    /500/i, /bad gateway/i,
];
var SYSTEM_PATTERNS = [
    /ENOENT/i, /EACCES/i, /EISDIR/i, /EMFILE/i, /ENOSPC/i,
    /permission/i, /no such/i, /cannot find/i, /is not recognized/i,
    /command failed/i, /spawn/i, /EXDEV/i,
];
function categorizeError(err) {
    var msg = extractMessage(err);
    var fullText = err instanceof Error ? "".concat(err.name, " ").concat(err.message, " ").concat(err.stack || '') : msg;
    // Network
    if (NETWORK_PATTERNS.some(function (p) { return p.test(fullText); })) {
        return {
            category: 'network',
            message: msg,
            suggestion: 'İnternet bağlantını kontrol et. Servis çalışıyor mu? Proxy/firewall var mı?',
            original: err,
        };
    }
    // Auth
    if (AUTH_PATTERNS.some(function (p) { return p.test(fullText); })) {
        return {
            category: 'auth',
            message: msg,
            suggestion: 'API anahtarını kontrol et. `.env` dosyanda doğru tanımlandığından emin ol. `deha doctor` ile test edebilirsin.',
            original: err,
        };
    }
    // Validation
    if (VALIDATION_PATTERNS.some(function (p) { return p.test(fullText); })) {
        return {
            category: 'validation',
            message: msg,
            suggestion: 'Girdiğin değerleri kontrol et. Eksik veya hatalı parametre olabilir.',
            original: err,
        };
    }
    // API (rate limit, server error)
    if (API_PATTERNS.some(function (p) { return p.test(fullText); })) {
        return {
            category: 'api',
            message: msg,
            suggestion: 'API sağlayıcında geçici bir sorun olabilir. Birkaç saniye sonra tekrar dene.',
            original: err,
        };
    }
    // System
    if (SYSTEM_PATTERNS.some(function (p) { return p.test(fullText); })) {
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
var CATEGORY_EMOJIS = {
    network: '🌐',
    auth: '🔑',
    validation: '⚠️',
    api: '⚡',
    system: '💻',
    unknown: '❓',
};
var CATEGORY_LABELS = {
    network: 'BAĞLANTI HATASI',
    auth: 'YETKİ HATASI',
    validation: 'DOĞRULAMA HATASI',
    api: 'API HATASI',
    system: 'SİSTEM HATASI',
    unknown: 'BEKLENMEYEN HATA',
};
function formatUserError(err, context) {
    var cat = categorizeError(err);
    var emoji = CATEGORY_EMOJIS[cat.category];
    var label = CATEGORY_LABELS[cat.category];
    var ctx = context ? chalk_1.default.dim(" [".concat(context, "]")) : '';
    return [
        '',
        chalk_1.default.bold.red("".concat(emoji, " ").concat(label).concat(ctx)),
        chalk_1.default.white("  ".concat(cat.message)),
        chalk_1.default.yellow("  \uD83D\uDCA1 ".concat(cat.suggestion)),
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
function handleError(err, context, options) {
    var _a;
    var cat = categorizeError(err);
    var userMsg = formatUserError(err, context);
    // Terminale kullanıcı dostu mesaj
    logger_1.logger.write(userMsg);
    // Log dosyasına detaylı yaz
    var detail = err instanceof Error
        ? "[".concat(cat.category.toUpperCase(), "] ").concat(err.stack || err.message)
        : "[".concat(cat.category.toUpperCase(), "] ").concat(cat.message);
    logger_1.logger.error(detail);
    // İsteğe bağlı çıkış
    if ((options === null || options === void 0 ? void 0 : options.exit) !== false) {
        process.exit((_a = options === null || options === void 0 ? void 0 : options.exitCode) !== null && _a !== void 0 ? _a : 1);
    }
}
// ─── Global Error Handlers ──────────────────────────────────────────────────
function setupGlobalErrorHandler() {
    process.on('uncaughtException', function (err) {
        handleError(err, 'global', { exit: true });
    });
    process.on('unhandledRejection', function (reason) {
        var cat = categorizeError(reason);
        logger_1.logger.warn("[".concat(cat.category.toUpperCase(), "] Promise rejection: ").concat(cat.message));
    });
}
// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────
function extractMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === 'string')
        return err;
    try {
        return JSON.stringify(err);
    }
    catch (_a) {
        return String(err);
    }
}
function formatErrorMessage(err) {
    return extractMessage(err);
}
