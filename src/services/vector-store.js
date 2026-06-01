"use strict";
/**
 * Vector Store — Vektör Depolama Soyutlaması
 *
 * ChromaDB kullanılabilir durumdaysa onu kullanır, değilse JSON file-based
 * basit bir depolamaya düşer. Bu sayede Chroma/Python bağımlılığı olmadan
 * da DEHA çalışabilir.
 *
 * Kullanım:
 *   import { getVectorStore } from './services/vector-store';
 *   const store = await getVectorStore();
 *   await store.add({ id, role, content, embedding, timestamp });
 *   const results = await store.search(embedding, 5);
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
exports.JsonVectorStore = void 0;
exports.simpleEmbedding = simpleEmbedding;
exports.getVectorStore = getVectorStore;
exports.resetVectorStore = resetVectorStore;
var fs = require("fs");
var path = require("path");
var logger_1 = require("./logger");
// ─── JSON File-Based Store (Fallback) ────────────────────────────────────────
var JSON_STORE_DIR = path.join(require('os').homedir(), '.deha', 'vector-store');
var JsonVectorStore = /** @class */ (function () {
    function JsonVectorStore(namespace) {
        if (namespace === void 0) { namespace = 'default'; }
        this.messages = [];
        this.loaded = false;
        this.filePath = path.join(JSON_STORE_DIR, "".concat(namespace, ".json"));
    }
    JsonVectorStore.prototype.load = function () {
        if (this.loaded)
            return;
        this.loaded = true;
        try {
            if (fs.existsSync(this.filePath)) {
                var raw = fs.readFileSync(this.filePath, 'utf-8');
                this.messages = JSON.parse(raw);
            }
        }
        catch (_a) {
            this.messages = [];
        }
    };
    JsonVectorStore.prototype.save = function () {
        try {
            if (!fs.existsSync(JSON_STORE_DIR)) {
                fs.mkdirSync(JSON_STORE_DIR, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.messages), 'utf-8');
        }
        catch (err) {
            logger_1.logger.warn('Vector store kaydetme hatası', err);
        }
    };
    JsonVectorStore.prototype.add = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.load();
                this.messages.push(msg);
                this.save();
                return [2 /*return*/];
            });
        });
    };
    JsonVectorStore.prototype.search = function (embedding, topN) {
        return __awaiter(this, void 0, void 0, function () {
            var scored;
            return __generator(this, function (_a) {
                this.load();
                if (this.messages.length === 0)
                    return [2 /*return*/, []];
                scored = this.messages.map(function (m) { return ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp,
                    score: cosineSimilarity(embedding, m.embedding),
                }); });
                scored.sort(function (a, b) { return b.score - a.score; });
                return [2 /*return*/, scored.slice(0, topN).map(function (s) { return ({
                        id: s.id,
                        role: s.role,
                        content: s.content,
                        score: s.score,
                        timestamp: s.timestamp,
                    }); })];
            });
        });
    };
    JsonVectorStore.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.messages = [];
                this.save();
                return [2 /*return*/];
            });
        });
    };
    JsonVectorStore.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.load();
                return [2 /*return*/, this.messages.length];
            });
        });
    };
    JsonVectorStore.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.save();
                return [2 /*return*/];
            });
        });
    };
    return JsonVectorStore;
}());
exports.JsonVectorStore = JsonVectorStore;
// ─── Cosine Similarity ───────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    var dot = 0, normA = 0, normB = 0;
    for (var i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    var denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
// ─── Embedding (Basit) ───────────────────────────────────────────────────────
/**
 * Basit bir embedding fonksiyonu — kelime frekansı vektörü çıkarır.
 * Gerçek kullanımda AI modeli ile embedding alınmalı, ancak
 * Chroma yokken basit bir arama yapılabilmesi için yeterli.
 */
function simpleEmbedding(text) {
    var words = text.toLowerCase().split(/\W+/).filter(Boolean);
    var freq = new Map();
    for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
        var w = words_1[_i];
        freq.set(w, (freq.get(w) || 0) + 1);
    }
    // İlk 100 kelimeyle sınırlı vektör
    var keys = __spreadArray([], freq.keys(), true).slice(0, 100);
    return keys.map(function (k) { return freq.get(k) || 0; });
}
// ─── Store Factory ───────────────────────────────────────────────────────────
var _store = null;
function getVectorStore() {
    return __awaiter(this, void 0, void 0, function () {
        var chroma;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (_store)
                        return [2 /*return*/, _store];
                    return [4 /*yield*/, tryChromaDB()];
                case 1:
                    chroma = _a.sent();
                    if (chroma) {
                        _store = chroma;
                        logger_1.logger.debug('Vector store: ChromaDB');
                        return [2 /*return*/, _store];
                    }
                    // Yoksa JSON fallback
                    _store = new JsonVectorStore();
                    logger_1.logger.debug('Vector store: JSON file-based');
                    return [2 /*return*/, _store];
            }
        });
    });
}
function resetVectorStore() {
    if (_store) {
        _store.close().catch(function () { });
        _store = null;
    }
}
// ─── ChromaDB Entegrasyonu ───────────────────────────────────────────────────
function tryChromaDB() {
    return __awaiter(this, void 0, void 0, function () {
        var url, isOpen, ChromaClient, client, collectionName, collection, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 7, , 8]);
                    url = process.env.CHROMA_URL || 'http://localhost:8000';
                    return [4 /*yield*/, isPortOpen(url)];
                case 1:
                    isOpen = _c.sent();
                    if (!isOpen)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('chromadb'); })];
                case 2:
                    ChromaClient = (_c.sent()).ChromaClient;
                    client = new ChromaClient({ path: url });
                    collectionName = process.env.CHROMA_COLLECTION || 'deha_memory';
                    collection = void 0;
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, client.getOrCreateCollection({ name: collectionName })];
                case 4:
                    collection = _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _a = _c.sent();
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/, new ChromaVectorStore(collection)];
                case 7:
                    _b = _c.sent();
                    return [2 /*return*/, null];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function isPortOpen(url) {
    return __awaiter(this, void 0, void 0, function () {
        var http_1, urlObj_1, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('http'); })];
                case 1:
                    http_1 = _b.sent();
                    urlObj_1 = new URL(url);
                    return [2 /*return*/, new Promise(function (resolve) {
                            var req = http_1.get("".concat(urlObj_1.protocol, "//").concat(urlObj_1.hostname, ":").concat(urlObj_1.port || 8000, "/api/v1/heartbeat"), function (res) {
                                resolve(res.statusCode === 200);
                            });
                            req.on('error', function () { return resolve(false); });
                            req.setTimeout(2000, function () { req.destroy(); resolve(false); });
                        })];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ─── ChromaDB Store Implementation ───────────────────────────────────────────
