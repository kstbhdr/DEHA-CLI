"use strict";
/**
 * Redis ve ChromaDB'yi otomatik başlatır.
 *
 * Redis   → redis-memory-server (npm ile binary indirilir, kurulum gerekmez)
 * ChromaDB → Python varsa: pip install chromadb (ilk çalışmada) + chroma run
 *             Python yoksa: dosya tabanlı vektör store'a sessizce düşer
 */
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
exports.ensureRedis = ensureRedis;
exports.ensureChroma = ensureChroma;
exports.startServices = startServices;
exports.stopServices = stopServices;
var child_process_1 = require("child_process");
var fs = require("fs");
var path = require("path");
var os = require("os");
var net = require("net");
var REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
var CHROMA_PORT = parseInt(process.env.CHROMA_PORT || '8000', 10);
var CHROMA_DATA = path.join(os.homedir(), '.deha', 'chromadb');
var CHROMA_FLAG = path.join(os.homedir(), '.deha', '.chroma-installed'); // ilk kurulum bitti mi?
var _redisProc = null;
var _chromaProc = null;
// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function isPortOpen(port) {
    return new Promise(function (resolve) {
        // Önce IPv4 sonra IPv6 dene (VPS'te Chroma genelde ::1'de çalışır)
        var tryConnect = function (host) {
            var s = net.createConnection({ port: port, host: host });
            s.setTimeout(500);
            s.on('connect', function () { s.destroy(); resolve(true); });
            s.on('error', function () {
                if (host === '127.0.0.1')
                    tryConnect('::1');
                else
                    resolve(false);
            });
            s.on('timeout', function () { s.destroy(); if (host === '127.0.0.1')
                tryConnect('::1');
            else
                resolve(false); });
        };
        tryConnect('127.0.0.1');
    });
}
function which(cmd) {
    try {
        (0, child_process_1.execSync)(process.platform === 'win32' ? "where ".concat(cmd) : "which ".concat(cmd), { stdio: 'pipe' });
        return true;
    }
    catch (_a) {
        return false;
    }
}
function waitPort(port, maxMs) {
    var _this = this;
    return new Promise(function (resolve) {
        var start = Date.now();
        var iv = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, isPortOpen(port)];
                    case 1:
                        if (_a.sent()) {
                            clearInterval(iv);
                            resolve(true);
                            return [2 /*return*/];
                        }
                        if (Date.now() - start > maxMs) {
                            clearInterval(iv);
                            resolve(false);
                        }
                        return [2 /*return*/];
                }
            });
        }); }, 300);
    });
}
// ─── Redis (redis-memory-server) ─────────────────────────────────────────────
function ensureRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var RedisMemoryServer, server_1, _a, ok;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, isPortOpen(REDIS_PORT)];
                case 1:
                    if (_b.sent())
                        return [2 /*return*/, 'running'];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('redis-memory-server'); })];
                case 3:
                    RedisMemoryServer = (_b.sent()).RedisMemoryServer;
                    server_1 = new RedisMemoryServer({
                        instance: { port: REDIS_PORT },
                        binary: { downloadDir: path.join(os.homedir(), '.deha', 'redis-bin') },
                    });
                    return [4 /*yield*/, server_1.start()];
                case 4:
                    _b.sent();
                    process.env.REDIS_URL = "redis://localhost:".concat(REDIS_PORT);
                    process.once('exit', function () { return server_1.stop().catch(function () { }); });
                    return [2 /*return*/, 'started'];
                case 5:
                    _a = _b.sent();
                    if (!which('redis-server'))
                        return [2 /*return*/, 'unavailable'];
                    _redisProc = (0, child_process_1.spawn)('redis-server', ['--port', String(REDIS_PORT), '--loglevel', 'warning'], {
                        stdio: 'ignore',
                    });
                    _redisProc.on('error', function () { });
                    return [4 /*yield*/, waitPort(REDIS_PORT, 3000)];
                case 6:
                    ok = _b.sent();
                    if (ok) {
                        process.env.REDIS_URL = "redis://localhost:".concat(REDIS_PORT);
                        return [2 /*return*/, 'started'];
                    }
                    return [2 /*return*/, 'unavailable'];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ─── ChromaDB (Python auto-install) ──────────────────────────────────────────
function ensureChroma() {
    return __awaiter(this, void 0, void 0, function () {
        var py, chromaBin, startScript, ok;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, isPortOpen(CHROMA_PORT)];
                case 1:
                    if (_a.sent())
                        return [2 /*return*/, 'running'];
                    py = which('python3') ? 'python3' : 'python';
                    if (!fs.existsSync(CHROMA_FLAG)) {
                        try {
                            (0, child_process_1.execSync)("".concat(py, " -m pip install chromadb --quiet --disable-pip-version-check --break-system-packages"), {
                                stdio: 'pipe',
                                timeout: 120000,
                            });
                            fs.mkdirSync(path.dirname(CHROMA_FLAG), { recursive: true });
                            fs.writeFileSync(CHROMA_FLAG, new Date().toISOString());
                        }
                        catch (_b) {
                            return [2 /*return*/, 'unavailable'];
                        }
                    }
                    fs.mkdirSync(CHROMA_DATA, { recursive: true });
                    chromaBin = which('chroma') ? 'chroma' : null;
                    if (chromaBin) {
                        _chromaProc = (0, child_process_1.spawn)(chromaBin, ['run', '--path', CHROMA_DATA, '--port', String(CHROMA_PORT), '--host', 'localhost'], { stdio: 'ignore', env: __assign(__assign({}, process.env), { ANONYMIZED_TELEMETRY: 'False' }) });
                    }
                    else {
                        startScript = "from chromadb.cli.cli import app; import sys; sys.argv=['chroma','run','--path',r'".concat(CHROMA_DATA, "','--port','").concat(CHROMA_PORT, "','--host','localhost']; app()");
                        _chromaProc = (0, child_process_1.spawn)(py, ['-c', startScript], { stdio: 'ignore', env: __assign(__assign({}, process.env), { ANONYMIZED_TELEMETRY: 'False' }) });
                    }
                    _chromaProc.on('error', function () { });
                    return [4 /*yield*/, waitPort(CHROMA_PORT, 15000)];
                case 2:
                    ok = _a.sent();
                    if (ok) {
                        process.env.CHROMA_URL = "http://localhost:".concat(CHROMA_PORT);
                        return [2 /*return*/, 'started'];
                    }
                    return [2 /*return*/, 'unavailable'];
            }
        });
    });
}
function startServices() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, redis, chromadb, vs;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        ensureRedis(),
                        ensureChroma(),
                        Promise.resolve().then(function () { return require('./vector-store'); }).then(function (m) { return m.getVectorStore().then(function (v) { return v.constructor.name === 'ChromaVectorStore' ? 'ChromaDB' : 'JSON'; }); }),
                    ])];
                case 1:
                    _a = _b.sent(), redis = _a[0], chromadb = _a[1], vs = _a[2];
                    return [2 /*return*/, { redis: redis, chromadb: chromadb, vectorStore: vs }];
            }
        });
    });
}
// ─── Kapat (sadece biz başlattıysak) ─────────────────────────────────────────
function stopServices() {
    _redisProc === null || _redisProc === void 0 ? void 0 : _redisProc.kill('SIGTERM');
    _chromaProc === null || _chromaProc === void 0 ? void 0 : _chromaProc.kill('SIGTERM');
    _redisProc = null;
    _chromaProc = null;
}
