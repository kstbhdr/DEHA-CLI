"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCached = getCached;
exports.setCache = setCache;
exports.clearCache = clearCache;
exports.cacheStats = cacheStats;
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var CACHE_DIR = '.deha/cache';
function ensureCacheDir() {
    var dir = path.resolve(CACHE_DIR);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
/** Prompt mesajlarını + system prompt'u hash'le */
function hashPrompt(systemPrompt, messages, model) {
    var data = JSON.stringify({ systemPrompt: systemPrompt, messages: messages, model: model });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
function getCached(systemPrompt, messages, model) {
    try {
        var dir = ensureCacheDir();
        var hash = hashPrompt(systemPrompt, messages, model);
        var file = path.join(dir, "".concat(hash, ".json"));
        if (!fs.existsSync(file))
            return null;
        var cached = JSON.parse(fs.readFileSync(file, 'utf-8'));
        // 1 saatten eski cache'leri sayma
        if (Date.now() - cached.ts > 3600000) {
            fs.unlinkSync(file);
            return null;
        }
        return cached.response;
    }
    catch (_a) {
        return null;
    }
}
function setCache(systemPrompt, messages, model, response) {
    try {
        var dir = ensureCacheDir();
        var hash = hashPrompt(systemPrompt, messages, model);
        var file = path.join(dir, "".concat(hash, ".json"));
        fs.writeFileSync(file, JSON.stringify({ response: response, ts: Date.now() }), 'utf-8');
    }
    catch (_a) {
        // Cache hatası sessiz geç
    }
}
/** Cache dizinini temizle */
function clearCache() {
    var dir = path.resolve(CACHE_DIR);
    if (!fs.existsSync(dir))
        return 0;
    var count = 0;
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var f = _a[_i];
        if (f.endsWith('.json')) {
            fs.unlinkSync(path.join(dir, f));
            count++;
        }
    }
    return count;
}
/** Cache istatistikleri */
function cacheStats() {
    var dir = path.resolve(CACHE_DIR);
    if (!fs.existsSync(dir))
        return { fileCount: 0, sizeBytes: 0 };
    var sizeBytes = 0;
    var fileCount = 0;
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var f = _a[_i];
        if (f.endsWith('.json')) {
            fileCount++;
            try {
                sizeBytes += fs.statSync(path.join(dir, f)).size;
            }
            catch ( /* */_b) { /* */ }
        }
    }
    return { fileCount: fileCount, sizeBytes: sizeBytes };
}
