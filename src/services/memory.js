"use strict";
/**
 * DEHA Memory Service
 *
 * Mimari:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Context window  │ Son 5 mesaj — modele doğrudan eklenir │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Redis           │ Tüm konuşma + embedding'ler           │
 *  │                  │ Semantic search: alakalı eski mesajlar │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Vector Store    │ Cold archive — ChromaDB veya JSON     │
 *  │                  │ Her mesajda async write (non-blocking) │
 *  └─────────────────────────────────────────────────────────┘
 *
 * getContext(userMsg) döner:
 *   [...son5Mesaj, ...redisSemanticArama(userMsg, top3)]
 */
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
exports.addMessage = addMessage;
exports.getContext = getContext;
exports.closeMemory = closeMemory;
exports.getMemoryStatus = getMemoryStatus;
var crypto = require("crypto");
var axios_1 = require("axios");
var vector_store_1 = require("./vector-store");
// ─── Sabitler ────────────────────────────────────────────────────────────────
var HOT_WINDOW = 5; // bağlama doğrudan eklenecek son N mesaj
var SEMANTIC_TOP_K = 3; // Redis'ten getirilecek alakalı mesaj sayısı
var SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2);
var REDIS_PREFIX = 'deha:msg:';
var REDIS_SESSION_INDEX = "deha:session:".concat(SESSION_ID);
var _redis = null;
var _redisChecked = false;
function getRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var url, Redis, client, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (_redisChecked)
                        return [2 /*return*/, _redis];
                    _redisChecked = true;
                    url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('ioredis'); })];
                case 2:
                    Redis = (_b.sent()).default;
                    client = new Redis(url, {
                        lazyConnect: true,
                        connectTimeout: 2000,
                        maxRetriesPerRequest: 1,
                        retryStrategy: function () { return null; },
                        showFriendlyErrorStack: false
                    });
                    client.on('error', function () { });
                    return [4 /*yield*/, client.connect()];
                case 3:
                    _b.sent();
                    _redis = client;
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    _redis = null;
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, _redis];
            }
        });
    });
}
// ─── In-memory fallback (Redis yoksa) ────────────────────────────────────────
var _memStore = [];
// ─── Embedding üretimi ────────────────────────────────────────────────────────
/**
 * OpenAI embeddings API ile vektör üretir.
 * API key yoksa veya hata alırsa basit hash-tabanlı vektöre düşer.
 */
function generateEmbedding(text) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, res, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    apiKey = process.env.OPENAI_API_KEY;
                    if (!(apiKey && apiKey.startsWith('sk-') && apiKey.length > 20)) return [3 /*break*/, 4];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1.default.post('https://api.openai.com/v1/embeddings', { model: 'text-embedding-3-small', input: text.slice(0, 8192) }, { headers: { Authorization: "Bearer ".concat(apiKey) }, timeout: 8000 })];
                case 2:
                    res = _b.sent();
                    return [2 /*return*/, res.data.data[0].embedding];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, _hashEmbedding(text)];
            }
        });
    });
}
/** Basit hash-tabanlı embedding (API yoksa) */
function _hashEmbedding(text) {
    var dim = 128;
    var vec = new Array(dim).fill(0);
    var words = text.toLowerCase().split(/\W+/).filter(Boolean);
    for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
        var word = words_1[_i];
        var hash = crypto.createHash('md5').update(word).digest();
        for (var i = 0; i < dim; i++) {
            vec[i] += (hash[i % 16] / 255) * 2 - 1;
        }
    }
    var norm = Math.sqrt(vec.reduce(function (s, v) { return s + v * v; }, 0)) || 1;
    return vec.map(function (v) { return v / norm; });
}
/** Cosine similarity */
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
// ─── Ana fonksiyonlar ─────────────────────────────────────────────────────────
/**
 * Yeni mesajı Redis'e kaydeder + Vector Store'a arka planda yazar.
 */
function addMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        var content, embedding, stored, redis, key, vs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    content = message.content || (message.tool_calls ? JSON.stringify(message.tool_calls) : '');
                    return [4 /*yield*/, generateEmbedding(content)];
                case 1:
                    embedding = _a.sent();
                    stored = {
                        id: crypto.randomUUID(),
                        role: message.role,
                        content: content,
                        embedding: embedding,
                        timestamp: Date.now(),
                    };
                    return [4 /*yield*/, getRedis()];
                case 2:
                    redis = _a.sent();
                    if (!redis) return [3 /*break*/, 5];
                    key = REDIS_PREFIX + stored.id;
                    return [4 /*yield*/, redis.hset(key, 'id', stored.id, 'role', stored.role, 'content', stored.content, 'embedding', JSON.stringify(stored.embedding), 'timestamp', stored.timestamp.toString())];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, redis.sadd(REDIS_SESSION_INDEX, stored.id)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _memStore.push(stored);
                    _a.label = 6;
                case 6: return [4 /*yield*/, (0, vector_store_1.getVectorStore)()];
                case 7:
                    vs = _a.sent();
                    vs.add(stored).catch(function () { });
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Modele gönderilecek bağlamı oluşturur:
 *   1. Son 5 mesaj (tam metin)
 *   2. Redis'ten semantic arama → en alakalı top-K eski mesaj
 */
