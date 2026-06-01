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
exports.runPipeline = runPipeline;
var chalk_1 = require("chalk");
var config_1 = require("../config");
var planner_1 = require("./planner");
var coder_1 = require("./coder");
var judge_1 = require("./judge");
var edit_1 = require("../tools/edit");
var logger_1 = require("../services/logger");
// ─── Görsel yardımcılar ─────────────────────────────────────────────────────
function roleHeader(role, provider, model) {
    var colors = { PLANNER: chalk_1.default.magenta, CODER: chalk_1.default.blue, JUDGE: chalk_1.default.yellow };
    var icons = { PLANNER: '📐', CODER: '💻', JUDGE: '⚖️ ' };
    logger_1.logger.write('\n' + colors[role]("".concat(icons[role], " ").concat(role, " ")) + chalk_1.default.dim("[".concat(provider, " / ").concat(model, "]")) + '\n' + chalk_1.default.dim('─'.repeat(50)) + '\n');
}
function iterBadge(i, max) {
    logger_1.logger.write(chalk_1.default.bgBlue.white(" \u21BB \u0130terasyon ".concat(i, "/").concat(max, " ")) + '\n');
}
// ─── Ana Pipeline ───────────────────────────────────────────────────────────
function runPipeline(task_1, config_2) {
    return __awaiter(this, arguments, void 0, function (task, config, history, abortSignal) {
        var pipeline, maxIterations, plan, code, verdict, planDecision, plannerOutput_1, plannerTask, judgeFeedback, iteration, _loop_1, state_1;
        if (history === void 0) { history = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pipeline = config.pipeline;
                    maxIterations = Math.max(1, Math.min(pipeline.maxIterations || 5, 5));
                    logger_1.logger.write(chalk_1.default.bold('\n╔══ DEHA TEAM PIPELINE ═════════════════════════╗'));
                    logger_1.logger.write(chalk_1.default.bold("\u2551  Task: ") + chalk_1.default.white(task.slice(0, 44).padEnd(44)) + chalk_1.default.bold('║'));
                    logger_1.logger.write(chalk_1.default.bold('╚═══════════════════════════════════════════════╝\n'));
                    plan = "## TASK\n".concat(task);
                    code = '';
                    verdict = {
                        pass: false,
                        score: '?/10',
                        feedback: 'Judge henüz çalışmadı.',
                        raw: '',
                    };
                    return [4 /*yield*/, (0, coder_1.decideNeedPlan)(task, config)];
                case 1:
                    planDecision = _a.sent();
                    if (!planDecision.needPlan) return [3 /*break*/, 3];
                    logger_1.logger.write(chalk_1.default.magenta.bold('\n[1/3] 📐 PLANNER » CODER : ' + chalk_1.default.dim('Mimari plan hazırlanıyor...')));
                    roleHeader('PLANNER', (0, config_1.getProviderLabel)(pipeline.planner.provider), pipeline.planner.model);
                    plannerOutput_1 = '';
                    plannerTask = "Interactive Session Context:\n".concat(history.map(function (m) { return "".concat(m.role, ": ").concat(m.content); }).join('\n'), "\n\nCurrent Mission:\n").concat(task);
                    return [4 /*yield*/, (0, planner_1.runPlanner)(plannerTask, config, function (chunk) {
                            process.stdout.write(chalk_1.default.magenta(chunk));
                            plannerOutput_1 += chunk;
                        }, abortSignal)];
                case 2:
                    _a.sent();
                    process.stdout.write('\n');
                    plan = plannerOutput_1.trim() || plan;
                    return [3 /*break*/, 4];
                case 3:
                    logger_1.logger.write(chalk_1.default.dim("\n  \uD83D\uDCD0 Planner atland\u0131: ".concat(planDecision.reason || 'coder direkt başlayabilir')));
                    _a.label = 4;
                case 4:
                    iteration = 0;
                    _loop_1 = function () {
                        var coderOutput, newFiles, results, editBlocks, results, judgeOutput;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.aborted)
                                        throw new Error('Pipeline aborted by user.');
                                    if (iteration > 1) {
                                        logger_1.logger.write(chalk_1.default.yellow.bold("\n[RE-ITERATION] \u2696\uFE0F  JUDGE \u00BB CODER : " + chalk_1.default.dim('Hatalar gideriliyor...')));
                                    }
                                    else {
                                        logger_1.logger.write(chalk_1.default.blue.bold("\n[2/3] \uD83D\uDCBB CODER \u00BB JUDGE : " + chalk_1.default.dim('Kod yazılıyor...')));
                                    }
                                    iterBadge(iteration, maxIterations);
                                    roleHeader('CODER', (0, config_1.getProviderLabel)(pipeline.coder.provider), pipeline.coder.model);
                                    coderOutput = '';
                                    return [4 /*yield*/, (0, coder_1.runCoder)(plan, config, judgeFeedback, code || undefined, function (chunk) {
                                            process.stdout.write(chalk_1.default.blue(chunk));
                                            coderOutput += chunk;
                                        }, abortSignal)];
                                case 1:
                                    _b.sent();
                                    process.stdout.write('\n');
                                    code = coderOutput;
                                    newFiles = (0, edit_1.parseNewFileBlocks)(coderOutput);
                                    if (newFiles.length > 0) {
                                        logger_1.logger.write(chalk_1.default.dim("\n  \uD83D\uDCC2 ".concat(newFiles.length, " yeni dosya olu\u015Fturuluyor...")));
                                        results = (0, edit_1.applyNewFileBlocks)(newFiles);
                                        results.forEach(function (r) { return logger_1.logger.write(chalk_1.default.dim("     ".concat(r))); });
                                    }
                                    editBlocks = (0, edit_1.parseEditBlocks)(coderOutput);
                                    if (editBlocks.length > 0) {
                                        logger_1.logger.write(chalk_1.default.dim("\n  \uD83D\uDD8A\uFE0F  ".concat(editBlocks.length, " EDIT blo\u011Fu uygulan\u0131yor...")));
                                        results = (0, edit_1.applyEditBlocks)(editBlocks);
                                        results.forEach(function (r) { return logger_1.logger.write(chalk_1.default.dim("     ".concat(r))); });
                                    }
                                    logger_1.logger.write(chalk_1.default.yellow.bold("\n[3/3] \u2696\uFE0F  JUDGE \u00BB TEAM : " + chalk_1.default.dim('Kod denetleniyor...')));
                                    roleHeader('JUDGE', (0, config_1.getProviderLabel)(pipeline.judge.provider), pipeline.judge.model);
                                    judgeOutput = '';
                                    return [4 /*yield*/, (0, judge_1.runJudge)(task, plan, code, config, function (chunk) {
                                            process.stdout.write(chalk_1.default.yellow(chunk));
                                            judgeOutput += chunk;
                                        }, abortSignal)];
                                case 2:
                                    verdict = _b.sent();
                                    process.stdout.write('\n');
                                    if (verdict.pass)
                                        return [2 /*return*/, "break"];
                                    judgeFeedback = verdict.feedback || judgeOutput || verdict.raw;
                                    return [2 /*return*/];
                            }
                        });
                    };
                    iteration = 1;
                    _a.label = 5;
                case 5:
                    if (!(iteration <= maxIterations)) return [3 /*break*/, 8];
                    return [5 /*yield**/, _loop_1()];
                case 6:
                    state_1 = _a.sent();
                    if (state_1 === "break")
                        return [3 /*break*/, 8];
                    _a.label = 7;
                case 7:
                    iteration++;
                    return [3 /*break*/, 5];
                case 8:
                    // ── Özet ─────────────────────────────────────────────────────────────────
                    if (verdict.pass) {
                        logger_1.logger.successBox('PIPELINE BAŞARILI', "Skor: ".concat(verdict.score, " \u2022 \u0130terasyon: ").concat(Math.min(iteration, maxIterations), "/").concat(maxIterations));
                    }
                    else {
                        logger_1.logger.warningBox('PIPELINE TAMAMLANDI (Fail)', "Skor: ".concat(verdict.score, " \u2022 \u0130terasyon: ").concat(Math.min(iteration, maxIterations), "/").concat(maxIterations));
                    }
                    return [2 /*return*/, { plan: plan, finalCode: code, verdict: verdict, iterations: Math.min(iteration, maxIterations) }];
            }
        });
    });
}
