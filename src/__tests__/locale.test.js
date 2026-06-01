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
(0, vitest_1.describe)('locale', function () {
    (0, vitest_1.beforeEach)(function () {
        process.env = __assign({}, ORIGINAL_ENV);
        delete process.env.DEHA_LANG;
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.afterEach)(function () {
        process.env = __assign({}, ORIGINAL_ENV);
    });
    (0, vitest_1.it)('varsayılan dil Türkçedir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, getLanguage, t;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    _a = _b.sent(), getLanguage = _a.getLanguage, t = _a.t;
                    (0, vitest_1.expect)(getLanguage()).toBe('tr');
                    (0, vitest_1.expect)(t('done')).toBe('Tamamlandı ✅');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('DEHA_LANG=en ile İngilizce aktif olur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, getLanguage, t;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    process.env.DEHA_LANG = 'en';
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    _a = _b.sent(), getLanguage = _a.getLanguage, t = _a.t;
                    (0, vitest_1.expect)(getLanguage()).toBe('en');
                    (0, vitest_1.expect)(t('done')).toBe('Done ✅');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('setLanguage ile dil değiştirilebilir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, setLanguage, getLanguage, t;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    _a = _b.sent(), setLanguage = _a.setLanguage, getLanguage = _a.getLanguage, t = _a.t;
                    setLanguage('en');
                    (0, vitest_1.expect)(getLanguage()).toBe('en');
                    (0, vitest_1.expect)(t('welcome')).toBe('Welcome to DEHA!');
                    setLanguage('tr');
                    (0, vitest_1.expect)(t('welcome')).toBe('DEHA\'ya hoş geldin!');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('değişken içeren mesajlar doğru formatlanır', function () { return __awaiter(void 0, void 0, void 0, function () {
        var t, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    t = (_a.sent()).t;
                    msg = t('context_loaded', { count: '5' });
                    (0, vitest_1.expect)(msg).toContain('5');
                    (0, vitest_1.expect)(msg).toContain('mesaj');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('birden çok değişken içeren mesajlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var t, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    t = (_a.sent()).t;
                    msg = t('doctor_results', {
                        emoji: '🎉',
                        passed: '10',
                        failed: '2',
                        warnings: '1',
                        total: '13',
                    });
                    (0, vitest_1.expect)(msg).toContain('🎉');
                    (0, vitest_1.expect)(msg).toContain('10 passed');
                    (0, vitest_1.expect)(msg).toContain('13 total');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('karmaşık mesaj cmd_help_text Türkçe döner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var t, help;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    t = (_a.sent()).t;
                    help = t('cmd_help_text');
                    (0, vitest_1.expect)(help).toContain('/exit');
                    (0, vitest_1.expect)(help).toContain('Otonom ajan modu');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('geçersiz anahtar anahtarın kendisini döndürür', function () { return __awaiter(void 0, void 0, void 0, function () {
        var t;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/locale'); })];
                case 1:
                    t = (_a.sent()).t;
                    (0, vitest_1.expect)(t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz');
                    return [2 /*return*/];
            }
        });
    }); });
});
