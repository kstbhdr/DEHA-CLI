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
exports.detectIntent = detectIntent;
exports.enrichWithSearch = enrichWithSearch;
var ai_service_1 = require("./ai-service");
var search_1 = require("../tools/search");
// ─── Keyword heuristics (instant, no API call) ────────────────────────────────
var SEARCH_KEYWORDS = [
    // Turkish
    'bul', 'bul bana', 'ara', 'araştır', 'nerede', 'nerededir', 'nereden',
    'fiyat', 'fiyatı', 'ücret', 'ne kadar', 'kaç para', 'kaç lira',
    'sat', 'satın', 'sipariş', 'stok', 'mevcut', 'var mı',
    'güncel', 'son', 'şu an', 'şimdi', 'bugün', 'bu hafta', 'son dakika',
    'haber', 'duyuru', 'çıktı mı', 'piyasaya',
    'indir', 'indirme', 'link', 'url', 'site', 'adres',
    'öneri', 'önerir misin', 'hangi', 'karşılaştır', 'vs',
    'hava', 'hava durumu', 'yağmur', 'kar', 'sıcaklık', 'derece',
    'deprem', 'son depremler', 'döviz', 'dolar', 'euro', 'altın', 'kuru',
    'maç', 'skor', 'sonuç', 'puan durumu', 'lig',
    // English
    'find', 'search', 'look for', 'where', 'buy', 'purchase', 'price',
    'how much', 'cost', 'available', 'in stock', 'shop', 'order',
    'latest', 'current', 'today', 'news', 'recently', 'just released',
    'recommend', 'best', 'compare', 'review',
    'weather', 'forecast', 'rain', 'snow', 'temperature',
    'earthquake', 'exchange rate', 'currency', 'stock', 'market',
    'score', 'match', 'game', 'result', 'standings',
];
function hasSearchKeyword(message) {
    var lower = message.toLowerCase();
    return SEARCH_KEYWORDS.some(function (kw) { return lower.includes(kw); });
}
var MEMORY_RECALL_PATTERNS = [
    /\ben son ne yapt(ı|ik|ık)\b/,
    /\baz once\b/,
    /\baz önce\b/,
    /\bde(mis|miş|dik|diğim|mistim|miştim)\b/,
    /\bgecen sefer\b/,
    /\bgeçen sefer\b/,
    /\bgecen sohbet\b/,
    /\bgeçen sohbet\b/,
    /\bsohbet gecmisi\b/,
    /\bsohbet geçmişi\b/,
    /\bne konus(tuk|tuk)\b/,
    /\bne konuş(tuk|tuk)\b/,
    /\bwhat did we do\b/,
    /\bwhat were we doing\b/,
    /\bwhat did i say\b/,
    /\bour last chat\b/,
    /\blast conversation\b/,
    /\brecap\b/,
    /\bsummary of our chat\b/,
];
function isMemoryRecallMessage(message) {
    var lower = message.toLowerCase();
    return MEMORY_RECALL_PATTERNS.some(function (pattern) { return pattern.test(lower); });
}
// ─── Model-based intent (only called when keyword match is found) ─────────────
var INTENT_SYSTEM = "You are an intent classifier. Does this user message require real-time web search?\n\nReply ONLY with JSON, nothing else. No markdown, no explanation.\nExamples:\n{\"search\":true,\"keywords\":\"Monster Tulpar i7 RTX 5060 laptop fiyat\"}\n{\"search\":false}\n\nSearch IS needed: finding products/prices, news, current events, specific URLs, real-world comparisons.\nSearch NOT needed: coding questions, explanations, math, generating code/text.";
function modelIntent(message, config) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, intentConfig, raw, match, parsed, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    messages = [{ role: 'user', content: message }];
                    intentConfig = __assign(__assign({}, config), { maxTokens: 512, temperature: 0 });
                    if (config.provider === 'deepseek') {
                        intentConfig.deepseekModel = 'deepseek-chat'; // non-thinking mode alias
                    }
                    return [4 /*yield*/, (0, ai_service_1.sendMessage)(messages, __assign(__assign({}, intentConfig), { systemPrompt: INTENT_SYSTEM }))];
                case 1:
                    raw = _b.sent();
                    match = raw.match(/\{[^}]+\}/);
                    if (!match)
                        return [2 /*return*/, { search: false }];
                    parsed = JSON.parse(match[0]);
                    return [2 /*return*/, parsed];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, { search: false }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ─── Extract keywords without model (fast fallback) ──────────────────────────
function extractKeywords(message) {
    // Stop words çıkar, kalan kelimeleri keyword olarak kullan
    var stopWords = new Set([
        've', 'veya', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki',
        'için', 'bana', 'beni', 'benim', 'ben', 'sen', 'sana', 'onu',
        'the', 'a', 'an', 'and', 'or', 'for', 'me', 'my', 'i', 'you',
        'is', 'are', 'was', 'were', 'be', 'been', 'being',
    ]);
    return message
        .replace(/[?!.,;]/g, '')
        .split(/\s+/)
        .filter(function (w) { return w.length > 2 && !stopWords.has(w.toLowerCase()); })
        .slice(0, 8)
        .join(' ');
}
// ─── Ana fonksiyon ────────────────────────────────────────────────────────────
function detectIntent(message, config) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isMemoryRecallMessage(message))
                        return [2 /*return*/, { search: false }];
                    // 1. Keyword check — hızlı ve ücretsiz
                    if (!hasSearchKeyword(message))
                        return [2 /*return*/, { search: false }];
                    return [4 /*yield*/, modelIntent(message, config)];
                case 1:
                    result = _a.sent();
                    // Model yanlış döndürdüyse keyword'leri kendimiz çıkaralım
                    if (result.search && !result.keywords) {
                        result.keywords = extractKeywords(message);
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
// ─── Search + inject ──────────────────────────────────────────────────────────
function enrichWithSearch(message, keywords) {
    return __awaiter(this, void 0, void 0, function () {
        var results, formatted, searchBlock, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, search_1.duckDuckGoSearch)(keywords, 6)];
                case 1:
                    results = _b.sent();
                    if (!results.length)
                        return [2 /*return*/, message];
                    formatted = results
                        .map(function (r, i) { return "".concat(i + 1, ". ").concat(r.title, "\n   URL: ").concat(r.url, "\n   ").concat(r.snippet); })
                        .join('\n\n');
                    searchBlock = "[WEB ARAMA SONU\u00C7LARI - \"".concat(keywords, "\"]\n") +
                        "".concat(formatted, "\n\n") +
                        "YUKARIDAK\u0130 WEB ARAMA SONU\u00C7LARINI KULLANARAK kullan\u0131c\u0131n\u0131n \"".concat(message, "\" sorusunu cevapla.\n") +
                        "Bu veriler ger\u00E7ek zamanl\u0131d\u0131r ve do\u011Frudan cevab\u0131n i\u00E7inde yer al\u0131r.\n" +
                        "Kesinlikle \"veriye eri\u015Fimim yok\", \"canl\u0131 verim yok\" deme.\n";
                    return [2 /*return*/, searchBlock];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, message];
                case 3: return [2 /*return*/];
            }
        });
    });
}
