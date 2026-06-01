"use strict";
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
// ai-service.sendMessage mock
vitest_1.vi.mock('../services/ai-service', function () { return ({
    sendMessage: vitest_1.vi.fn(),
}); });
// tools/search.duckDuckGoSearch mock
vitest_1.vi.mock('../tools/search', function () { return ({
    duckDuckGoSearch: vitest_1.vi.fn(),
}); });
var intent_1 = require("../services/intent");
var ai_service_1 = require("../services/ai-service");
var search_1 = require("../tools/search");
var mockConfig = {
    provider: 'openai',
    openaiModel: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
};
(0, vitest_1.describe)('detectIntent', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('search keywordu yoksa false dondurur (model cagrilmaz)', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, intent_1.detectIntent)('Merhaba, nasilsin?', mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({ search: false });
                    (0, vitest_1.expect)(ai_service_1.sendMessage).not.toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('search keywordu varsa model cagrilir ve sonuc doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockResolvedValue('{"search":true,"keywords":"laptop fiyat"}');
                    return [4 /*yield*/, (0, intent_1.detectIntent)('En iyi laptop hangisi?', mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({ search: true, keywords: 'laptop fiyat' });
                    (0, vitest_1.expect)(ai_service_1.sendMessage).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('model search=true ama keywords yoksa extractKeywords kullanilir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockResolvedValue('{"search":true}');
                    return [4 /*yield*/, (0, intent_1.detectIntent)('Bana en iyi laptopu bul', mockConfig)];
                case 1:
                    result = _b.sent();
                    (0, vitest_1.expect)(result.search).toBe(true);
                    (0, vitest_1.expect)(result.keywords).toBeTruthy();
                    (0, vitest_1.expect)((_a = result.keywords) === null || _a === void 0 ? void 0 : _a.length).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('model hatasinda false doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockRejectedValue(new Error('API error'));
                    return [4 /*yield*/, (0, intent_1.detectIntent)('En iyi laptop fiyati nedir?', mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({ search: false });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('model gecersiz JSON donerse false doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockResolvedValue('bu bir json degil');
                    return [4 /*yield*/, (0, intent_1.detectIntent)('araba fiyatlari', mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({ search: false });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('Turkce search keywordlerini tanir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var testCases, _i, testCases_1, msg, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockResolvedValue('{"search":true,"keywords":"test"}');
                    testCases = [
                        'bunu ara bul',
                        'Bugun haber ne?',
                        'fiyati ne kadar?',
                        'son dakika haber',
                        'site adresini ver',
                    ];
                    _i = 0, testCases_1 = testCases;
                    _a.label = 1;
                case 1:
                    if (!(_i < testCases_1.length)) return [3 /*break*/, 4];
                    msg = testCases_1[_i];
                    return [4 /*yield*/, (0, intent_1.detectIntent)(msg, mockConfig)];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.search).toBe(true);
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('Ingilizce search keywordlerini tanir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var testCases, _i, testCases_2, msg, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(ai_service_1.sendMessage).mockResolvedValue('{"search":true,"keywords":"test"}');
                    testCases = [
                        'find me the best laptop',
                        'what is the price of iPhone',
                        'latest news today',
                        'where can I buy this?',
                    ];
                    _i = 0, testCases_2 = testCases;
                    _a.label = 1;
                case 1:
                    if (!(_i < testCases_2.length)) return [3 /*break*/, 4];
                    msg = testCases_2[_i];
                    return [4 /*yield*/, (0, intent_1.detectIntent)(msg, mockConfig)];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.search).toBe(true);
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('oturum hafizasi sorularini searche gondermez', function () { return __awaiter(void 0, void 0, void 0, function () {
        var testCases, _i, testCases_3, msg, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    testCases = [
                        'En son ne yaptik?',
                        'Az once ne demistim?',
                        'Gecen sohbette ne konustuk?',
                        'What did we do last conversation?',
                    ];
                    _i = 0, testCases_3 = testCases;
                    _a.label = 1;
                case 1:
                    if (!(_i < testCases_3.length)) return [3 /*break*/, 4];
                    msg = testCases_3[_i];
                    return [4 /*yield*/, (0, intent_1.detectIntent)(msg, mockConfig)];
                case 2:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({ search: false });
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    (0, vitest_1.expect)(ai_service_1.sendMessage).not.toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('enrichWithSearch', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('sonuclari mesaja ekler', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(search_1.duckDuckGoSearch).mockResolvedValue([
                        { title: 'Test Result', url: 'https://example.com', snippet: 'Test snippet' },
                    ]);
                    return [4 /*yield*/, (0, intent_1.enrichWithSearch)('Orijinal mesaj', 'test keyword')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('[WEB ARAMA SONUÇLARI - "test keyword"]');
                    (0, vitest_1.expect)(result).toContain('Test Result');
                    (0, vitest_1.expect)(result).toContain('https://example.com');
                    (0, vitest_1.expect)(result).toContain('KULLANARAK');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('sonuc yoksa orijinal mesaji doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(search_1.duckDuckGoSearch).mockResolvedValue([]);
                    return [4 /*yield*/, (0, intent_1.enrichWithSearch)('Orijinal mesaj', 'test')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('Orijinal mesaj');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('arama hatasinda orijinal mesaji doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(search_1.duckDuckGoSearch).mockRejectedValue(new Error('Search failed'));
                    return [4 /*yield*/, (0, intent_1.enrichWithSearch)('Orijinal mesaj', 'test')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('Orijinal mesaj');
                    return [2 /*return*/];
            }
        });
    }); });
});
