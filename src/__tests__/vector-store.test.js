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
var fs = require("fs");
var path = require("path");
var os = require("os");
var TEST_DIR = path.join(os.tmpdir(), 'deha-vector-test-' + Date.now());
(0, vitest_1.describe)('JsonVectorStore', function () {
    var JsonVectorStore;
    var simpleEmbedding;
    (0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var mod;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../services/vector-store'); })];
                case 1:
                    mod = _a.sent();
                    JsonVectorStore = mod.JsonVectorStore;
                    simpleEmbedding = mod.simpleEmbedding;
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.afterEach)(function () {
        // Cleanup test files
        try {
            var dir = path.join(os.homedir(), '.deha', 'vector-store');
            if (fs.existsSync(dir)) {
                var files = fs.readdirSync(dir);
                for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                    var f = files_1[_i];
                    if (f.startsWith('test-')) {
                        fs.unlinkSync(path.join(dir, f));
                    }
                }
            }
        }
        catch ( /* */_a) { /* */ }
    });
    (0, vitest_1.it)('boş depoda arama sonuç vermez', function () { return __awaiter(void 0, void 0, void 0, function () {
        var store, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    store = new JsonVectorStore('test-empty');
                    return [4 /*yield*/, store.search([1, 0, 0], 5)];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(0);
                    return [4 /*yield*/, store.close()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('mesaj eklenebilir ve sayılabilir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var store, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    store = new JsonVectorStore('test-count');
                    return [4 /*yield*/, store.add({
                            id: '1',
                            role: 'user',
                            content: 'Merhaba',
                            embedding: [1, 0, 0],
                            timestamp: Date.now(),
                        })];
                case 1:
                    _b.sent();
                    _a = vitest_1.expect;
                    return [4 /*yield*/, store.count()];
                case 2:
                    _a.apply(void 0, [_b.sent()]).toBe(1);
                    return [4 /*yield*/, store.close()];
                case 3:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('benzer embedding ile arama yapılabilir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var store, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    store = new JsonVectorStore('test-search');
                    return [4 /*yield*/, store.add({
                            id: '1', role: 'user', content: 'kedi',
                            embedding: [1, 0, 0], timestamp: 1,
                        })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, store.add({
                            id: '2', role: 'assistant', content: 'köpek',
                            embedding: [0, 1, 0], timestamp: 2,
                        })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, store.add({
                            id: '3', role: 'user', content: 'kuş',
                            embedding: [0, 0, 1], timestamp: 3,
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, store.search([0.9, 0.1, 0], 2)];
                case 4:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(2);
                    (0, vitest_1.expect)(results[0].id).toBe('1');
                    (0, vitest_1.expect)(results[0].score).toBeGreaterThan(0.9);
                    return [4 /*yield*/, store.close()];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('clear tüm mesajları siler', function () { return __awaiter(void 0, void 0, void 0, function () {
        var store, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    store = new JsonVectorStore('test-clear');
                    return [4 /*yield*/, store.add({
                            id: '1', role: 'user', content: 'test',
                            embedding: [1], timestamp: 1,
                        })];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, store.clear()];
                case 2:
                    _b.sent();
                    _a = vitest_1.expect;
                    return [4 /*yield*/, store.count()];
                case 3:
                    _a.apply(void 0, [_b.sent()]).toBe(0);
                    return [4 /*yield*/, store.close()];
                case 4:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('veriler diskten geri yüklenir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var store1, store2, _a, results;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    store1 = new JsonVectorStore('test-persist');
                    return [4 /*yield*/, store1.add({
                            id: '1', role: 'user', content: 'kalıcı mesaj',
                            embedding: [1, 0], timestamp: 1,
                        })];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, store1.close()];
                case 2:
                    _b.sent();
                    store2 = new JsonVectorStore('test-persist');
                    _a = vitest_1.expect;
                    return [4 /*yield*/, store2.count()];
                case 3:
                    _a.apply(void 0, [_b.sent()]).toBe(1);
                    return [4 /*yield*/, store2.search([1, 0], 5)];
                case 4:
                    results = _b.sent();
                    (0, vitest_1.expect)(results[0].content).toBe('kalıcı mesaj');
                    return [4 /*yield*/, store2.close()];
                case 5:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('simpleEmbedding kelime frekans vektörü üretir', function () {
        var emb = simpleEmbedding('merhaba dünya merhaba');
        // "merhaba" 2 kere, "dünya" 1 kere
        (0, vitest_1.expect)(emb.length).toBeGreaterThan(0);
        // İlk kelime "merhaba" → frekansı 2
        (0, vitest_1.expect)(emb[0]).toBe(2);
    });
    (0, vitest_1.it)('simpleEmbedding boş metin için boş vektör döner', function () {
        var emb = simpleEmbedding('');
        (0, vitest_1.expect)(emb).toHaveLength(0);
    });
});
