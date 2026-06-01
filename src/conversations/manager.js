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
exports.getConvDir = getConvDir;
exports.createConversationId = createConversationId;
exports.saveConversation = saveConversation;
exports.listConversations = listConversations;
exports.readConversation = readConversation;
exports.loadConversationMessages = loadConversationMessages;
exports.searchConversations = searchConversations;
var fs = require("fs");
var path = require("path");
var os = require("os");
var CONV_DIR = path.join(os.homedir(), '.deha', 'conversations');
function getConvDir() {
    if (!fs.existsSync(CONV_DIR))
        fs.mkdirSync(CONV_DIR, { recursive: true });
    return CONV_DIR;
}
function createConversationId(title) {
    if (title === void 0) { title = 'Sohbet'; }
    var now = new Date();
    var dateStr = formatDate(now);
    var timeStr = formatTime(now);
    var slug = slugify(title).slice(0, 40) || 'sohbet';
    return "".concat(dateStr, "_").concat(timeStr, "_").concat(slug);
}
// ─── Kaydet ─────────────────────────────────────────────────────────────────
function saveConversation(messages, provider, model, options) {
    if (options === void 0) { options = {}; }
    if (messages.length < 1)
        return null;
    var now = new Date();
    var firstUserMsg = messages.find(function (m) { return m.role === 'user'; });
    var title = options.title || makeTitle((firstUserMsg === null || firstUserMsg === void 0 ? void 0 : firstUserMsg.content) || 'Sohbet');
    var id = options.conversationId || createConversationId(title);
    var filePath = path.join(getConvDir(), "".concat(id, ".md"));
    var md = buildMarkdown(messages, { date: now.toISOString(), title: title, provider: provider, model: model });
    fs.writeFileSync(filePath, md, 'utf-8');
    return filePath;
}
// ─── Listele ────────────────────────────────────────────────────────────────
function listConversations(limit) {
    if (limit === void 0) { limit = 200; }
    var dir = getConvDir();
    var files = fs.readdirSync(dir)
        .filter(function (f) { return f.endsWith('.md'); })
        .sort()
        .reverse()
        .slice(0, limit);
    return files.map(function (file) {
        var filePath = path.join(dir, file);
        var raw = fs.readFileSync(filePath, 'utf-8');
        return parseMeta(raw, file.replace('.md', ''), filePath);
    });
}
// ─── Oku ────────────────────────────────────────────────────────────────────
function readConversation(id) {
    var filePath = path.join(getConvDir(), "".concat(id, ".md"));
    if (!fs.existsSync(filePath))
        return null;
    return fs.readFileSync(filePath, 'utf-8');
}
function loadConversationMessages(id) {
    var raw = readConversation(id);
    if (!raw)
        return null;
    var messages = [];
    // Split on role headers
    var parts = raw.split(/^## (?:🧑 Kullanıcı|🤖 DEHA|🛠 Tool Sonucu.*)\s*$/m);
    // Determine role order by scanning headers in order
    var headerMatches = __spreadArray([], raw.matchAll(/^## (🧑 Kullanıcı|🤖 DEHA|🛠 Tool Sonucu.*?)\s*$/gm), true);
    for (var i = 0; i < headerMatches.length; i++) {
        var header = headerMatches[i][1];
        var role = 'user';
        var tool_call_id = void 0;
        if (header === '🧑 Kullanıcı') {
            role = 'user';
        }
        else if (header === '🤖 DEHA') {
            role = 'assistant';
        }
        else if (header.startsWith('🛠 Tool Sonucu')) {
            role = 'tool';
            var idMatch = header.match(/id: ([\w-]+)/);
            if (idMatch)
                tool_call_id = idMatch[1];
        }
        var content = (parts[i + 1] || '')
            .replace(/\n---\s*$/, '') // trailing separator
            .trim();
        if (content || role === 'assistant') {
            messages.push({ role: role, content: content, tool_call_id: tool_call_id });
        }
    }
    return messages.length > 0 ? messages : null;
}
function searchConversations(query) {
    var dir = getConvDir();
    var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.md'); });
    var results = [];
    var q = query.toLowerCase();
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        var filePath = path.join(dir, file);
        var raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.toLowerCase().includes(q)) {
            results.push(parseMeta(raw, file.replace('.md', ''), filePath));
        }
    }
    return results.sort(function (a, b) { return b.date.localeCompare(a.date); });
}
// ─── Markdown builder ────────────────────────────────────────────────────────
function buildMarkdown(messages, meta) {
    var lines = [
        '---',
        "title: \"".concat(meta.title.replace(/"/g, "'"), "\""),
        "date: ".concat(meta.date),
        "provider: ".concat(meta.provider),
        "model: ".concat(meta.model),
        "messages: ".concat(messages.length),
        '---',
        '',
        "# ".concat(meta.title),
        '',
        "> **Tarih:** ".concat(new Date(meta.date).toLocaleString('tr-TR'), "  "),
        "> **Model:** ".concat(meta.provider, " / ").concat(meta.model),
        '',
        '---',
        '',
    ];
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var msg = messages_1[_i];
        if (msg.role === 'user') {
            lines.push("## \uD83E\uDDD1 Kullan\u0131c\u0131");
            lines.push('');
            lines.push(msg.content || '');
            lines.push('');
        }
        else if (msg.role === 'assistant') {
            lines.push("## \uD83E\uDD16 DEHA");
            lines.push('');
            if (msg.reasoning_content) {
                lines.push("> \uD83D\uDCAD **Thinking:** ".concat(msg.reasoning_content.slice(0, 500)).concat(msg.reasoning_content.length > 500 ? '...' : '', "\n"));
            }
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (var _a = 0, _b = msg.tool_calls; _a < _b.length; _a++) {
                    var tc = _b[_a];
                    var args = typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
                    lines.push("[Tool Call: **".concat(tc.function.name, "**(").concat(args.slice(0, 100)).concat(args.length > 100 ? '...' : '', ")]"));
                }
                lines.push('');
            }
            lines.push(msg.content || '');
            lines.push('');
            lines.push('---');
            lines.push('');
        }
        else if (msg.role === 'tool') {
            lines.push("## \uD83D\uDEE0 Tool Sonucu (id: ".concat(msg.tool_call_id || 'unknown', ")"));
            lines.push('');
            lines.push(msg.content || '');
            lines.push('');
            lines.push('---');
            lines.push('');
        }
    }
    return lines.join('\n');
}
// ─── Meta parser (frontmatter'dan okur) ─────────────────────────────────────
function parseMeta(raw, id, filePath) {
    var get = function (key) {
        var match = raw.match(new RegExp("^".concat(key, ":\\s*(.+)$"), 'm'));
        return match ? match[1].replace(/^"|"$/g, '').trim() : '';
    };
    return {
        id: id,
        date: get('date') || id.slice(0, 10),
        title: get('title') || id,
        provider: get('provider') || '?',
        model: get('model') || '?',
        messageCount: parseInt(get('messages') || '0', 10),
        filePath: filePath,
    };
}
// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function makeTitle(firstMessage) {
    return firstMessage
        .replace(/```[\s\S]*?```/g, '') // kod bloklarını çıkar
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 60)
        || 'Sohbet';
}
function slugify(str) {
    return str
        .toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
function formatDate(d) {
    return "".concat(d.getFullYear(), "-").concat(pad(d.getMonth() + 1), "-").concat(pad(d.getDate()));
}
function formatTime(d) {
    return "".concat(pad(d.getHours()), "-").concat(pad(d.getMinutes()), "-").concat(pad(d.getSeconds()));
}
function pad(n) {
    return n.toString().padStart(2, '0');
}
