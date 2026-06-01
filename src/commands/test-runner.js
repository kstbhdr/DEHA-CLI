"use strict";
/**
 * DEHA System Test — /test komutu
 *
 * 1. API bağlantı testleri (Chat / Planner / Coder / Judge / Vision)
 * 2. Pipeline entegrasyon testi (hardcoded prompt → Planner → Coder → Judge)
 */
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
exports.runSystemTest = runSystemTest;
var chalk_1 = require("chalk");
var config_1 = require("../config");
var ai_service_1 = require("../services/ai-service");
var ai_service_2 = require("../services/ai-service");
var planner_1 = require("../pipeline/planner");
var coder_1 = require("../pipeline/coder");
var judge_1 = require("../pipeline/judge");
var logger_1 = require("../services/logger");
// ─── Sabitler ────────────────────────────────────────────────────────────────
var TEST_PROMPT = 'Write a TypeScript function called `add` that takes two numbers and returns their sum. Include a JSDoc comment.';
var PASS = chalk_1.default.bgGreen.black(' PASS ');
var FAIL = chalk_1.default.bgRed.white(' FAIL ');
var SKIP = chalk_1.default.bgGray.white(' SKIP ');
var ARROW = chalk_1.default.dim('  →  ');
// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function header(title) {
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('━'.repeat(54)));
    logger_1.logger.write(chalk_1.default.bold.cyan("  ".concat(title)));
    logger_1.logger.write(chalk_1.default.bold.cyan('━'.repeat(54)));
}
function result(label, ok, detail) {
    if (detail === void 0) { detail = ''; }
    var badge = ok === null ? SKIP : ok ? PASS : FAIL;
    var text = detail ? chalk_1.default.dim(ARROW + detail) : '';
    logger_1.logger.write("  ".concat(badge, "  ").concat(label).concat(text));
}
function ms(start) {
    return chalk_1.default.dim("".concat(Date.now() - start, "ms"));
}
// ─── 1. API bağlantı testleri ─────────────────────────────────────────────────
function testApi(label, fn) {
    return __awaiter(this, void 0, void 0, function () {
        var t, res, preview, err_1, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    t = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fn()];
                case 2:
                    res = _a.sent();
                    preview = res.trim().slice(0, 60).replace(/\n/g, ' ');
                    return [2 /*return*/, { ok: true, detail: "".concat(ms(t), "  \"").concat(preview, "\u2026\"") }];
                case 3:
                    err_1 = _a.sent();
                    msg = err_1 instanceof Error ? err_1.message.slice(0, 80) : String(err_1).slice(0, 80);
                    return [2 /*return*/, { ok: false, detail: "".concat(ms(t), "  ").concat(msg) }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function runSystemTest(config) {
    return __awaiter(this, void 0, void 0, function () {
        var summary, ping, label, r, p_1, label, r, p_2, label, r, p_3, label, r, plan, t, preview, err_2, msg, code, t, hasFunction, err_3, msg, t, verdict, verdictOk, err_4, msg, passed, failed, _i, summary_1, s, ok, total, color;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    summary = [];
                    // ── 1. API Testleri ────────────────────────────────────────────────────────
                    header('1 / 2  —  API Bağlantı Testleri');
                    ping = [{ role: 'user', content: 'Reply with exactly: OK' }];
                    label = "Chat  [".concat((0, config_1.getProviderLabel)(config.provider), " / ").concat(_chatModel(config), "]");
                    process.stdout.write("  \u23F3 ".concat(label, "\u2026\r"));
                    return [4 /*yield*/, testApi(label, function () { return (0, ai_service_1.sendMessage)(ping, config); })];
                case 1:
                    r = _a.sent();
                    result(label, r.ok, r.detail);
                    summary.push({ label: 'Chat API', ok: r.ok });
                    p_1 = config.pipeline.planner;
                    label = "Planner  [".concat((0, config_1.getProviderLabel)(p_1.provider), " / ").concat(p_1.model, "]");
                    process.stdout.write("  \u23F3 ".concat(label, "\u2026\r"));
                    return [4 /*yield*/, testApi(label, function () {
                            return (0, ai_service_2.callRole)(p_1, config, ping, 'Reply with exactly: OK');
                        })];
                case 2:
                    r = _a.sent();
                    result(label, r.ok, r.detail);
                    summary.push({ label: 'Planner API', ok: r.ok });
                    p_2 = config.pipeline.coder;
                    label = "Coder  [".concat((0, config_1.getProviderLabel)(p_2.provider), " / ").concat(p_2.model, "]");
                    process.stdout.write("  \u23F3 ".concat(label, "\u2026\r"));
                    return [4 /*yield*/, testApi(label, function () {
                            return (0, ai_service_2.callRole)(p_2, config, ping, 'Reply with exactly: OK');
                        })];
                case 3:
                    r = _a.sent();
                    result(label, r.ok, r.detail);
                    summary.push({ label: 'Coder API', ok: r.ok });
                    p_3 = config.pipeline.judge;
                    label = "Judge  [".concat((0, config_1.getProviderLabel)(p_3.provider), " / ").concat(p_3.model, "]");
                    process.stdout.write("  \u23F3 ".concat(label, "\u2026\r"));
                    return [4 /*yield*/, testApi(label, function () {
                            return (0, ai_service_2.callRole)(p_3, config, ping, 'Reply with exactly: OK');
                        })];
                case 4:
                    r = _a.sent();
                    result(label, r.ok, r.detail);
                    summary.push({ label: 'Judge API', ok: r.ok });
                    // ── 2. Pipeline Entegrasyon Testi ─────────────────────────────────────────
                    header('2 / 2  —  Pipeline Entegrasyon Testi');
                    logger_1.logger.write(chalk_1.default.dim("  Prompt: \"".concat(TEST_PROMPT, "\"\n")));
                    plan = '';
                    t = Date.now();
                    process.stdout.write(chalk_1.default.magenta('  🧠 Planner çalışıyor…\r'));
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, planner_1.runPlanner)(TEST_PROMPT, config, function (chunk) { plan += chunk; })];
                case 6:
                    _a.sent();
                    preview = plan.trim().slice(0, 80).replace(/\n/g, ' ');
                    result('Planner  → plan üretildi', true, "".concat(ms(t), "  \"").concat(preview, "\u2026\""));
                    summary.push({ label: 'Planner (pipeline)', ok: true });
                    return [3 /*break*/, 8];
                case 7:
                    err_2 = _a.sent();
                    msg = err_2 instanceof Error ? err_2.message.slice(0, 80) : String(err_2);
                    result('Planner  → plan üretildi', false, msg);
                    summary.push({ label: 'Planner (pipeline)', ok: false });
                    plan = 'Write a TypeScript add() function.'; // fallback — devam et
                    return [3 /*break*/, 8];
                case 8:
                    code = '';
                    t = Date.now();
                    process.stdout.write(chalk_1.default.blue('  💻 Coder çalışıyor…\r'));
                    _a.label = 9;
                case 9:
                    _a.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, (0, coder_1.runCoder)(plan, config, undefined, undefined, function (chunk) { code += chunk; })];
                case 10:
                    _a.sent();
                    hasFunction = /function\s+add|const\s+add|=>\s*\w+/.test(code);
                    result('Coder  → kod yazıldı', hasFunction, "".concat(ms(t), "  ").concat(hasFunction ? chalk_1.default.green('add() fonksiyonu bulundu') : chalk_1.default.red('add() fonksiyonu bulunamadı')));
                    summary.push({ label: 'Coder (pipeline)', ok: hasFunction });
                    return [3 /*break*/, 12];
                case 11:
                    err_3 = _a.sent();
                    msg = err_3 instanceof Error ? err_3.message.slice(0, 80) : String(err_3);
                    result('Coder  → kod yazıldı', false, msg);
                    summary.push({ label: 'Coder (pipeline)', ok: false });
                    code = 'function add(a: number, b: number): number { return a + b; }';
                    return [3 /*break*/, 12];
                case 12:
                    t = Date.now();
                    process.stdout.write(chalk_1.default.yellow('  ⚖️  Judge çalışıyor…\r'));
                    _a.label = 13;
                case 13:
                    _a.trys.push([13, 15, , 16]);
                    return [4 /*yield*/, (0, judge_1.runJudge)(TEST_PROMPT, plan, code, config)];
                case 14:
                    verdict = _a.sent();
                    verdictOk = verdict.pass || verdict.score !== '?/10';
                    result('Judge  → değerlendirme yapıldı', verdictOk, "".concat(ms(t), "  ").concat(chalk_1.default.bold(verdict.score), "  ").concat(verdict.pass ? chalk_1.default.green('PASS') : chalk_1.default.red('FAIL'), "  ").concat(chalk_1.default.dim(verdict.feedback.slice(0, 60))));
                    summary.push({ label: 'Judge (pipeline)', ok: verdictOk });
                    // Judge FAIL dönerse geri bildirimi göster
                    if (!verdict.pass) {
                        logger_1.logger.write(chalk_1.default.dim('\n  Judge geri bildirimi:'));
                        logger_1.logger.write(chalk_1.default.yellow(verdict.feedback.split('\n').map(function (l) { return '    ' + l; }).join('\n')));
                    }
                    return [3 /*break*/, 16];
                case 15:
                    err_4 = _a.sent();
                    msg = err_4 instanceof Error ? err_4.message.slice(0, 80) : String(err_4);
                    result('Judge  → değerlendirme yapıldı', false, msg);
                    summary.push({ label: 'Judge (pipeline)', ok: false });
                    return [3 /*break*/, 16];
                case 16:
                    // ── Özet ───────────────────────────────────────────────────────────────────
                    header('Test Özeti');
                    passed = 0, failed = 0;
                    for (_i = 0, summary_1 = summary; _i < summary_1.length; _i++) {
                        s = summary_1[_i];
                        ok = s.ok === null ? null : s.ok;
                        if (ok === true)
                            passed++;
                        if (ok === false)
                            failed++;
                        result(s.label, ok);
                    }
                    total = passed + failed;
                    color = failed === 0 ? chalk_1.default.green : chalk_1.default.red;
                    logger_1.logger.write('\n' + color("  ".concat(passed, "/").concat(total, " test ge\u00E7ti")) + (failed > 0 ? chalk_1.default.red("  (".concat(failed, " ba\u015Far\u0131s\u0131z)")) : '') + '\n');
                    return [2 /*return*/];
            }
        });
    });
}
// ─── Yardımcı ────────────────────────────────────────────────────────────────
function _chatModel(config) {
    var _a;
    var m = {
        claude: config.claudeModel, openai: config.openaiModel,
        deepseek: config.deepseekModel, openrouter: config.openrouterModel,
        xai: config.xaiModel, ollama: config.ollamaModel, custom: config.customModel,
    };
    return (_a = m[config.provider]) !== null && _a !== void 0 ? _a : config.provider;
}
