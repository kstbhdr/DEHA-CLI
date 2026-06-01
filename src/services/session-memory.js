"use strict";
/**
 * Session Memory Service — v2 (Context Compression Destekli)
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
exports.loadSession = loadSession;
exports.appendMessage = appendMessage;
exports.addArchitectureFile = addArchitectureFile;
exports.clearArchitectureFiles = clearArchitectureFiles;
exports.buildStaticContextMessages = buildStaticContextMessages;
exports.buildContextMessages = buildContextMessages;
exports.getSessionMessages = getSessionMessages;
exports.hydrateSession = hydrateSession;
exports.resetSession = resetSession;
exports.addPinnedMessage = addPinnedMessage;
exports.clearPinnedMessages = clearPinnedMessages;
exports.setWorkDir = setWorkDir;
exports.getWorkDir = getWorkDir;
exports.getContextStats = getContextStats;
exports.detectWorkDir = detectWorkDir;
exports.autoCompress = autoCompress;
exports.summarizeOld = summarizeOld;
exports.flushOnExit = flushOnExit;
var fs = require("fs");
var path = require("path");
var os = require("os");
var token_counter_1 = require("./token-counter");
var repo_map_1 = require("./repo-map");
// ─── Sabitler ────────────────────────────────────────────────────────────────
var SESSION_BUFFER_DIR = path.join(process.cwd(), '.deha');
var SESSION_BUFFER_FILE = path.join(SESSION_BUFFER_DIR, 'session-buffer.json');
var COLD_STORAGE_DIR = path.join(os.homedir(), '.deha', 'conversations');
var FLUSH_THRESHOLD = 20;
var MIN_ALWAYS_HOT_MESSAGES = 5;
var DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS = 80000;
var MAX_SUMMARY_CHARS = 24000;
var MAX_CONTEXT_MESSAGE_CHARS = 16000;
// ─── Redis (opsiyonel) ────────────────────────────────────────────────────────
var redisClient = null;
var _redisChecked = false;
function getRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var url, Redis, client, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (_redisChecked)
                        return [2 /*return*/, redisClient];
                    _redisChecked = true;
                    url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('ioredis'); })];
                case 2:
                    Redis = (_b.sent()).default;
                    client = new Redis(url, { lazyConnect: true, connectTimeout: 3000 });
                    client.on('error', function () { });
                    return [4 /*yield*/, client.connect()];
                case 3:
                    _b.sent();
                    redisClient = client;
                    return [2 /*return*/, client];
                case 4:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var _state = {
    sessionId: Date.now().toString(36),
    messages: [],
    summary: '',
    pinnedContext: [],
    architectureFiles: [],
    workDir: process.cwd(),
    flushedCount: 0,
    compressCount: 0,
};
// ─── Core Logic ──────────────────────────────────────────────────────────────
function loadSession() {
    return __awaiter(this, void 0, void 0, function () {
        var redis, raw, saved, raw, saved, age;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getRedis()];
                case 1:
                    redis = _b.sent();
                    if (!redis) return [3 /*break*/, 3];
                    return [4 /*yield*/, redis.get('deha:session:latest')];
                case 2:
                    raw = _b.sent();
                    if (raw) {
                        try {
                            saved = JSON.parse(raw);
                            if (shouldLoadSessionForCurrentDir(saved)) {
                                _state = __assign(__assign({}, _state), saved);
                                return [2 /*return*/];
                            }
                        }
                        catch (_c) { }
                    }
                    _b.label = 3;
                case 3:
                    if (fs.existsSync(SESSION_BUFFER_FILE)) {
                        try {
                            raw = fs.readFileSync(SESSION_BUFFER_FILE, 'utf-8');
                            saved = JSON.parse(raw);
                            age = Date.now() - parseInt((_a = saved.sessionId) !== null && _a !== void 0 ? _a : '0', 36);
                            if (age < 10 * 60 * 1000 && shouldLoadSessionForCurrentDir(saved)) {
                                _state = __assign(__assign({}, _state), saved);
                            }
                        }
                        catch (_d) { }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function shouldLoadSessionForCurrentDir(saved) {
    if (!saved.workDir)
        return true;
    try {
        return path.resolve(saved.workDir) === path.resolve(process.cwd());
    }
    catch (_a) {
        return false;
    }
}
function appendMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _state.messages.push(message);
                    _writeWarmBuffer();
                    _writeRedis().catch(function () { });
                    if (!(_state.messages.length - _state.flushedCount >= FLUSH_THRESHOLD)) return [3 /*break*/, 2];
                    return [4 /*yield*/, _flushCold(false)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
function addArchitectureFile(filePath) {
    var resolved = path.resolve(filePath);
    if (!_state.architectureFiles)
        _state.architectureFiles = [];
    if (!_state.architectureFiles.includes(resolved)) {
        _state.architectureFiles.push(resolved);
        _writeWarmBuffer();
    }
}
function clearArchitectureFiles() {
    _state.architectureFiles = [];
    _writeWarmBuffer();
}
/**
 * Optimized for Prompt Caching:
 * 1. ARCHITECTURE (The Constitution - Most Static)
 * 2. Pinned Context (En Üst - En Sabit - Cache dostu)
 * 3. Repo Map (Top - Static)
 * 4. Context Recap / Summary (Middle - Semi-Static)
 */
function buildStaticContextMessages() {
    var result = [];
    // 0. ARCHITECTURE
    if (_state.architectureFiles && _state.architectureFiles.length > 0) {
        var architectureContent = '';
        for (var _i = 0, _a = _state.architectureFiles; _i < _a.length; _i++) {
            var file = _a[_i];
            if (fs.existsSync(file)) {
                var content = fs.readFileSync(file, 'utf-8');
                architectureContent += "\n--- FILE: ".concat(path.relative(_state.workDir, file), " ---\n").concat(content, "\n");
            }
        }
        if (architectureContent) {
            result.push({
                role: 'user',
                content: "<project_architecture_constitution>\n".concat(architectureContent, "\nCRITICAL RULE: These files define the core logic and Second Brain of the project. NEVER propose changes to these files without explicit user approval. If you are a specialized agent (Coder/Judge), always check these files first.\n</project_architecture_constitution>"),
            });
            result.push({
                role: 'assistant',
                content: 'Proje anayasasını ve mimari dökümanları (Second Brain) hafızama kazıdım. Onay almadan bu yapıları değiştirmeyeceğim.',
            });
        }
    }
    // 1. PINNED CONTEXT
    if (_state.pinnedContext && _state.pinnedContext.length > 0) {
        var content = _state.pinnedContext.join('\n\n');
        result.push({
            role: 'user',
            content: "<pinned_instructions>\n".concat(content, "\n</pinned_instructions>"),
        });
        result.push({
            role: 'assistant',
            content: 'Sabit talimatları aldım, bunları her zaman önceliklendireceğim.',
        });
    }
    // 2. PROJECT STRUCTURE
    if (_state.workDir) {
        var repoMap = (0, repo_map_1.generateRepoMap)(_state.workDir, { maxDepth: 2 });
        if (repoMap) {
            result.push({
                role: 'user',
                content: "<project_structure>\n".concat(repoMap, "\n</project_structure>"),
            });
            result.push({
                role: 'assistant',
                content: 'Proje yapısını aldım.',
            });
        }
    }
    // 3. CONTEXT RECAP / SUMMARY
    if (_state.summary) {
        result.push({
            role: 'user',
            content: "<context_recap>\n".concat(truncateText(_state.summary, MAX_SUMMARY_CHARS), "\n</context_recap>"),
        });
        result.push({
            role: 'assistant',
            content: 'Bağlam özetini aldım.',
        });
    }
    return result;
}
function buildContextMessages(pendingUserMessage, options) {
    var _a, _b;
    if (options === void 0) { options = {}; }
    var msgs = _state.messages;
    var staticContext = buildStaticContextMessages();
    var result = __spreadArray([], staticContext, true);
    var budget = (_a = options.maxTokens) !== null && _a !== void 0 ? _a : DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS;
    var minHot = Math.max((_b = options.minHotMessages) !== null && _b !== void 0 ? _b : MIN_ALWAYS_HOT_MESSAGES, MIN_ALWAYS_HOT_MESSAGES);
    var pushIfFits = function (message, force) {
        if (force === void 0) { force = false; }
        var compacted = compactContextMessage(message);
        if (!force && (0, token_counter_1.estimateMessagesTokens)(__spreadArray(__spreadArray([], result, true), [compacted], false)) > budget)
            return false;
        result.push(compacted);
        return true;
    };
    // 4. CONVERSATION HISTORY (Bottom - Dynamic)
    var hotStart = Math.max(0, msgs.length - minHot);
    var older = msgs.slice(0, hotStart);
    var hot = msgs.slice(hotStart);
    var historyHeader = { role: 'user', content: '<recent_conversation>' };
    result.push(historyHeader);
    for (var i = older.length - 1; i >= 0; i--) {
        var candidate = __spreadArray(__spreadArray([compactContextMessage(older[i])], result.slice(result.indexOf(historyHeader) + 1), true), hot.map(compactContextMessage), true);
        var fullCandidate = __spreadArray(__spreadArray([], result.slice(0, result.indexOf(historyHeader) + 1), true), candidate, true);
        if ((0, token_counter_1.estimateMessagesTokens)(fullCandidate) <= budget) {
            result.splice(result.indexOf(historyHeader) + 1, 0, compactContextMessage(older[i]));
        }
        else {
            break;
        }
    }
    for (var _i = 0, hot_1 = hot; _i < hot_1.length; _i++) {
        var msg = hot_1[_i];
        pushIfFits(msg, true);
    }
    if (pendingUserMessage) {
        pushIfFits({ role: 'user', content: "<current_task>\n".concat(pendingUserMessage, "\n</current_task>") }, true);
    }
    else {
        result.push({ role: 'user', content: '</recent_conversation>' });
    }
    return result;
}
function getSessionMessages() {
    return _state.messages;
}
function hydrateSession(messages_1) {
    return __awaiter(this, arguments, void 0, function (messages, options) {
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _state.messages = __spreadArray([], messages, true);
                    _state.flushedCount = 0;
                    _state.compressCount = 0;
                    if (!options.preserveSummary)
                        _state.summary = '';
                    if (options.workDir)
                        _state.workDir = options.workDir;
                    _writeWarmBuffer();
                    return [4 /*yield*/, _writeRedis().catch(function () { })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function resetSession() {
    return __awaiter(this, arguments, void 0, function (workDir) {
        if (workDir === void 0) { workDir = process.cwd(); }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _state = {
                        sessionId: Date.now().toString(36),
                        messages: [],
                        summary: '',
                        pinnedContext: [],
                        architectureFiles: [],
                        workDir: workDir,
                        flushedCount: 0,
                        compressCount: 0,
                    };
                    _writeWarmBuffer();
                    return [4 /*yield*/, _writeRedis().catch(function () { })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function addPinnedMessage(text) {
    if (!_state.pinnedContext)
        _state.pinnedContext = [];
    if (!_state.pinnedContext.includes(text)) {
        _state.pinnedContext.push(text);
        _writeWarmBuffer();
    }
}
function clearPinnedMessages() {
    _state.pinnedContext = [];
    _writeWarmBuffer();
}
function setWorkDir(dir) {
    _state.workDir = dir;
    _writeWarmBuffer();
    if (!_state.summary && dir && fs.existsSync(dir)) {
        try {
            var summaryPath = path.join(dir, '.deha_summary.md');
            if (fs.existsSync(summaryPath)) {
                _state.summary = fs.readFileSync(summaryPath, 'utf-8').replace(/^# DEHA — Proje Özeti\n\n> Son Güncelleme: .*\n\n/, '');
            }
        }
        catch (_a) { }
    }
}
function getWorkDir() {
    return _state.workDir;
}
function getContextStats(maxContextTokens) {
    var total = (0, token_counter_1.estimateMessagesTokens)(_state.messages) + (0, token_counter_1.estimateTokens)(_state.summary);
    return {
        messages: _state.messages.length,
        tokens: total,
        usagePercent: (total / maxContextTokens) * 100,
        workDir: _state.workDir,
        compressCount: _state.compressCount,
    };
}
function detectWorkDir(message) {
    var match = message.match(/SET_WORKDIR:\s*([\S]+)/i);
    return match ? match[1] : null;
}
function autoCompress(summarizeFn, maxContextTokens, compressThreshold, minHotMessages) {
    return __awaiter(this, void 0, void 0, function () {
        var totalTokens, summaryTokens;
        return __generator(this, function (_a) {
            totalTokens = (0, token_counter_1.estimateMessagesTokens)(_state.messages);
            summaryTokens = (0, token_counter_1.estimateTokens)(_state.summary);
            if (totalTokens + summaryTokens < maxContextTokens * compressThreshold)
                return [2 /*return*/, false];
            return [2 /*return*/, summarizeOld(summarizeFn, minHotMessages)];
        });
    });
}
function summarizeOld(summarizeFn, hotCount) {
    return __awaiter(this, void 0, void 0, function () {
        var minHot, msgs, toSummarize, newSummary, stickyContext, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    minHot = Math.max(hotCount !== null && hotCount !== void 0 ? hotCount : 10, MIN_ALWAYS_HOT_MESSAGES);
                    msgs = _state.messages;
                    if (msgs.length <= minHot)
                        return [2 /*return*/, false];
                    toSummarize = msgs.slice(0, -minHot);
                    if (toSummarize.length < 4)
                        return [2 /*return*/, false];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, summarizeFn(toSummarize)];
                case 2:
                    newSummary = _b.sent();
                    stickyContext = "[STICKY CONTEXT]\n- ACTIVE WORKDIR: ".concat(_state.workDir, "\n- SUMMARY VERSION: ").concat(_state.compressCount + 1, "\n\n");
                    _state.summary = _state.summary
                        ? truncateText("".concat(stickyContext).concat(_state.summary, "\n\n---\n\n[Sonraki B\u00F6l\u00FCm \u00D6zeti]\n").concat(newSummary), MAX_SUMMARY_CHARS)
                        : truncateText("".concat(stickyContext).concat(newSummary), MAX_SUMMARY_CHARS);
                    if (_state.workDir && fs.existsSync(_state.workDir)) {
                        fs.writeFileSync(path.join(_state.workDir, '.deha_summary.md'), "# DEHA \u2014 Proje \u00D6zeti\n\n> Son G\u00FCncelleme: ".concat(new Date().toLocaleString(), "\n\n").concat(_state.summary));
                    }
                    _state.messages = msgs.slice(-minHot);
                    _state.compressCount++;
                    _writeWarmBuffer();
                    return [2 /*return*/, true];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function flushOnExit() {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedis()];
                case 1:
                    redis = _a.sent();
                    if (!redis) return [3 /*break*/, 3];
                    return [4 /*yield*/, redis.set('deha:session:latest', JSON.stringify(_state)).catch(function () { })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, _flushCold(true)];
                case 4:
                    _a.sent();
                    if (!redis) return [3 /*break*/, 7];
                    return [4 /*yield*/, redis.del('deha:session:latest').catch(function () { })];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, redis.quit().catch(function () { })];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    try {
                        fs.unlinkSync(SESSION_BUFFER_FILE);
                    }
                    catch (_b) { }
                    return [2 /*return*/];
            }
        });
    });
}
function _writeWarmBuffer() {
    try {
        if (!fs.existsSync(SESSION_BUFFER_DIR))
            fs.mkdirSync(SESSION_BUFFER_DIR, { recursive: true });
        fs.writeFileSync(SESSION_BUFFER_FILE, JSON.stringify(_state), 'utf-8');
    }
    catch (_a) { }
}
function _writeRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedis()];
                case 1:
                    redis = _a.sent();
                    if (!redis) return [3 /*break*/, 3];
                    return [4 /*yield*/, redis.set('deha:session:latest', JSON.stringify(_state))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function _flushCold(isFinal) {
    return __awaiter(this, void 0, void 0, function () {
        var msgs, unflushed, file;
        return __generator(this, function (_a) {
            msgs = _state.messages;
            unflushed = msgs.slice(_state.flushedCount);
            if (!unflushed.length && !isFinal)
                return [2 /*return*/];
            try {
                if (!fs.existsSync(COLD_STORAGE_DIR))
                    fs.mkdirSync(COLD_STORAGE_DIR, { recursive: true });
                file = path.join(COLD_STORAGE_DIR, "".concat(new Date().toISOString().slice(0, 10), "-").concat(_state.sessionId, ".json"));
                fs.writeFileSync(file, JSON.stringify(__assign(__assign({}, _state), { flushedAt: new Date().toISOString() }), null, 2), 'utf-8');
                _state.flushedCount = msgs.length;
            }
            catch (_b) { }
            return [2 /*return*/];
        });
    });
}
function compactContextMessage(message) {
    return __assign(__assign({}, message), { content: truncateText(message.content || '', MAX_CONTEXT_MESSAGE_CHARS) });
}
function truncateText(text, maxChars) {
    if (!text || text.length <= maxChars)
        return text;
    var head = Math.floor(maxChars * 0.65);
    var tail = Math.max(0, maxChars - head - 180);
    return [text.slice(0, head), "\n\n[... DEHA context compression: ".concat(text.length - head - tail, " karakter k\u0131rp\u0131ld\u0131 ...]\n\n"), tail > 0 ? text.slice(-tail) : ''].join('');
}
