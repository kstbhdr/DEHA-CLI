"use strict";
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
var chalk_1 = require("chalk");
var LOG_LEVELS = {
    trace: 0,
    debug: 1,
    info: 2,
    success: 2,
    warn: 3,
    error: 4,
};
var PREFIXES = {
    trace: chalk_1.default.dim('·'),
    debug: chalk_1.default.dim('●'),
    info: chalk_1.default.blue('ℹ'),
    success: chalk_1.default.green('✔'),
    warn: chalk_1.default.yellow('⚠'),
    error: chalk_1.default.red('✘'),
};
var COLORS = {
    trace: chalk_1.default.dim,
    debug: chalk_1.default.dim,
    info: chalk_1.default.white,
    success: chalk_1.default.green,
    warn: chalk_1.default.yellow,
    error: chalk_1.default.red,
};
var _minLevel = null;
var _logFile = null;
var _logJson = false;
var _logStream = null;
function getMinLevel() {
    var _a;
    if (_minLevel === null) {
        var env = (process.env.DEHA_LOG_LEVEL || 'info').toLowerCase();
        _minLevel = (_a = LOG_LEVELS[env]) !== null && _a !== void 0 ? _a : 1;
    }
    return _minLevel;
}
function getLogFile() {
    if (_logFile === null) {
        _logFile = process.env.DEHA_LOG_FILE || null;
    }
    return _logFile;
}
function shouldLogJson() {
    if (_logJson === false && process.env.DEHA_LOG_JSON === 'true') {
        _logJson = true;
    }
    return _logJson;
}
function writeLog(level, message) {
    var file = getLogFile();
    if (!file)
        return;
    try {
        if (!_logStream) {
            var fs = require('fs');
            _logStream = fs.createWriteStream(file, { flags: 'a' });
        }
        var timestamp = new Date().toISOString();
        var line = shouldLogJson()
            ? JSON.stringify({ timestamp: timestamp, level: level, message: message })
            : "[".concat(timestamp, "] [").concat(level.toUpperCase(), "] ").concat(message);
        _logStream.write(line + '\n');
    }
    catch (_a) {
        // dosyaya yazma hatası sessizce geç
    }
}
function formatArgs(args) {
    return args.map(function (a) {
        if (a instanceof Error)
            return a.stack || a.message;
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a);
            }
            catch (_a) {
                return String(a);
            }
        }
        return String(a);
    }).join(' ');
}
function log(level, message) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    if (LOG_LEVELS[level] < getMinLevel())
        return;
    var prefix = PREFIXES[level] || '●';
    var timestamp = chalk_1.default.dim(new Date().toLocaleTimeString());
    var colorize = COLORS[level] || chalk_1.default.white;
    var formatted = args.length > 0 ? "".concat(message, " ").concat(formatArgs(args)) : message;
    console.log("".concat(timestamp, " ").concat(prefix, " ").concat(colorize(formatted)));
    // Dosyaya da yaz
    writeLog(level, args.length > 0 ? "".concat(message, " ").concat(formatArgs(args)) : message);
}
exports.logger = {
    trace: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['trace', msg], args, false));
    },
    debug: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['debug', msg], args, false));
    },
    info: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['info', msg], args, false));
    },
    success: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['success', msg], args, false));
    },
    warn: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['warn', msg], args, false));
    },
    error: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return log.apply(void 0, __spreadArray(['error', msg], args, false));
    },
    /** Kullanıcıya ham metin gösterir (renkli/chalk'lı) — log dosyasına da yazılır */
    write: function (msg) {
        console.log(msg);
        writeLog('info', msg.replace(/\x1b\[[0-9;]*m/g, ''));
    },
    /** Ham metin yazdırır (renk çıkarmadan, satır sonu eklemeden) */
    raw: function (msg) {
        process.stdout.write(msg);
    },
    /** Başarı kutusu */
    successBox: function (title, message) {
        var content = message ? "".concat(title, ": ").concat(message) : title;
        var width = Math.min(80, content.length + 6);
        var line = '─'.repeat(width - 2);
        this.write('\n' + chalk_1.default.green("\u256D".concat(line, "\u256E")));
        this.write(chalk_1.default.green('│ ') + chalk_1.default.bold.white('✓ ' + title) + (message ? chalk_1.default.dim(': ' + message) : '') + chalk_1.default.green(' │'.padStart(width - (content.length + 2) + 1)));
        this.write(chalk_1.default.green("\u2570".concat(line, "\u256F\n")));
    },
    /** Uyarı kutusu */
    warningBox: function (title, message) {
        var content = message ? "".concat(title, ": ").concat(message) : title;
        var width = Math.min(80, content.length + 6);
        var line = '─'.repeat(width - 2);
        this.write('\n' + chalk_1.default.yellow("\u256D".concat(line, "\u256E")));
        this.write(chalk_1.default.yellow('│ ') + chalk_1.default.bold.white('⚠ ' + title) + (message ? chalk_1.default.dim(': ' + message) : '') + chalk_1.default.yellow(' │'.padStart(width - (content.length + 2) + 1)));
        this.write(chalk_1.default.yellow("\u2570".concat(line, "\u256F\n")));
    },
    /** Test amaçlı iç durumu sıfırlar */
    _reset: function () {
        _minLevel = null;
        _logFile = null;
        _logJson = false;
        if (_logStream) {
            _logStream.end();
            _logStream = null;
        }
    },
};