var ChromaVectorStore = /** @class */ (function () {
    function ChromaVectorStore(collection) {
        this.collection = collection;
    }
    ChromaVectorStore.prototype.add = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.collection.add({
                                ids: [msg.id],
                                embeddings: [msg.embedding],
                                metadatas: [{ role: msg.role, content: msg.content, timestamp: msg.timestamp }],
                                documents: [msg.content],
                            })];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ChromaVectorStore.prototype.search = function (embedding, topN) {
        return __awaiter(this, void 0, void 0, function () {
            var results, ids, metadatas_1, distances_1, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.collection.query({
                                queryEmbeddings: [embedding],
                                nResults: topN,
                            })];
                    case 1:
                        results = _b.sent();
                        ids = results.ids[0] || [];
                        metadatas_1 = results.metadatas[0] || [];
                        distances_1 = results.distances[0] || [];
                        return [2 /*return*/, ids.map(function (id, i) {
                                var _a, _b, _c;
                                return ({
                                    id: id,
                                    role: ((_a = metadatas_1[i]) === null || _a === void 0 ? void 0 : _a.role) || 'user',
                                    content: ((_b = metadatas_1[i]) === null || _b === void 0 ? void 0 : _b.content) || '',
                                    score: distances_1[i] !== undefined ? 1 - distances_1[i] : 0,
                                    timestamp: ((_c = metadatas_1[i]) === null || _c === void 0 ? void 0 : _c.timestamp) || 0,
                                });
                            })];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ChromaVectorStore.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.collection.delete({ where: {} })];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ChromaVectorStore.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            var c, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.collection.count()];
                    case 1:
                        c = _b.sent();
                        return [2 /*return*/, c];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, 0];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ChromaVectorStore.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        });
    };
    return ChromaVectorStore;
}());
