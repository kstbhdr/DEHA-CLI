"use strict";
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
exports.getUserContext = getUserContext;
exports.setUserContext = setUserContext;
exports.scanProject = scanProject;
exports.generateAutoContext = generateAutoContext;
exports.buildFullContext = buildFullContext;
var fs = require("fs");
var path = require("path");
var CONTEXT_FILE = '.deha/context.md';
var AUTO_CONTEXT_FILE = '.deha/auto-context.md';
// ─── Kullanıcı tanımlı context ──────────────────────────────────────────────
function getUserContext() {
    var file = path.resolve(CONTEXT_FILE);
    if (!fs.existsSync(file))
        return '';
    try {
        return fs.readFileSync(file, 'utf-8').trim();
    }
    catch (_a) {
        return '';
    }
}
function setUserContext(content) {
    var dir = path.resolve('.deha');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.resolve(CONTEXT_FILE), content, 'utf-8');
}
function scanProject() {
    var root = path.resolve('.');
    var files = listAllFiles(root);
    return {
        language: detectLanguage(files),
        entryPoint: findEntryPoint(files),
        hasPackageJson: files.includes('package.json'),
        hasRequirementsTxt: files.includes('requirements.txt'),
        hasDockerfile: files.includes('Dockerfile') || files.includes('docker-compose.yml'),
        hasTsconfig: files.includes('tsconfig.json'),
        fileCount: files.length,
        topFiles: files.filter(function (f) { return !f.startsWith('.') && !f.includes('node_modules') && !f.includes('.git'); }).slice(0, 30),
    };
}
function listAllFiles(dir, prefix) {
    if (prefix === void 0) { prefix = ''; }
    var results = [];
    try {
        var entries = fs.readdirSync(dir, { withFileTypes: true });
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
            var entry = entries_1[_i];
            var full = path.join(dir, entry.name);
            var rel = prefix ? "".concat(prefix, "/").concat(entry.name) : entry.name;
            if (entry.isDirectory()) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git')
                    continue;
                results.push.apply(results, listAllFiles(full, rel));
            }
            else {
                results.push(rel);
            }
        }
    }
    catch ( /* */_a) { /* */ }
    return results;
}
function detectLanguage(files) {
    if (files.some(function (f) { return f.endsWith('.py'); }))
        return 'Python';
    if (files.some(function (f) { return f.endsWith('.ts') || f.endsWith('.tsx'); }))
        return 'TypeScript';
    if (files.some(function (f) { return f.endsWith('.js') || f.endsWith('.jsx'); }))
        return 'JavaScript';
    if (files.some(function (f) { return f.endsWith('.go'); }))
        return 'Go';
    if (files.some(function (f) { return f.endsWith('.rs'); }))
        return 'Rust';
    if (files.some(function (f) { return f.endsWith('.java'); }))
        return 'Java';
    if (files.some(function (f) { return f.endsWith('.rb'); }))
        return 'Ruby';
    if (files.some(function (f) { return f.endsWith('.php'); }))
        return 'PHP';
    if (files.some(function (f) { return f.endsWith('.cs'); }))
        return 'C#';
    return 'Unknown';
}
function findEntryPoint(files) {
    var _a;
    var candidates = ['index.ts', 'index.js', 'main.py', 'app.py', 'main.go', 'main.rs', 'cmd/main.go', 'src/index.ts', 'src/main.py', 'bin/cli.ts', 'cli.ts'];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var c = candidates_1[_i];
        if (files.includes(c))
            return c;
    }
    return (_a = files[0]) !== null && _a !== void 0 ? _a : '';
}
function generateAutoContext() {
    var summary = scanProject();
    var lines = __spreadArray([
        '# Proje Otomatik Context',
        '',
        "**Dil:** ".concat(summary.language),
        "**Giri\u015F noktas\u0131:** ".concat(summary.entryPoint),
        "**Dosya say\u0131s\u0131:** ".concat(summary.fileCount),
        summary.hasPackageJson ? '- package.json mevcut' : '',
        summary.hasRequirementsTxt ? '- requirements.txt mevcut' : '',
        summary.hasDockerfile ? '- Dockerfile mevcut' : '',
        summary.hasTsconfig ? '- tsconfig.json mevcut' : '',
        '',
        '## Proje Yapısı (ilk 30 dosya)'
    ], summary.topFiles.map(function (f) { return "- `".concat(f, "`"); }), true);
    return lines.filter(Boolean).join('\n');
}
function buildFullContext() {
    var userCtx = getUserContext();
    var autoCtx = '';
    try {
        autoCtx = generateAutoContext();
    }
    catch ( /* */_a) { /* */ }
    var parts = [];
    if (userCtx)
        parts.push(userCtx);
    if (autoCtx)
        parts.push(autoCtx);
    return parts.join('\n\n---\n\n');
}
