"use strict";
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
exports.formatResponse = formatResponse;
exports.chat = chat;
var chalk_1 = require("chalk");
var ai_service_1 = require("../services/ai-service");
var intent_1 = require("../services/intent");
function formatResponse(text) {
    var formatted = text;
    // Kod bloklarını renklendir ve çerçevele
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, function (_match, lang, code) {
        var cleanCode = code.trimEnd();
        var lines = cleanCode.split('\n');
        var width = Math.min(80, Math.max.apply(Math, lines.map(function (l) { return l.length; })) + 4);
        var top = chalk_1.default.gray('╭' + '─'.repeat(width - 2) + '╮');
        var header = lang
            ? chalk_1.default.gray('│ ') + chalk_1.default.bgWhite.black(" ".concat(lang.toUpperCase(), " ")) + chalk_1.default.gray('─'.repeat(width - lang.length - 5) + '┤')
            : chalk_1.default.gray('├' + '─'.repeat(width - 2) + '┤');
        var bottom = chalk_1.default.gray('╰' + '─'.repeat(width - 2) + '╯');
        var body = lines.map(function (l) { return chalk_1.default.gray('│ ') + chalk_1.default.cyan(l.padEnd(width - 4)) + chalk_1.default.gray(' │'); }).join('\n');
        return '\n' + top + '\n' + header + '\n' + body + '\n' + bottom + '\n';
    });
    // Inline kod
    formatted = formatted.replace(/`([^`]+)`/g, chalk_1.default.bgGray.yellow(' $1 '));
    // Başlıklar - Daha modern stiller
    formatted = formatted.replace(/^### (.+)$/gm, chalk_1.default.bold.magenta('● $1'));
    formatted = formatted.replace(/^## (.+)$/gm, chalk_1.default.bold.cyan('❯ $1'));
    formatted = formatted.replace(/^# (.+)$/gm, function (match, p1) {
        var title = p1.trim();
        var line = '═'.repeat(title.length + 4);
        return chalk_1.default.bold.white("\n".concat(line, "\n  ").concat(title, "\n").concat(line));
    });
    // Bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, chalk_1.default.bold.yellow('$1'));
    // Liste maddeleri
    formatted = formatted.replace(/^- (.+)$/gm, chalk_1.default.cyan('  •') + ' $1');
    return formatted;
}
function chat(prompt_1, config_1) {
    return __awaiter(this, arguments, void 0, function (prompt, config, history, stream) {
        var enrichedPrompt, searchSystemAddendum, intent, _a, activeConfig, messages, full_1, full_2, err_1, message;
        if (history === void 0) { history = []; }
        if (stream === void 0) { stream = false; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    enrichedPrompt = prompt;
                    searchSystemAddendum = '';
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, (0, intent_1.detectIntent)(prompt, config)];
                case 2:
                    intent = _b.sent();
                    if (!(intent.search && intent.keywords)) return [3 /*break*/, 4];
                    process.stdout.write(chalk_1.default.dim("\n  \uD83C\uDF0D Searching: \"".concat(intent.keywords, "\"... ")));
                    return [4 /*yield*/, (0, intent_1.enrichWithSearch)(prompt, intent.keywords)];
                case 3:
                    enrichedPrompt = _b.sent();
                    searchSystemAddendum = [
                        '',
                        '=== WEB ARAMA SONUÇLARI MEVCUT ===',
                        'Kullanıcının sorusunu cevaplamak için yukarıdaki [WEB ARAMA SONUÇLARI] bölümündeki verileri KULLAN.',
                        'Bu veriler gerçek zamanlıdır. Bunları kullanarak cevap ver.',
                        'Kesinlikle "veriye erişimim yok", "canlı verim yok", "üzgünüm" gibi ifadeler KULLANMA.',
                        'Verileri oku, özetle ve kaynaklarıyla birlikte sun.',
                    ].join('\n');
                    process.stdout.write(chalk_1.default.green('✓\n'));
                    _b.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    return [3 /*break*/, 6];
                case 6:
                    activeConfig = __assign({}, config);
                    if (searchSystemAddendum) {
                        activeConfig.systemPrompt = (config.systemPrompt || '') + '\n' + searchSystemAddendum;
                    }
                    messages = __spreadArray(__spreadArray([], history, true), [{ role: 'user', content: enrichedPrompt }], false);
                    _b.label = 7;
                case 7:
                    _b.trys.push([7, 11, , 12]);
                    if (!stream) return [3 /*break*/, 9];
                    full_1 = '';
                    return [4 /*yield*/, (0, ai_service_1.streamMessage)(messages, activeConfig, function (chunk) {
                            process.stdout.write(chunk);
                            full_1 += chunk;
                        })];
                case 8:
                    _b.sent();
                    process.stdout.write('\n');
                    return [2 /*return*/, full_1];
                case 9:
                    full_2 = '';
                    process.stdout.write(chalk_1.default.bold.cyan('DEHA: '));
                    return [4 /*yield*/, (0, ai_service_1.streamMessage)(messages, activeConfig, function (chunk) {
                            process.stdout.write(chunk);
                            full_2 += chunk;
                        })];
                case 10:
                    _b.sent();
                    process.stdout.write('\n');
                    return [2 /*return*/, full_2];
                case 11:
                    err_1 = _b.sent();
                    message = err_1 instanceof Error ? err_1.message : String(err_1);
                    throw new Error(message);
                case 12: return [2 /*return*/];
            }
        });
    });
}