function getContext(currentUserMessage, allMessages) {
    return __awaiter(this, void 0, void 0, function () {
        var hot, hotIds, relevant, contextNote, contextAck;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    hot = allMessages.slice(-HOT_WINDOW);
                    hotIds = new Set(hot.map(function (m) { return "".concat(m.role, "::").concat(m.content); }));
                    return [4 /*yield*/, _semanticSearch(currentUserMessage, SEMANTIC_TOP_K, hotIds)];
                case 1:
                    relevant = _a.sent();
                    if (relevant.length === 0)
                        return [2 /*return*/, hot];
                    contextNote = {
                        role: 'user',
                        content: "[RELEVANT PAST CONTEXT]\n".concat(relevant.map(function (m) { return "".concat(m.role, ": ").concat(m.content.slice(0, 300)); }).join('\n---\n')),
                    };
                    contextAck = {
                        role: 'assistant',
                        content: 'I have the relevant context from our previous conversation.',
                    };
                    return [2 /*return*/, __spreadArray([contextNote, contextAck], hot, true)];
            }
        });
    });
}
/**
 * Redis veya in-memory'den semantic arama yapar.
 */
function _semanticSearch(query, topK, exclude) {
    return __awaiter(this, void 0, void 0, function () {
        var queryEmb, allMessages, redis, ids, results, sorted, candidates;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, generateEmbedding(query)];
                case 1:
                    queryEmb = _a.sent();
                    allMessages = [];
                    return [4 /*yield*/, getRedis()];
                case 2:
                    redis = _a.sent();
                    if (!redis) return [3 /*break*/, 5];
                    return [4 /*yield*/, redis.smembers(REDIS_SESSION_INDEX)];
                case 3:
                    ids = _a.sent();
                    return [4 /*yield*/, Promise.all(ids.map(function (id) { return __awaiter(_this, void 0, void 0, function () {
                            var raw;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, redis.hgetall(REDIS_PREFIX + id)];
                                    case 1:
                                        raw = _a.sent();
                                        if (!raw)
                                            return [2 /*return*/, null];
                                        return [2 /*return*/, {
                                                id: raw.id,
                                                role: raw.role,
                                                content: raw.content,
                                                embedding: JSON.parse(raw.embedding || '[]'),
                                                timestamp: parseInt(raw.timestamp, 10),
                                            }];
                                }
                            });
                        }); }))];
                case 4:
                    results = _a.sent();
                    allMessages = results.filter(function (r) { return r !== null; });
                    return [3 /*break*/, 6];
                case 5:
                    allMessages = __spreadArray([], _memStore, true);
                    _a.label = 6;
                case 6:
                    sorted = __spreadArray([], allMessages, true).sort(function (a, b) { return a.timestamp - b.timestamp; });
                    candidates = sorted
                        .slice(0, -HOT_WINDOW)
                        .filter(function (m) { return !exclude.has("".concat(m.role, "::").concat(m.content)); });
                    if (candidates.length === 0)
                        return [2 /*return*/, []];
                    return [2 /*return*/, candidates
                            .map(function (m) { return ({ msg: m, score: cosineSimilarity(queryEmb, m.embedding) }); })
                            .sort(function (a, b) { return b.score - a.score; })
                            .slice(0, topK)
                            .filter(function (r) { return r.score > 0.3; })
                            .sort(function (a, b) { return a.msg.timestamp - b.msg.timestamp; })
                            .map(function (r) { return r.msg; })];
            }
        });
    });
}
/**
 * Uygulama kapanırken bağlantıları kapat.
 */
function closeMemory() {
    return __awaiter(this, void 0, void 0, function () {
        var resetVectorStore;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!_redis) return [3 /*break*/, 2];
                    return [4 /*yield*/, _redis.quit().catch(function () { })];
                case 1:
                    _a.sent();
                    _redis = null;
                    _a.label = 2;
                case 2:
                    _redisChecked = false; // yeniden başlatmada Redis tekrar dene
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./vector-store'); })];
                case 3:
                    resetVectorStore = (_a.sent()).resetVectorStore;
                    resetVectorStore();
                    return [2 /*return*/];
            }
        });
    });
}
/** Bağlantı durumunu raporla */
function getMemoryStatus() {
    return __awaiter(this, void 0, void 0, function () {
        var redis, vs, vsName, count, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getRedis()];
                case 1:
                    redis = _b.sent();
                    return [4 /*yield*/, (0, vector_store_1.getVectorStore)()];
                case 2:
                    vs = _b.sent();
                    vsName = vs.constructor.name === 'ChromaVectorStore' ? 'chromadb' : 'json';
                    if (!redis) return [3 /*break*/, 4];
                    return [4 /*yield*/, redis.smembers(REDIS_SESSION_INDEX)];
                case 3:
                    _a = (_b.sent()).length;
                    return [3 /*break*/, 5];
                case 4:
                    _a = _memStore.length;
                    _b.label = 5;
                case 5:
                    count = _a;
                    return [2 /*return*/, { redis: redis !== null, vectorStore: vsName, stored: count }];
            }
        });
    });
}
