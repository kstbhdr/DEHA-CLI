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
        hset: vitest_1.vi.fn().mockResolvedValue(undefined),
        hgetall: vitest_1.vi.fn().mockResolvedValue(null),
        sadd: vitest_1.vi.fn().mockResolvedValue(undefined),
        smembers: vitest_1.vi.fn().mockResolvedValue([]),
        quit: vitest_1.vi.fn().mockResolvedValue(undefined),
        connect: vitest_1.vi.fn().mockResolvedValue(undefined),
        on: vitest_1.vi.fn(),
    };
    return {
        default: vitest_1.vi.fn(function () { return mockRedis; }),
    };
});
// ChromaDB mock
vitest_1.vi.mock('chromadb', function () { return ({
    ChromaClient: vitest_1.vi.fn().mockImplementation(function () { return ({
        getOrCreateCollection: vitest_1.vi.fn().mockResolvedValue({
            add: vitest_1.vi.fn().mockResolvedValue(undefined),
        }),
    }); }),
}); });
vitest_1.vi.mock('axios');
var ORIGINAL_ENV = __assign({}, process.env);
var memory = await Promise.resolve().then(function () { return require('../services/memory'); });
(0, vitest_1.describe)('memory service', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        process.env = __assign({}, ORIGINAL_ENV);
        delete process.env.REDIS_URL; // Redis kapalı — in-memory mod
    });
    (0, vitest_1.afterEach)(function () {
        process.env = __assign({}, ORIGINAL_ENV);
    });
    (0, vitest_1.describe)('addMessage ve getContext (in-memory)', function () {
        (0, vitest_1.it)('mesaj ekler ve context olarak geri alır', function () { return __awaiter(void 0, void 0, void 0, function () {
            var msg1, msg2, ctx, contents;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        msg1 = { role: 'user', content: 'Merhaba' };
                        msg2 = { role: 'assistant', content: 'Selam, nasıl yardımcı olabilirim?' };
                        return [4 /*yield*/, memory.addMessage(msg1)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, memory.addMessage(msg2)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, memory.getContext('yeni soru', [msg1, msg2])];
                    case 3:
                        ctx = _a.sent();
                        (0, vitest_1.expect)(ctx.length).toBeGreaterThanOrEqual(2);
                        contents = ctx.map(function (m) { return m.content; }).join(' ');
                        (0, vitest_1.expect)(contents).toContain('Merhaba');
                        (0, vitest_1.expect)(contents).toContain('Selam');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('boş mesaj listesiyle çağrıldığında boş context döner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var ctx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, memory.getContext('test', [])];
                    case 1:
                        ctx = _a.sent();
                        (0, vitest_1.expect)(ctx.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('closeMemory', function () {
        (0, vitest_1.it)('Redis yokken çalışır (hata fırlatmaz)', function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, vitest_1.expect)(memory.closeMemory()).resolves.toBeUndefined()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('getMemoryStatus', function () {
        (0, vitest_1.it)('Redis kapalıyken false, vector store aktif döndürür', function () { return __awaiter(void 0, void 0, void 0, function () {
            var status;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, memory.getMemoryStatus()];
                    case 1:
                        status = _a.sent();
                        (0, vitest_1.expect)(status).toHaveProperty('redis', false);
                        (0, vitest_1.expect)(status).toHaveProperty('vectorStore');
                        (0, vitest_1.expect)(typeof status.stored).toBe('number');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('çoklu mesaj ekleme', function () {
        (0, vitest_1.it)('10 mesaj eklenip context sorgulanabilir', function () { return __awaiter(void 0, void 0, void 0, function () {
            var i, sonMesajlar, ctx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < 10)) return [3 /*break*/, 5];
                        return [4 /*yield*/, memory.addMessage({ role: 'user', content: "mesaj-".concat(i) })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, memory.addMessage({ role: 'assistant', content: "yan\u0131t-".concat(i) })];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        i++;
                        return [3 /*break*/, 1];
                    case 5:
                        sonMesajlar = [
                            { role: 'user', content: 'mesaj-9' },
                            { role: 'assistant', content: 'yanıt-9' },
                        ];
                        return [4 /*yield*/, memory.getContext('son soru', sonMesajlar)];
                    case 6:
                        ctx = _a.sent();
                        (0, vitest_1.expect)(ctx.length).toBeGreaterThanOrEqual(2);
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
