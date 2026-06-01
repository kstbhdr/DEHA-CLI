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
// Redis mock
vitest_1.vi.mock('ioredis', function () {
    var mockRedis = {
        get: vitest_1.vi.fn().mockResolvedValue(null),
        set: vitest_1.vi.fn().mockResolvedValue(undefined),
        del: vitest_1.vi.fn().mockResolvedValue(undefined),
        quit: vitest_1.vi.fn().mockResolvedValue(undefined),
        connect: vitest_1.vi.fn().mockResolvedValue(undefined),
        on: vitest_1.vi.fn(),
    };
    return {
        default: vitest_1.vi.fn(function () { return mockRedis; }),
    };
});
// Token counter mock — plain functions (vi.fn kullanma, mock sorunu çıkarıyor)
vitest_1.vi.mock('../services/token-counter', function () { return ({
    estimateTokens: function (text) { return Math.ceil(((text === null || text === void 0 ? void 0 : text.length) || 0) / 3.5); },
    estimateMessagesTokens: function (msgs) {
        return msgs.reduce(function (sum, m) { var _a; return sum + Math.ceil((((_a = m.content) === null || _a === void 0 ? void 0 : _a.length) || 0) / 3.5) + 4; }, 0);
    },
    getMaxContextTokens: function () { return 128000; },
}); });
var session = require("../services/session-memory");
var ORIGINAL_ENV = __assign({}, process.env);
(0, vitest_1.describe)('session-memory', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        process.env = __assign({}, ORIGINAL_ENV);
        delete process.env.REDIS_URL;
    });
    (0, vitest_1.afterEach)(function () {
        process.env = __assign({}, ORIGINAL_ENV);
    });
    // ─── appendMessage ────────────────────────────────────────────────────
    (0, vitest_1.describe)('appendMessage', function () {
        (0, vitest_1.it)('mesaj ekler ve getSessionMessages ile okunabilir', function () { return __awaiter(void 0, void 0, void 0, function () {
            var msgs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, session.appendMessage({ role: 'user', content: 'test mesajı' })];
                    case 1:
                        _a.sent();
                        msgs = session.getSessionMessages();
                        (0, vitest_1.expect)(msgs.length).toBeGreaterThanOrEqual(1);
                        (0, vitest_1.expect)(msgs[msgs.length - 1].content).toBe('test mesajı');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('birden çok mesaj eklenebilir', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, session.appendMessage({ role: 'user', content: 'msg1' })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, session.appendMessage({ role: 'assistant', content: 'reply1' })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, session.appendMessage({ role: 'user', content: 'msg2' })];
                    case 3:
                        _a.sent();
                        (0, vitest_1.expect)(session.getSessionMessages().length).toBeGreaterThanOrEqual(3);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    // ─── buildContextMessages ─────────────────────────────────────────────
    (0, vitest_1.describe)('buildContextMessages', function () {
        (0, vitest_1.it)('özet yokken mesajları döndürür', function () {
            var ctx = session.buildContextMessages();
            (0, vitest_1.expect)(Array.isArray(ctx)).toBe(true);
        });
        (0, vitest_1.it)('pendingUserMessage eklenebilir', function () {
            var ctx = session.buildContextMessages('bekleyen mesaj');
            var last = ctx[ctx.length - 1];
            (0, vitest_1.expect)(last.content).toBe('bekleyen mesaj');
        });
    });
    // ─── workDir ──────────────────────────────────────────────────────────
    (0, vitest_1.describe)('setWorkDir / getWorkDir', function () {
        (0, vitest_1.it)('getWorkDir varsayılan değer döndürür', function () {
            (0, vitest_1.expect)(session.getWorkDir()).toBeTruthy();
        });
        (0, vitest_1.it)('setWorkDir ile güncellenir', function () {
            session.setWorkDir('/fake/path');
            (0, vitest_1.expect)(session.getWorkDir()).toBe('/fake/path');
        });
    });
    // ─── Context Compression ──────────────────────────────────────────────
    (0, vitest_1.describe)('summarizeOld', function () {
        (0, vitest_1.it)('yeterli mesaj yoksa false döndürür', function () { return __awaiter(void 0, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, session.summarizeOld(vitest_1.vi.fn(), 50)];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe(false);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('özetleme başarısız olursa false döndürür', function () { return __awaiter(void 0, void 0, void 0, function () {
            var summarizeFn, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        summarizeFn = vitest_1.vi.fn().mockRejectedValue(new Error('API hatası'));
                        return [4 /*yield*/, session.summarizeOld(summarizeFn, 5)];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe(false);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    // ─── getContextStats ──────────────────────────────────────────────────
    (0, vitest_1.describe)('getContextStats', function () {
        (0, vitest_1.it)('geçerli istatistik döndürür', function () {
            var stats = session.getContextStats(128000);
            (0, vitest_1.expect)(stats).toHaveProperty('messages');
            (0, vitest_1.expect)(stats).toHaveProperty('hasSummary');
            (0, vitest_1.expect)(stats).toHaveProperty('compressCount');
            (0, vitest_1.expect)(stats).toHaveProperty('totalTokens');
        });
    });
    // ─── flushOnExit ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('flushOnExit', function () {
        (0, vitest_1.it)('hata fırlatmadan çalışır', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, vitest_1.expect)(session.flushOnExit()).resolves.toBeUndefined()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    // ─── getSessionStats ──────────────────────────────────────────────────
    (0, vitest_1.describe)('getSessionStats', function () {
        (0, vitest_1.it)('temel istatistikleri döndürür', function () {
            var stats = session.getSessionStats();
            (0, vitest_1.expect)(stats).toHaveProperty('messages');
            (0, vitest_1.expect)(stats).toHaveProperty('summary');
            (0, vitest_1.expect)(stats).toHaveProperty('workDir');
        });
    });
});
