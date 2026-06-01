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
exports.showDiff = showDiff;
exports.reviewDiff = reviewDiff;
var chalk_1 = require("chalk");
var child_process_1 = require("child_process");
var config_1 = require("../config");
var logger_1 = require("../services/logger");
var ai_service_1 = require("../services/ai-service");
// ─── deha diff ───────────────────────────────────────────────────────────────
function showDiff() {
    var _a, _b;
    try {
        // Git repo kontrolü
        (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: '.' });
    }
    catch (_c) {
        logger_1.logger.write(chalk_1.default.yellow('Bu bir git reposu değil. LINTEN: Mevcut değişiklikler gösterilemiyor.'));
        return;
    }
    // Staged + unstaged diff
    var diff = '';
    try {
        diff = (0, child_process_1.execSync)('git diff HEAD', { encoding: 'utf-8', cwd: '.' }).trim();
    }
    catch (_d) {
        // İlk commit'ten önce HEAD olmayabilir
        try {
            diff = (0, child_process_1.execSync)('git diff', { encoding: 'utf-8', cwd: '.' }).trim();
        }
        catch ( /* */_e) { /* */ }
    }
    if (!diff) {
        logger_1.logger.write(chalk_1.default.dim('Hiçbir değişiklik yok.'));
        return;
    }
    // Syntax highlighting + satır numarası
    var lines = diff.split('\n');
    var maxLineNum = String(lines.length).length;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var lineNum = String(i + 1).padStart(maxLineNum, ' ');
        if (line.startsWith('+')) {
            logger_1.logger.write(chalk_1.default.green("".concat(lineNum, " ").concat(line)));
        }
        else if (line.startsWith('-')) {
            logger_1.logger.write(chalk_1.default.red("".concat(lineNum, " ").concat(line)));
        }
        else if (line.startsWith('@@')) {
            logger_1.logger.write(chalk_1.default.cyan("".concat(lineNum, " ").concat(line)));
        }
        else if (line.startsWith('diff --git') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
            logger_1.logger.write(chalk_1.default.bold.white("".concat(lineNum, " ").concat(line)));
        }
        else {
            logger_1.logger.write(chalk_1.default.dim("".concat(lineNum, " ").concat(line)));
        }
    }
    // Özet
    var added = diff.split('\n').filter(function (l) { return l.startsWith('+') && !l.startsWith('+++'); }).length;
    var removed = diff.split('\n').filter(function (l) { return l.startsWith('-') && !l.startsWith('---'); }).length;
    var files = (_b = (_a = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm)) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    logger_1.logger.write(chalk_1.default.dim("\n".concat(files, " dosya, +").concat(added, " / -").concat(removed, " sat\u0131r")));
}
// ─── deha review ─────────────────────────────────────────────────────────────
function reviewDiff() {
    return __awaiter(this, void 0, void 0, function () {
        var diff, config, messages, review, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    diff = '';
                    try {
                        (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: '.' });
                        diff = (0, child_process_1.execSync)('git diff HEAD', { encoding: 'utf-8', cwd: '.' }).trim();
                        if (!diff) {
                            try {
                                diff = (0, child_process_1.execSync)('git diff --cached', { encoding: 'utf-8', cwd: '.' }).trim();
                            }
                            catch ( /* */_b) { /* */ }
                        }
                    }
                    catch (_c) {
                        logger_1.logger.write(chalk_1.default.yellow('Git reposu bulunamadı.'));
                        return [2 /*return*/];
                    }
                    if (!diff) {
                        logger_1.logger.write(chalk_1.default.dim('Review edilecek değişiklik yok.'));
                        return [2 /*return*/];
                    }
                    logger_1.logger.write(chalk_1.default.cyan('🔍 Diff AI ile review ediliyor...\n'));
                    config = (0, config_1.getConfig)();
                    messages = [
                        {
                            role: 'user',
                            content: "A\u015Fa\u011F\u0131daki kod diff pull request review'i yap. \u015Eu ba\u015Fl\u0131klar\u0131 kullan:\n- **\u00D6zet**: De\u011Fi\u015Fiklik ne i\u015Fe yar\u0131yor?\n- **Code Quality**: Kod kalitesi, naming, consistency\n- **Potential Bugs**: Olas\u0131 hatalar veya edge case'ler\n- **Improvements**: \u0130yile\u015Ftirme \u00F6nerileri\n- **Score**: 1-10 aras\u0131 puan\n\nHer madde i\u00E7in dosya ad\u0131 ve sat\u0131r numaras\u0131 belirt.\n\n```diff\n".concat(diff.slice(0, 15000), "\n```"),
                        },
                    ];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, ai_service_1.sendMessage)(messages, config)];
                case 2:
                    review = _a.sent();
                    logger_1.logger.write(review);
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    logger_1.logger.error(chalk_1.default.red('Review hatası: '), err_1 instanceof Error ? err_1.message : String(err_1));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
