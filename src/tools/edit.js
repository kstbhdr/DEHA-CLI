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
exports.editFile = editFile;
exports.insertLines = insertLines;
exports.deleteLines = deleteLines;
exports.parseEditBlocks = parseEditBlocks;
exports.applyEditBlocks = applyEditBlocks;
exports.parseNewFileBlocks = parseNewFileBlocks;
exports.applyNewFileBlocks = applyNewFileBlocks;
exports.showInlineDiff = showInlineDiff;
var fs = require("fs");
var path = require("path");
// ─── edit_file: exact string replacement ────────────────────────────────────
function editFile(input) {
    var _a, _b;
    var resolved = path.resolve(input.path);
    if (!fs.existsSync(resolved)) {
        return "HATA: Dosya bulunamad\u0131: ".concat(resolved);
    }
    var original = fs.readFileSync(resolved, 'utf-8');
    if (!original.includes(input.old_string)) {
        // Bulunamadıysa yakın eşleşme ipucu ver
        var lines = original.split('\n');
        var firstLineOfOld_1 = input.old_string.split('\n')[0].trim();
        var closestLine = lines.findIndex(function (l) { return l.includes(firstLineOfOld_1); });
        var hint = closestLine >= 0
            ? " En yak\u0131n e\u015Fle\u015Fme sat\u0131r ".concat(closestLine + 1, ": \"").concat(lines[closestLine].trim().slice(0, 60), "\"")
            : '';
        return "HATA: old_string dosyada bulunamad\u0131.".concat(hint, "\n\u0130pucu: Bo\u015Fluk, girinti veya sat\u0131r sonu farkl\u0131l\u0131klar\u0131n\u0131 kontrol et.");
    }
    var count = input.replace_all
        ? ((_b = (_a = original.match(new RegExp(escapeRegex(input.old_string), 'g'))) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0)
        : 1;
    var updated = input.replace_all
        ? original.split(input.old_string).join(input.new_string)
        : original.replace(input.old_string, input.new_string);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return "\u2713 D\u00FCzenlendi: ".concat(resolved, " (").concat(count, " de\u011Fi\u015Fiklik)");
}
// ─── insert_lines: satır ekleme ─────────────────────────────────────────────
function insertLines(input) {
    var resolved = path.resolve(input.path);
    if (!fs.existsSync(resolved))
        return "HATA: ".concat(resolved, " bulunamad\u0131");
    var lines = fs.readFileSync(resolved, 'utf-8').split('\n');
    var insertAt = Math.min(Math.max(0, input.line), lines.length);
    lines.splice.apply(lines, __spreadArray([insertAt, 0], input.content.split('\n'), false));
    fs.writeFileSync(resolved, lines.join('\n'), 'utf-8');
    return "\u2713 ".concat(input.content.split('\n').length, " sat\u0131r eklendi (sat\u0131r ").concat(insertAt + 1, "): ").concat(resolved);
}
// ─── delete_lines: satır silme ──────────────────────────────────────────────
function deleteLines(input) {
    var resolved = path.resolve(input.path);
    if (!fs.existsSync(resolved))
        return "HATA: ".concat(resolved, " bulunamad\u0131");
    var lines = fs.readFileSync(resolved, 'utf-8').split('\n');
    var from = Math.max(0, input.from_line - 1);
    var to = Math.min(lines.length, input.to_line);
    var deleted = to - from;
    lines.splice(from, deleted);
    fs.writeFileSync(resolved, lines.join('\n'), 'utf-8');
    return "\u2713 ".concat(deleted, " sat\u0131r silindi (").concat(input.from_line, "-").concat(input.to_line, "): ").concat(resolved);
}
function parseEditBlocks(text) {
    var blocks = [];
    // EDIT: <dosya>\n<<<OLD>>>\n<old>\n<<<NEW>>>\n<new>\n<<<END>>>
    var pattern = /EDIT:\s*(.+?)\n<<<OLD>>>\n([\s\S]*?)<<<NEW>>>\n([\s\S]*?)<<<END>>>/g;
    var match;
    while ((match = pattern.exec(text)) !== null) {
        blocks.push({
            file: match[1].trim(),
            oldStr: match[2],
            newStr: match[3],
        });
    }
    return blocks;
}
function applyEditBlocks(blocks) {
    var results = [];
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        results.push(editFile({ path: block.file, old_string: block.oldStr, new_string: block.newStr }));
    }
    return results;
}
function parseNewFileBlocks(text) {
    var blocks = [];
    // ```\n// FILE: <yol>\n<içerik>\n```
    var pattern = /```(?:\w+)?\n\/\/\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g;
    var match;
    while ((match = pattern.exec(text)) !== null) {
        blocks.push({
            file: match[1].trim(),
            content: match[2].trimEnd(),
        });
    }
    return blocks;
}
function applyNewFileBlocks(blocks) {
    var results = [];
    for (var _i = 0, blocks_2 = blocks; _i < blocks_2.length; _i++) {
        var block = blocks_2[_i];
        var resolved = path.resolve(block.file);
        try {
            var dir = path.dirname(resolved);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(resolved, block.content, 'utf-8');
            results.push("\u2713 Dosya olu\u015Fturuldu: ".concat(block.file));
        }
        catch (err) {
            results.push("HATA: ".concat(block.file, " olu\u015Fturulamad\u0131: ").concat(err.message));
        }
    }
    return results;
}
// ─── diff görüntüleyici (terminal'de eski↔yeni yan yana) ────────────────────
function showInlineDiff(oldStr, newStr) {
    var _a, _b;
    var oldLines = oldStr.split('\n');
    var newLines = newStr.split('\n');
    var out = [];
    var maxLen = Math.max(oldLines.length, newLines.length);
    for (var i = 0; i < maxLen; i++) {
        var o = (_a = oldLines[i]) !== null && _a !== void 0 ? _a : '';
        var n = (_b = newLines[i]) !== null && _b !== void 0 ? _b : '';
        if (o === n) {
            out.push("  ".concat(o));
        }
        else {
            if (o)
                out.push("- ".concat(o));
            if (n)
                out.push("+ ".concat(n));
        }
    }
    return out.join('\n');
}
// ─── Yardımcı ────────────────────────────────────────────────────────────────
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
