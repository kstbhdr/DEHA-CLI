"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var ORIGINAL_ENV = __assign({}, process.env);
// console.log'u mock'la
var consoleLogSpy = vitest_1.vi.spyOn(console, 'log').mockImplementation(function () { });
(0, vitest_1.describe)('logger', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        process.env = __assign({}, ORIGINAL_ENV);
        delete process.env.DEHA_LOG_LEVEL;
        delete process.env.DEHA_LOG_FILE;
        delete process.env.DEHA_LOG_JSON;
        // Logger internal state'ini sıfırlamak için re-import
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.afterEach)(function () {
        process.env = __assign({}, ORIGINAL_ENV);
    });
    (0, vitest_1.it)('info seviyesinde mesaj loglar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger, call;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.info('test mesajı');
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    call = consoleLogSpy.mock.calls[0][0];
                    (0, vitest_1.expect)(call).toContain('test mesajı');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('debug seviyesi varsayılan olarak gösterilmez', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.debug('gizli mesaj');
                    (0, vitest_1.expect)(consoleLogSpy).not.toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('DEHA_LOG_LEVEL=debug ile debug mesajları gösterilir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.env.DEHA_LOG_LEVEL = 'debug';
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.debug('debug mesaj');
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('success mesajı loglar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.success('başarılı');
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('warn mesajı loglar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.warn('uyarı');
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('error mesajı loglar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.error('hata');
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('Error nesnesini formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.error('İşlem başarısız', new Error('Bağlantı zaman aşımı'));
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('extra argümanları ekler', function () { return __awaiter(void 0, void 0, void 0, function () {
        var logger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/logger'); })];
                case 1:
                    logger = (_a.sent()).logger;
                    logger.info('işlem', { id: 123, status: 'ok' });
                    (0, vitest_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
});
