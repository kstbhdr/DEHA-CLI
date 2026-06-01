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
exports.handleHistoryCommand = handleHistoryCommand;
var chalk_1 = require("chalk");
var logger_1 = require("../services/logger");
var manager_1 = require("./manager");
function handleHistoryCommand(args) {
    return __awaiter(this, void 0, void 0, function () {
        var parts, sub;
        return __generator(this, function (_a) {
            parts = args.trim().split(/\s+/);
            sub = parts[0] || 'list';
            switch (sub) {
                case 'list':
                case '':
                    showList();
                    return [2 /*return*/, null];
                case 'search':
                    showSearch(parts.slice(1).join(' '));
                    return [2 /*return*/, null];
                case 'open':
                case 'show':
                    return [2 /*return*/, showConversation(parts[1])];
                case 'dir':
                    logger_1.logger.write(chalk_1.default.cyan('\n  Konum: ') + (0, manager_1.getConvDir)() + '\n');
                    return [2 /*return*/, null];
                default:
                    if (/^\d+$/.test(sub)) {
                        return [2 /*return*/, showByIndex(parseInt(sub, 10) - 1)];
                    }
                    return [2 /*return*/, showConversation(sub)];
            }
            return [2 /*return*/];
        });
    });
}
// ─── Liste ───────────────────────────────────────────────────────────────────
function showList() {
    var convs = (0, manager_1.listConversations)(100);
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ Sohbet Geçmişi ═══'));
    logger_1.logger.write(chalk_1.default.dim("  Konum: ".concat((0, manager_1.getConvDir)(), "\n")));
    if (convs.length === 0) {
        logger_1.logger.write(chalk_1.default.dim('  Henüz kayıtlı sohbet yok.\n'));
        logger_1.logger.write(chalk_1.default.dim('  Sohbet bittiğinde otomatik kaydedilir.\n'));
        return;
    }
    convs.forEach(function (conv, i) {
        var num = chalk_1.default.dim("".concat(String(i + 1).padStart(2, ' '), "."));
        var date = chalk_1.default.dim(formatDisplayDate(conv.date));
        var title = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
        var badge = chalk_1.default.dim("[".concat(conv.provider, "/").concat(conv.model.split('-').slice(-2).join('-'), "]"));
        var msgs = chalk_1.default.dim("".concat(conv.messageCount, " mesaj"));
        logger_1.logger.write("  ".concat(num, " ").concat(date, "  ").concat(chalk_1.default.white(title)));
        logger_1.logger.write("       ".concat(badge, "  ").concat(msgs));
    });
    logger_1.logger.write('');
    logger_1.logger.write(chalk_1.default.dim('  /oldconversations 3       → 3. sohbeti görüntüle'));
    logger_1.logger.write(chalk_1.default.dim('  /oldconversations search <kelime>  → ara'));
    logger_1.logger.write('');
}
// ─── Arama ───────────────────────────────────────────────────────────────────
function showSearch(query) {
    if (!query) {
        logger_1.logger.write(chalk_1.default.red('\n  Kullanım: /oldconversations search <kelime>\n'));
        return;
    }
    var results = (0, manager_1.searchConversations)(query);
    logger_1.logger.write("\n".concat(chalk_1.default.bold.cyan('Arama:'), " \"").concat(query, "\"  \u2014 ").concat(results.length, " sonu\u00E7\n"));
    if (results.length === 0) {
        logger_1.logger.write(chalk_1.default.dim('  Eşleşen sohbet bulunamadı.\n'));
        return;
    }
    results.slice(0, 15).forEach(function (conv, i) {
        var num = chalk_1.default.dim("".concat(String(i + 1).padStart(2, ' '), "."));
        var date = chalk_1.default.dim(formatDisplayDate(conv.date));
        var title = conv.title.length > 45 ? conv.title.slice(0, 45) + '…' : conv.title;
        logger_1.logger.write("  ".concat(num, " ").concat(date, "  ").concat(chalk_1.default.white(title)));
        logger_1.logger.write(chalk_1.default.dim("       ID: ".concat(conv.id)));
    });
    logger_1.logger.write('');
}
// ─── Sohbet görüntüle (index ile) ────────────────────────────────────────────
function showByIndex(index) {
    var convs = (0, manager_1.listConversations)(100);
    if (index < 0 || index >= convs.length) {
        logger_1.logger.write(chalk_1.default.red("\n  Ge\u00E7ersiz numara. 1-".concat(convs.length, " aras\u0131nda gir.\n")));
        return null;
    }
    return showConversation(convs[index].id);
}
// ─── Sohbet görüntüle (ID ile) ───────────────────────────────────────────────
function showConversation(id) {
    if (!id) {
        logger_1.logger.write(chalk_1.default.red('\n  Kullanım: /oldconversations <numara|id>\n'));
        return null;
    }
    var raw = (0, manager_1.readConversation)(id);
    if (!raw) {
        logger_1.logger.write(chalk_1.default.red("\n  Sohbet bulunamad\u0131: ".concat(id, "\n")));
        return null;
    }
    var body = raw.replace(/^---[\s\S]*?---\n/, '');
    logger_1.logger.write('\n' + chalk_1.default.dim('─'.repeat(60)));
    // Tüm içeriği tek seferde yazdır — ikinci readline çakışmasını önle
    logger_1.logger.write(renderMarkdown(body));
    logger_1.logger.write(chalk_1.default.dim('─'.repeat(60)) + '\n');
    var messages = (0, manager_1.loadConversationMessages)(id);
    if (!messages) {
        logger_1.logger.write(chalk_1.default.yellow('  Sohbet görüntülendi ama mesajlar aktif bağlama yüklenemedi.\n'));
        return null;
    }
    logger_1.logger.write(chalk_1.default.dim('  Aktif sohbet olarak yüklendi. Devam: ') + chalk_1.default.cyan("deha resume ".concat(id)) + '\n');
    return { id: id, messages: messages };
}
// ─── Markdown → terminal renderer (minimal) ──────────────────────────────────
function renderMarkdown(md) {
    return md
        .replace(/^## 🧑 (.+)$/gm, chalk_1.default.bold.green('👤 $1'))
        .replace(/^## 🤖 (.+)$/gm, chalk_1.default.bold.cyan('🤖 $1'))
        .replace(/^# (.+)$/gm, chalk_1.default.bold.white('$1'))
        .replace(/^> (.+)$/gm, chalk_1.default.dim('  $1'))
        .replace(/```(\w*)\n([\s\S]*?)```/g, function (_m, lang, code) {
        return chalk_1.default.bgGray.white(" ".concat(lang || 'code', " ")) + '\n' + chalk_1.default.cyan(code.trimEnd()) + '\n';
    })
        .replace(/`([^`]+)`/g, chalk_1.default.yellow('$1'))
        .replace(/\*\*(.+?)\*\*/g, chalk_1.default.bold('$1'))
        .replace(/^---$/gm, chalk_1.default.dim('─'.repeat(50)));
}
// ─── Yardımcı ────────────────────────────────────────────────────────────────
function formatDisplayDate(iso) {
    try {
        var d = new Date(iso);
        return "".concat(d.toLocaleDateString('tr-TR'), " ").concat(d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    }
    catch (_a) {
        return iso.slice(0, 10);
    }
}
