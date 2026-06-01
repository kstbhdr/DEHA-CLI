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
exports.interactive = interactive;
var readline = require("readline");
var fs = require("fs");
var path = require("path");
var stream_1 = require("stream");
var chalk_1 = require("chalk");
var config_1 = require("../config");
var ai_service_1 = require("../services/ai-service");
var agent_1 = require("./agent");
var manager_1 = require("../mcp/manager");
var commands_1 = require("../mcp/commands");
var update_1 = require("./update");
var manager_2 = require("../conversations/manager");
var commands_2 = require("../conversations/commands");
var terminal_1 = require("../tools/terminal");
var model_setup_1 = require("./model-setup");
var usage_tracker_1 = require("../services/usage-tracker");
var intent_1 = require("../services/intent");
var tool_router_1 = require("../services/tool-router");
var memory_1 = require("../services/memory");
var session_memory_1 = require("../services/session-memory");
var token_counter_1 = require("../services/token-counter");
var process_manager_1 = require("../services/process-manager");
var version_1 = require("../version");
var logger_1 = require("../services/logger");
var BANNER = "\n".concat(chalk_1.default.bold.cyan('╭────────────────────────────────────────────────╮'), "\n").concat(chalk_1.default.bold.cyan('│'), "  ").concat(chalk_1.default.bold.white('DEHA'), " ").concat(chalk_1.default.cyan('AI'), " ").concat(chalk_1.default.dim('— Professional Coding Assistant'), "    ").concat(chalk_1.default.bold.cyan('│'), "\n").concat(chalk_1.default.bold.cyan('│'), "  ").concat(chalk_1.default.dim("v".concat(version_1.DEHA_VERSION)), "  ").concat(chalk_1.default.dim('•'), "  ").concat(chalk_1.default.dim('github.com/deha-cli'), "              ").concat(chalk_1.default.bold.cyan('│'), "\n").concat(chalk_1.default.bold.cyan('╰────────────────────────────────────────────────╯'), "\n");
var HELP_TEXT = "\n".concat(chalk_1.default.bold('Komutlar:'), "\n  ").concat(chalk_1.default.cyan('/help'), "                    Bu yard\u0131m mesaj\u0131n\u0131 g\u00F6ster\n  ").concat(chalk_1.default.cyan('/new'), "                     Yeni sohbet ba\u015Flat\n  ").concat(chalk_1.default.cyan('/clear'), "                   Sohbet ge\u00E7mi\u015Fini temizle\n  ").concat(chalk_1.default.cyan('/model'), "                   Model & provider ayarlar\u0131n\u0131 d\u00FCzenle (Chat/Planner/Coder/Judge/Vision)\n  ").concat(chalk_1.default.cyan('/thinking [on|off] [effort]'), " DeepSeek thinking mode'u a\u00E7/kapat\n  ").concat(chalk_1.default.cyan('/agent <soru>'), "            Ara\u00E7 \u00E7a\u011F\u0131rabilen ajan modu (Claude)\n  ").concat(chalk_1.default.cyan('/build <görev>'), "           Planner/Coder/Judge build ak\u0131\u015F\u0131n\u0131 \u00E7al\u0131\u015Ft\u0131r\n  ").concat(chalk_1.default.cyan('/file <yol>'), "              Dosyay\u0131 ba\u011Flama ekle\n  ").concat(chalk_1.default.cyan('/architecture <yol>'), "      Mimari d\u00F6k\u00FCman\u0131 (Second Brain) context'e m\u0131hlar\n  ").concat(chalk_1.default.cyan('/mcp <list|status|...>'), "        MCP sunucu y\u00F6netimi\n  ").concat(chalk_1.default.cyan('/oldconversations [n|search]'), "  Eski sohbetleri g\u00F6r\u00FCnt\u00FCle\n  ").concat(chalk_1.default.cyan('/run <komut>'), "                  Terminal komutu \u00E7al\u0131\u015Ft\u0131r\n  ").concat(chalk_1.default.cyan('/python <kod>'), "                 Python kodu \u00E7al\u0131\u015Ft\u0131r\n  ").concat(chalk_1.default.cyan('/smoketest <url>'), "              HTTP smoke testi yap\n  ").concat(chalk_1.default.cyan('/screenshot <url>'), "             Ekran g\u00F6r\u00FCnt\u00FCs\u00FC al\n  ").concat(chalk_1.default.cyan('/vision <url>'), "                 Screenshot + AI analizi\n  ").concat(chalk_1.default.cyan('/plannerchat'), "                 Planner rol\u00FC ile direkt konu\u015Fma modunu a\u00E7/kapat\n  ").concat(chalk_1.default.cyan('/judgechat'), "                   Judge rol\u00FC ile direkt konu\u015Fma modunu a\u00E7/kapat\n  ").concat(chalk_1.default.cyan('/pin <metin>'), "                \u00D6nemli bilgileri context'in en ba\u015F\u0131na (Cache) sabitler\n  ").concat(chalk_1.default.cyan('/unpin'), "                       T\u00FCm sabitlenmi\u015F bilgileri temizler\n  ").concat(chalk_1.default.cyan('/stats'), "                        Token kullan\u0131m\u0131 ve maliyet istatistikleri\n  ").concat(chalk_1.default.cyan('/test'), "                         API ve pipeline sistem testi\n  ").concat(chalk_1.default.cyan('/judge <dosya> <görev>'), "   Sadece Judge rol\u00FCn\u00FC \u00E7al\u0131\u015Ft\u0131rarak bir dosyay\u0131 de\u011Ferlendir\n  ").concat(chalk_1.default.cyan('/exit'), "                         \u00C7\u0131k\u0131\u015F yap\n\n").concat(chalk_1.default.bold('@dosya.ts sözdizimi:'), "\n  Mesaj\u0131n i\u00E7ine ").concat(chalk_1.default.yellow('@./src/index.ts'), " yazarak dosya i\u00E7eri\u011Fini otomatik ekle.\n");
var COMMAND_SUGGESTIONS = [
    '/help', '/new', '/clear', '/model', '/thinking', '/agent', '/build', '/file', '/architecture',
    '/mcp', '/history', '/oldconversations', '/run', '/python', '/smoketest', '/screenshot',
    '/vision', '/plannerchat', '/judgechat', '/pin', '/unpin', '/stats', '/test', '/judge', '/exit',
];
var PASTE_START = '\x1b[200~';
var PASTE_END = '\x1b[201~';
var PASTE_PLACEHOLDER_PATTERN = /\[Pasted Content (\d+) chars #(\d+)\]/g;
function interactive(config_2) {
    return __awaiter(this, arguments, void 0, function (config, initialHistory, initialConversationId) {
        var pasteInput, rl, sessionUsageSnapshot, activeAbortController, lastSuggestion, activeRole, specializedHistories, isAIActive, onGlobalKeypress, history, conversationId, prompt;
        var _this = this;
        if (initialHistory === void 0) { initialHistory = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.write(BANNER);
                    logger_1.logger.write(chalk_1.default.dim('Provider: ') + chalk_1.default.green((0, config_1.getProviderLabel)(config.provider)) +
                        chalk_1.default.dim('  |  Model: ') + chalk_1.default.yellow(getActiveModel(config)) + '\n');
                    logger_1.logger.write(chalk_1.default.dim('Çıkmak için /exit  •  Yardım için /help\n'));
                    (0, process_manager_1.startServices)().then(function (s) {
                        var parts = [];
                        if (s.redis !== 'unavailable')
                            parts.push("Redis ".concat(s.redis === 'started' ? chalk_1.default.green('↑') : chalk_1.default.dim('✓')));
                        if (s.chromadb !== 'unavailable')
                            parts.push("ChromaDB ".concat(s.chromadb === 'started' ? chalk_1.default.green('↑') : chalk_1.default.dim('✓')));
                        if (parts.length)
                            process.stdout.write(chalk_1.default.dim('  ') + parts.join(chalk_1.default.dim('  ')) + '\n\n');
                    }).catch(function () { });
                    (0, session_memory_1.setWorkDir)(process.cwd());
                    manager_1.mcpManager.connectAll(true).catch(function () { });
                    (0, update_1.checkForUpdates)(true).catch(function () { });
                    pasteInput = createPasteInput();
                    readline.emitKeypressEvents(pasteInput.stream);
                    if (process.stdin.isTTY) {
                        process.stdin.setRawMode(true);
                        process.stdout.write('\x1b[?2004h');
                    }
                    process.stdin.pipe(pasteInput.stream);
                    rl = readline.createInterface({
                        input: pasteInput.stream,
                        output: process.stdout,
                        terminal: true,
                        completer: completeCommand,
                    });
                    sessionUsageSnapshot = (0, usage_tracker_1.getUsageSnapshot)();
                    activeAbortController = null;
                    lastSuggestion = '';
                    activeRole = 'chat';
                    specializedHistories = {
                        planner: [],
                        judge: [],
                    };
                    isAIActive = function () { return activeAbortController !== null; };
                    onGlobalKeypress = function (_str, key) {
                        if ((key === null || key === void 0 ? void 0 : key.name) === 'escape' && activeAbortController) {
                            activeAbortController.abort();
                            process.stdout.write(chalk_1.default.red('\n[İptal edildi - ESC]\n'));
                            return;
                        }
                        if (!isAIActive()) {
                            if (((key === null || key === void 0 ? void 0 : key.name) === 'right' || ((key === null || key === void 0 ? void 0 : key.name) === 'e' && (key === null || key === void 0 ? void 0 : key.ctrl))) && lastSuggestion && rl.cursor === rl.line.length) {
                                var ghost = lastSuggestion.slice(rl.line.length);
                                if (ghost) {
                                    rl.write(ghost);
                                    lastSuggestion = '';
                                    return;
                                }
                            }
                            process.nextTick(function () {
                                var suggestion = getInlineSuggestion(rl.line);
                                if (suggestion !== lastSuggestion || true) {
                                    lastSuggestion = suggestion;
                                    process.stdout.write('\x1b[s'); // Save cursor
                                    process.stdout.write('\x1b[K'); // Clear from cursor to end
                                    if (suggestion && suggestion.startsWith(rl.line) && rl.line.length > 0) {
                                        var ghost = suggestion.slice(rl.line.length);
                                        process.stdout.write(chalk_1.default.dim(ghost));
                                    }
                                    process.stdout.write('\x1b[u'); // Restore cursor
                                }
                            });
                        }
                    };
                    pasteInput.stream.on('keypress', onGlobalKeypress);
                    history = __spreadArray([], initialHistory, true);
                    conversationId = initialConversationId !== null && initialConversationId !== void 0 ? initialConversationId : null;
                    if (!(initialHistory.length > 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, session_memory_1.hydrateSession)(initialHistory, { workDir: process.cwd(), preserveSummary: true }).catch(function () { })];
                case 1:
                    _a.sent();
                    logger_1.logger.write(chalk_1.default.dim("  \u21A9 ".concat(initialHistory.length, " mesaj y\u00FCklendi\n")));
                    return [3 /*break*/, 4];
                case 2:
                    conversationId = (0, manager_2.createConversationId)();
                    return [4 /*yield*/, (0, session_memory_1.resetSession)(process.cwd()).catch(function () { })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    prompt = function () { return __awaiter(_this, void 0, void 0, function () {
                        var input, modelInput, trimmed, modelTrimmed, err_1, parts, state, task, abortController_1, runPipeline, contextHistory, summarizedHistory, err_2, parts, filePath, task, abortController_2, code, runJudge, verdict, err_3, filePath, text, filePath, injected, msg, selection, cmd, abortController_3, r, err_4, userMessage, detectedDir, roleConfig, roleHistory, _a, PLANNER_PROMPT, JUDGE_PROMPT, specializedSystemPrompt, abortController_4, staticContext, runAgent_1, agentResult, err_5, abortController, maxCtxTokens_1, contextBudget, minHotMessages, contextHistory, summarizedHistory, toolRoute, agentResult, _i, _b, msg, enrichedMessage, searchSystemAddendum, intent, activeConfig, hasStartedReasoning_1, fullResponse, userMsg, assistantMsg, compressed, err_6;
                        var _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, new Promise(function (resolve) {
                                        var buffer = '';
                                        var roleLabels = {
                                            chat: chalk_1.default.bold.cyan('DEHA ❯ '),
                                            planner: chalk_1.default.bold.magenta('PLANNER ❯ '),
                                            judge: chalk_1.default.bold.yellow('JUDGE ❯ '),
                                        };
                                        rl.setPrompt(roleLabels[activeRole] || roleLabels.chat);
                                        rl.prompt();
                                        lastSuggestion = getInlineSuggestion(rl.line);
                                        var onLine = function (line) {
                                            if (line.endsWith('\\')) {
                                                buffer += (buffer ? '\n' : '') + line.slice(0, -1);
                                                rl.setPrompt('... ');
                                                rl.prompt();
                                                return;
                                            }
                                            buffer += (buffer ? '\n' : '') + line;
                                            rl.removeListener('line', onLine);
                                            resolve(buffer);
                                        };
                                        rl.on('line', onLine);
                                    })];
                                case 1:
                                    input = _d.sent();
                                    modelInput = pasteInput.expand(input);
                                    trimmed = input.trim();
                                    modelTrimmed = modelInput.trim();
                                    if (!trimmed) {
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!(trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit')) return [3 /*break*/, 3];
                                    return [4 /*yield*/, exitCleanup(history, config, conversationId, sessionUsageSnapshot)];
                                case 2:
                                    _d.sent();
                                    rl.close();
                                    process.exit(0);
                                    _d.label = 3;
                                case 3:
                                    if (trimmed === '/help') {
                                        logger_1.logger.write(HELP_TEXT);
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!(trimmed === '/new')) return [3 /*break*/, 5];
                                    if (history.length >= 2)
                                        (0, manager_2.saveConversation)(history, config.provider, getActiveModel(config), { conversationId: conversationId !== null && conversationId !== void 0 ? conversationId : undefined });
                                    history.length = 0;
                                    conversationId = (0, manager_2.createConversationId)();
                                    return [4 /*yield*/, (0, session_memory_1.resetSession)(process.cwd()).catch(function () { })];
                                case 4:
                                    _d.sent();
                                    (0, session_memory_1.setWorkDir)(process.cwd());
                                    logger_1.logger.write(chalk_1.default.green('✓ Yeni sohbet başlatıldı. ID: ') + chalk_1.default.cyan(conversationId) + '\n');
                                    prompt();
                                    return [2 /*return*/];
                                case 5:
                                    if (!(trimmed === '/clear')) return [3 /*break*/, 7];
                                    history.length = 0;
                                    conversationId = (0, manager_2.createConversationId)();
                                    return [4 /*yield*/, (0, session_memory_1.resetSession)(process.cwd()).catch(function () { })];
                                case 6:
                                    _d.sent();
                                    console.clear();
                                    logger_1.logger.write(BANNER);
                                    logger_1.logger.write(chalk_1.default.green('✓ Sohbet geçmişi temizlendi.\n'));
                                    prompt();
                                    return [2 /*return*/];
                                case 7:
                                    if (trimmed === '/stats') {
                                        (0, usage_tracker_1.printStats)();
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (trimmed === '/version' || isVersionQuestion(trimmed)) {
                                        logger_1.logger.write(chalk_1.default.cyan("".concat(version_1.DEHA_VERSION_LABEL, "\n")));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!(trimmed === '/model')) return [3 /*break*/, 12];
                                    rl.pause();
                                    _d.label = 8;
                                case 8:
                                    _d.trys.push([8, 10, , 11]);
                                    return [4 /*yield*/, (0, model_setup_1.modelSetup)(config)];
                                case 9:
                                    _d.sent();
                                    return [3 /*break*/, 11];
                                case 10:
                                    err_1 = _d.sent();
                                    if (err_1.name !== 'ExitPromptError')
                                        logger_1.logger.error(chalk_1.default.red('\n✗ ') + (err_1 instanceof Error ? err_1.message : String(err_1)));
                                    return [3 /*break*/, 11];
                                case 11:
                                    rl.resume();
                                    prompt();
                                    return [2 /*return*/];
                                case 12:
                                    if (trimmed.startsWith('/thinking')) {
                                        parts = trimmed.split(/\s+/).slice(1);
                                        if (parts.length === 0) {
                                            logger_1.logger.write(chalk_1.default.cyan('Thinking: ') + chalk_1.default.yellow(config.deepseekThinking) + '\n');
                                            prompt();
                                            return [2 /*return*/];
                                        }
                                        state = normalizeThinkingState(parts[0]);
                                        if (!state) {
                                            logger_1.logger.write(chalk_1.default.yellow('ℹ /thinking <on|off>\n'));
                                            prompt();
                                            return [2 /*return*/];
                                        }
                                        config.deepseekThinking = state;
                                        if (state === 'enabled' && parts[1])
                                            config.deepseekReasoningEffort = normalizeThinkingEffort(parts[1]);
                                        logger_1.logger.write(chalk_1.default.green('✓ Güncellendi.\n'));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!trimmed.startsWith('/build ')) return [3 /*break*/, 19];
                                    task = modelTrimmed.slice(7).trim();
                                    if (!task) {
                                        logger_1.logger.write(chalk_1.default.yellow('ℹ /build <görev>\n'));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    abortController_1 = new AbortController();
                                    activeAbortController = abortController_1;
                                    _d.label = 13;
                                case 13:
                                    _d.trys.push([13, 16, 17, 18]);
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../pipeline/orchestrator'); })];
                                case 14:
                                    runPipeline = (_d.sent()).runPipeline;
                                    contextHistory = (0, session_memory_1.buildContextMessages)(undefined, { minHotMessages: 5 });
                                    summarizedHistory = (0, agent_1.summarizeOldToolResults)(contextHistory, 10);
                                    return [4 /*yield*/, runPipeline(task, config, summarizedHistory, abortController_1.signal)];
                                case 15:
                                    _d.sent();
                                    return [3 /*break*/, 18];
                                case 16:
                                    err_2 = _d.sent();
                                    if (!abortController_1.signal.aborted)
                                        logger_1.logger.error(chalk_1.default.red('\n✗ Pipeline hatası: ') + (err_2 instanceof Error ? err_2.message : String(err_2)) + '\n');
                                    return [3 /*break*/, 18];
                                case 17:
                                    activeAbortController = null;
                                    return [7 /*endfinally*/];
                                case 18:
                                    prompt();
                                    return [2 /*return*/];
                                case 19:
                                    if (!trimmed.startsWith('/judge ')) return [3 /*break*/, 26];
                                    parts = modelTrimmed.slice(7).trim().split(/\s+/);
                                    filePath = parts[0];
                                    task = parts.slice(1).join(' ').trim();
                                    if (!filePath || !task) {
                                        logger_1.logger.write(chalk_1.default.yellow('ℹ /judge <dosya> <görev>\n'));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!fs.existsSync(filePath)) {
                                        logger_1.logger.write(chalk_1.default.red("\u2717 Dosya yok: ".concat(filePath, "\n")));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    abortController_2 = new AbortController();
                                    activeAbortController = abortController_2;
                                    _d.label = 20;
                                case 20:
                                    _d.trys.push([20, 23, 24, 25]);
                                    code = fs.readFileSync(filePath, 'utf-8');
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../pipeline/judge'); })];
                                case 21:
                                    runJudge = (_d.sent()).runJudge;
                                    return [4 /*yield*/, runJudge(task, 'Manuel', code, config, function (chunk) { return process.stdout.write(chalk_1.default.yellow(chunk)); }, abortController_2.signal)];
                                case 22:
                                    verdict = _d.sent();
                                    logger_1.logger.write('\n' + chalk_1.default.bold('─'.repeat(40)) + (verdict.pass ? chalk_1.default.bgGreen.black(' PASS ') : chalk_1.default.bgRed.white(' FAIL ')) + '\n');
                                    return [3 /*break*/, 25];
                                case 23:
                                    err_3 = _d.sent();
                                    if (!abortController_2.signal.aborted)
                                        logger_1.logger.error(chalk_1.default.red('\n✗ Hata: ') + (err_3 instanceof Error ? err_3.message : String(err_3)) + '\n');
                                    return [3 /*break*/, 25];
                                case 24:
                                    activeAbortController = null;
                                    return [7 /*endfinally*/];
                                case 25:
                                    prompt();
                                    return [2 /*return*/];
                                case 26:
                                    if (trimmed === '/plannerchat') {
                                        activeRole = activeRole === 'planner' ? 'chat' : 'planner';
                                        logger_1.logger.write(chalk_1.default.magenta("\n\u25CF Planner moduna ".concat(activeRole === 'planner' ? 'girildi' : 'çıkıldı', ".\n")));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (trimmed === '/judgechat') {
                                        activeRole = activeRole === 'judge' ? 'chat' : 'judge';
                                        logger_1.logger.write(chalk_1.default.yellow("\n\u25CF Judge moduna ".concat(activeRole === 'judge' ? 'girildi' : 'çıkıldı', ".\n")));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (trimmed.startsWith('/architecture ')) {
                                        filePath = trimmed.slice(14).trim();
                                        if (!fs.existsSync(filePath)) {
                                            logger_1.logger.write(chalk_1.default.red("\u2717 Dosya bulunamad\u0131: ".concat(filePath, "\n")));
                                            prompt();
                                            return [2 /*return*/];
                                        }
                                        (0, session_memory_1.addArchitectureFile)(filePath);
                                        logger_1.logger.write(chalk_1.default.green("\u2713 Mimari dosya (Second Brain) m\u0131hland\u0131.\n"));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (trimmed.startsWith('/pin ')) {
                                        text = modelTrimmed.slice(5).trim();
                                        if (text) {
                                            (0, session_memory_1.addPinnedMessage)(text);
                                            logger_1.logger.write(chalk_1.default.green('✓ Sabitlendi.\n'));
                                        }
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (trimmed === '/unpin') {
                                        (0, session_memory_1.clearPinnedMessages)();
                                        logger_1.logger.write(chalk_1.default.yellow('✓ Pinler temizlendi.\n'));
                                        prompt();
                                        return [2 /*return*/];
                                    }
                                    if (!trimmed.startsWith('/file ')) return [3 /*break*/, 29];
                                    filePath = trimmed.slice(6).trim();
                                    injected = injectFile(filePath);
                                    if (!injected) return [3 /*break*/, 28];
                                    msg = { role: 'user', content: injected };
                                    history.push(msg);
                                    history.push({ role: 'assistant', content: "Okudum: ".concat(filePath) });
                                    return [4 /*yield*/, (0, session_memory_1.appendMessage)(msg)];
                                case 27:
                                    _d.sent();
                                    _d.label = 28;
                                case 28:
                                    prompt();
                                    return [2 /*return*/];
                                case 29:
                                    if (!trimmed.startsWith('/mcp')) return [3 /*break*/, 31];
                                    return [4 /*yield*/, (0, commands_1.handleMcpCommand)(trimmed.slice(4).trim())];
                                case 30:
                                    _d.sent();
                                    prompt();
                                    return [2 /*return*/];
                                case 31:
                                    if (!(trimmed.startsWith('/oldconversations') || trimmed.startsWith('/history'))) return [3 /*break*/, 35];
                                    return [4 /*yield*/, (0, commands_2.handleHistoryCommand)(trimmed.replace(/^\/oldconversations\s*|^\/history\s*/, ''))];
                                case 32:
                                    selection = _d.sent();
                                    if (!selection) return [3 /*break*/, 34];
                                    history.length = 0;
                                    history.push.apply(history, selection.messages);
                                    conversationId = selection.id;
                                    return [4 /*yield*/, (0, session_memory_1.hydrateSession)(selection.messages, { workDir: process.cwd() }).catch(function () { })];
                                case 33:
                                    _d.sent();
                                    _d.label = 34;
                                case 34:
                                    prompt();
                                    return [2 /*return*/];
                                case 35:
                                    if (!trimmed.startsWith('/run ')) return [3 /*break*/, 41];
                                    cmd = modelTrimmed.slice(5).trim();
                                    abortController_3 = new AbortController();
                                    activeAbortController = abortController_3;
                                    _d.label = 36;
                                case 36:
                                    _d.trys.push([36, 38, 39, 40]);
                                    return [4 /*yield*/, (0, terminal_1.runCommand)(cmd, { stream: true, shell: true, timeout: 60000 })];
                                case 37:
                                    r = _d.sent();
                                    return [3 /*break*/, 40];
                                case 38:
                                    err_4 = _d.sent();
                                    if (!abortController_3.signal.aborted)
                                        logger_1.logger.error(chalk_1.default.red('\n✗ ') + err_4.message + '\n');
                                    return [3 /*break*/, 40];
                                case 39:
                                    activeAbortController = null;
                                    return [7 /*endfinally*/];
                                case 40:
                                    prompt();
                                    return [2 /*return*/];
                                case 41:
                                    userMessage = resolveAtFiles(modelTrimmed);
                                    detectedDir = (0, session_memory_1.detectWorkDir)(userMessage);
                                    if (detectedDir) {
                                        (0, session_memory_1.setWorkDir)(detectedDir);
                                        logger_1.logger.write(chalk_1.default.dim("  \uD83D\uDCC1 Dir: ".concat(detectedDir, "\n")));
                                    }
                                    if (!(activeRole !== 'chat')) return [3 /*break*/, 49];
                                    roleConfig = activeRole === 'planner' ? config.pipeline.planner : config.pipeline.judge;
                                    roleHistory = specializedHistories[activeRole];
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../prompts.config'); })];
                                case 42:
                                    _a = _d.sent(), PLANNER_PROMPT = _a.PLANNER_PROMPT, JUDGE_PROMPT = _a.JUDGE_PROMPT;
                                    specializedSystemPrompt = activeRole === 'planner' ? PLANNER_PROMPT : JUDGE_PROMPT;
                                    abortController_4 = new AbortController();
                                    activeAbortController = abortController_4;
                                    _d.label = 43;
                                case 43:
                                    _d.trys.push([43, 46, 47, 48]);
                                    process.stdout.write('\n' + chalk_1.default.bold[activeRole === 'planner' ? 'magenta' : 'yellow']("".concat(activeRole.toUpperCase(), ": ")));
                                    staticContext = (0, session_memory_1.buildStaticContextMessages)();
                                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./agent'); })];
                                case 44:
                                    runAgent_1 = (_d.sent()).runAgent;
                                    return [4 /*yield*/, runAgent_1(userMessage, __assign(__assign({}, config), roleConfig), __spreadArray(__spreadArray([], staticContext, true), (0, agent_1.summarizeOldToolResults)(roleHistory, 10), true), abortController_4.signal, specializedSystemPrompt)];
                                case 45:
                                    agentResult = _d.sent();
                                    roleHistory.push.apply(roleHistory, agentResult.messages);
                                    logger_1.logger.write(chalk_1.default.dim('─'.repeat(50)) + '\n');
                                    return [3 /*break*/, 48];
                                case 46:
                                    err_5 = _d.sent();
                                    if (!abortController_4.signal.aborted)
                                        logger_1.logger.error(chalk_1.default.red('\n✗ Hata: ') + err_5.message + '\n');
                                    return [3 /*break*/, 48];
                                case 47:
                                    activeAbortController = null;
                                    return [7 /*endfinally*/];
                                case 48:
                                    prompt();
                                    return [2 /*return*/];
                                case 49:
                                    abortController = new AbortController();
                                    activeAbortController = abortController;
                                    _d.label = 50;
                                case 50:
                                    _d.trys.push([50, 67, 68, 69]);
                                    maxCtxTokens_1 = config.maxContextTokens > 0 ? config.maxContextTokens : (0, token_counter_1.getMaxContextTokens)(config.provider, getActiveModel(config));
                                    contextBudget = getContextBudgetTokens(config, maxCtxTokens_1);
                                    minHotMessages = Math.max(config.minHotMessages, 5);
                                    return [4 /*yield*/, (0, session_memory_1.autoCompress)(function (msgs) { return summarizeForCompression(msgs, config, maxCtxTokens_1); }, maxCtxTokens_1, 0.6, minHotMessages)];
                                case 51:
                                    _d.sent();
                                    contextHistory = (0, session_memory_1.buildContextMessages)(undefined, { maxTokens: contextBudget, minHotMessages: minHotMessages });
                                    summarizedHistory = (0, agent_1.summarizeOldToolResults)(contextHistory, 10);
                                    return [4 /*yield*/, (0, tool_router_1.decideToolRoute)(userMessage, config)];
                                case 52:
                                    toolRoute = _d.sent();
                                    if (!toolRoute.useTools) return [3 /*break*/, 58];
                                    logger_1.logger.write(chalk_1.default.dim("\n  \uD83D\uDEE0 Tool modu: ".concat((_c = toolRoute.reason) !== null && _c !== void 0 ? _c : 'LLM kararı', "\n")));
                                    return [4 /*yield*/, (0, agent_1.runAgent)(userMessage, config, summarizedHistory, abortController.signal)];
                                case 53:
                                    agentResult = _d.sent();
                                    history.push.apply(history, agentResult.messages);
                                    _i = 0, _b = agentResult.messages;
                                    _d.label = 54;
                                case 54:
                                    if (!(_i < _b.length)) return [3 /*break*/, 57];
                                    msg = _b[_i];
                                    return [4 /*yield*/, (0, session_memory_1.appendMessage)(msg)];
                                case 55:
                                    _d.sent();
                                    (0, memory_1.addMessage)(msg).catch(function () { });
                                    _d.label = 56;
                                case 56:
                                    _i++;
                                    return [3 /*break*/, 54];
                                case 57: return [3 /*break*/, 65];
                                case 58:
                                    enrichedMessage = userMessage;
                                    searchSystemAddendum = '';
                                    return [4 /*yield*/, (0, intent_1.detectIntent)(userMessage, config)];
                                case 59:
                                    intent = _d.sent();
                                    if (!(intent.search && intent.keywords)) return [3 /*break*/, 61];
                                    process.stdout.write(chalk_1.default.dim("\n  \uD83C\uDF0D Searching: \"".concat(intent.keywords, "\"... ")));
                                    return [4 /*yield*/, (0, intent_1.enrichWithSearch)(userMessage, intent.keywords)];
                                case 60:
                                    enrichedMessage = _d.sent();
                                    searchSystemAddendum = '\n=== WEB ARAMA SONUÇLARI ===\nBu verileri kullanarak cevap ver.';
                                    logger_1.logger.write(chalk_1.default.green('✓'));
                                    _d.label = 61;
                                case 61:
                                    activeConfig = searchSystemAddendum ? __assign(__assign({}, config), { systemPrompt: (config.systemPrompt || '') + '\n' + searchSystemAddendum }) : config;
                                    process.stdout.write('\n' + chalk_1.default.bold.cyan('DEHA:'));
                                    hasStartedReasoning_1 = false;
                                    return [4 /*yield*/, (0, ai_service_1.streamMessage)(__spreadArray(__spreadArray([], summarizedHistory, true), [{ role: 'user', content: enrichedMessage }], false), activeConfig, function (chunk) {
                                            if (hasStartedReasoning_1) {
                                                process.stdout.write('\n' + chalk_1.default.cyan('DEHA: '));
                                                hasStartedReasoning_1 = false;
                                            }
                                            process.stdout.write(chunk);
                                        }, function (reasoning) {
                                            if (!hasStartedReasoning_1) {
                                                process.stdout.write('\n' + chalk_1.default.dim.italic('💭 Düşünüyor: '));
                                                hasStartedReasoning_1 = true;
                                            }
                                            process.stdout.write(chalk_1.default.dim.italic(reasoning));
                                        })];
                                case 62:
                                    fullResponse = _d.sent();
                                    process.stdout.write('\n');
                                    userMsg = { role: 'user', content: userMessage };
                                    assistantMsg = { role: 'assistant', content: fullResponse };
                                    history.push(userMsg, assistantMsg);
                                    return [4 /*yield*/, (0, session_memory_1.appendMessage)(userMsg)];
                                case 63:
                                    _d.sent();
                                    return [4 /*yield*/, (0, session_memory_1.appendMessage)(assistantMsg)];
                                case 64:
                                    _d.sent();
                                    (0, memory_1.addMessage)(userMsg).catch(function () { });
                                    (0, memory_1.addMessage)(assistantMsg).catch(function () { });
                                    _d.label = 65;
                                case 65:
                                    (0, manager_2.saveConversation)(history, config.provider, getActiveModel(config), { conversationId: conversationId !== null && conversationId !== void 0 ? conversationId : undefined });
                                    return [4 /*yield*/, (0, session_memory_1.autoCompress)(function (msgs) { return summarizeForCompression(msgs, config, maxCtxTokens_1); }, maxCtxTokens_1, config.compressThreshold, minHotMessages)];
                                case 66:
                                    compressed = _d.sent();
                                    if (compressed)
                                        logger_1.logger.write(chalk_1.default.dim('  📦 Context compressed\n'));
                                    logger_1.logger.write(chalk_1.default.dim('─'.repeat(50)) + '\n');
                                    return [3 /*break*/, 69];
                                case 67:
                                    err_6 = _d.sent();
                                    if (!abortController.signal.aborted)
                                        logger_1.logger.error(chalk_1.default.red('\n✗ Hata: ') + err_6.message + '\n');
                                    return [3 /*break*/, 69];
                                case 68:
                                    activeAbortController = null;
                                    return [7 /*endfinally*/];
                                case 69:
                                    prompt();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    rl.on('SIGINT', function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!activeAbortController) return [3 /*break*/, 1];
                                activeAbortController.abort();
                                return [3 /*break*/, 3];
                            case 1: return [4 /*yield*/, exitCleanup(history, config, conversationId, sessionUsageSnapshot)];
                            case 2:
                                _a.sent();
                                process.exit(0);
                                _a.label = 3;
                            case 3: return [2 /*return*/];
                        }
                    }); }); });
                    process.once('SIGTERM', function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, (0, session_memory_1.flushOnExit)().catch(function () { })];
                            case 1:
                                _a.sent();
                                return [4 /*yield*/, (0, memory_1.closeMemory)().catch(function () { })];
                            case 2:
                                _a.sent();
                                process.exit(0);
                                return [2 /*return*/];
                        }
                    }); }); });
                    rl.on('close', function () { pasteInput.stream.removeListener('keypress', onGlobalKeypress); process.stdin.unpipe(pasteInput.stream); pasteInput.cleanup(); if (process.stdin.isTTY) {
                        process.stdout.write('\x1b[?2004l');
                        process.stdin.setRawMode(false);
                    } });
                    prompt();
                    return [2 /*return*/];
            }
        });
    });
}
function exitCleanup(history_1, config_2, conversationId_1) {
    return __awaiter(this, arguments, void 0, function (history, config, conversationId, sessionUsageSnapshot) {
        var sessionId, filePath, listConversations, latest, _a;
        if (sessionUsageSnapshot === void 0) { sessionUsageSnapshot = 0; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, session_memory_1.flushOnExit)().catch(function () { })];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, memory_1.closeMemory)().catch(function () { })];
                case 2:
                    _b.sent();
                    (0, process_manager_1.stopServices)();
                    sessionId = null;
                    if (!(history.length >= 1)) return [3 /*break*/, 3];
                    filePath = (0, manager_2.saveConversation)(history, config.provider, getActiveModel(config), { conversationId: conversationId !== null && conversationId !== void 0 ? conversationId : undefined });
                    if (filePath)
                        sessionId = path.basename(filePath, '.md');
                    return [3 /*break*/, 6];
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../conversations/manager'); })];
                case 4:
                    listConversations = (_b.sent()).listConversations;
                    latest = listConversations(1);
                    if (latest && latest.length > 0)
                        sessionId = latest[0].id;
                    return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    return [3 /*break*/, 6];
                case 6: return [4 /*yield*/, manager_1.mcpManager.disconnectAll().catch(function () { })];
                case 7:
                    _b.sent();
                    (0, usage_tracker_1.printSessionSummary)((0, usage_tracker_1.getUsageSince)(sessionUsageSnapshot));
                    logger_1.logger.write(chalk_1.default.dim('Görüşürüz! 👋\n'));
                    if (sessionId)
                        logger_1.logger.write(chalk_1.default.dim('Önceki sohbete dönmek için: ') + chalk_1.default.cyan("deha resume ".concat(sessionId, "\n")));
                    return [2 /*return*/];
            }
        });
    });
}
function getContextBudgetTokens(config, maxContextTokens) {
    var outputReserve = 8192;
    var safetyReserve = 8192;
    var hardCap = safePositiveInt(process.env.DEHA_CONTEXT_BUDGET_TOKENS, 80000);
    return Math.max(8000, Math.min(hardCap, maxContextTokens - outputReserve - safetyReserve));
}
function summarizeForCompression(msgs, config, maxCtxTokens) {
    return __awaiter(this, void 0, void 0, function () {
        var stats, lastFive, summaryPrompt;
        return __generator(this, function (_a) {
            stats = (0, session_memory_1.getContextStats)(maxCtxTokens);
            lastFive = msgs.slice(-5);
            summaryPrompt = __spreadArray(__spreadArray(__spreadArray(['Mühendislik Özeti.', "- WorkDir: ".concat(stats.workDir)], msgs.slice(0, -5).map(function (m) { return "".concat(m.role, ": ").concat((m.content || '').slice(0, 500)); }), true), ['--- SON 5 ---'], false), lastFive.map(function (m) { return "".concat(m.role, ": ").concat((m.content || '').slice(0, 1000)); }), true).join('\n');
            return [2 /*return*/, (0, ai_service_1.sendMessage)([{ role: 'user', content: summaryPrompt }], config)];
        });
    });
}
function safePositiveInt(value, fallback) { var parsed = Number.parseInt(value !== null && value !== void 0 ? value : '', 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function containsPastedPlaceholder(input) { PASTE_PLACEHOLDER_PATTERN.lastIndex = 0; return PASTE_PLACEHOLDER_PATTERN.test(input); }
function createPasteInput() {
    var pasted = new Map();
    var nextId = 1;
    var buffer = '';
    var collectingPaste = false;
    var stream = new stream_1.Transform({
        transform: function (chunk, _encoding, callback) {
            buffer += chunk.toString('utf8');
            var output = '';
            while (buffer.length > 0) {
                if (!collectingPaste) {
                    var start = buffer.indexOf(PASTE_START);
                    if (start < 0) {
                        var keep = pasteStartSuffixLength(buffer);
                        if (buffer.length <= keep)
                            break;
                        output += buffer.slice(0, buffer.length - keep);
                        buffer = buffer.slice(buffer.length - keep);
                        break;
                    }
                    output += buffer.slice(0, start);
                    buffer = buffer.slice(start + PASTE_START.length);
                    collectingPaste = true;
                }
                var end = buffer.indexOf(PASTE_END);
                if (end < 0)
                    break;
                var content = buffer.slice(0, end);
                var id = String(nextId++);
                pasted.set(id, content);
                output += "[Pasted Content ".concat(content.length, " chars #").concat(id, "]");
                buffer = buffer.slice(end + PASTE_END.length);
                collectingPaste = false;
            }
            if (output)
                this.push(output);
            callback();
        },
        flush: function (callback) { if (buffer) {
            this.push(buffer);
            buffer = '';
        } callback(); },
    });
    return { stream: stream, expand: function (line) { return line.replace(PASTE_PLACEHOLDER_PATTERN, function (_match, _chars, id) { var _a; return (_a = pasted.get(id)) !== null && _a !== void 0 ? _a : _match; }); }, cleanup: function () { return pasted.clear(); }, };
}
function pasteStartSuffixLength(value) { var max = Math.min(value.length, PASTE_START.length - 1); for (var len = max; len > 0; len--) {
    if (PASTE_START.startsWith(value.slice(-len)))
        return len;
} return 0; }
function getActiveModel(config) {
    switch (config.provider) {
        case 'claude': return config.claudeModel;
        case 'openai': return config.openaiModel;
        case 'deepseek': return config.deepseekModel;
        case 'ollama': return config.ollamaModel;
        case 'openrouter': return config.openrouterModel;
        case 'xai': return config.xaiModel;
        default: return config.provider;
    }
}
function injectFile(filePath) {
    try {
        var resolved = path.resolve(filePath);
        var content = fs.readFileSync(resolved, 'utf-8');
        var ext = path.extname(filePath).slice(1) || 'text';
        return "FILE CONTENT: ".concat(filePath, "\n```").concat(ext, "\n").concat(content, "\n```");
    }
    catch (_a) {
        logger_1.logger.error(chalk_1.default.red("\u2717 Dosya okunamad\u0131: ".concat(filePath, "\n")));
        return null;
    }
}
function resolveAtFiles(message) {
    return message.replace(/@([\S]+)/g, function (_match, filePath) {
        try {
            var resolved = path.resolve(filePath);
            var content = fs.readFileSync(resolved, 'utf-8');
            var ext = path.extname(filePath).slice(1) || 'text';
            return "\n```".concat(ext, "\n// ").concat(resolved, "\n").concat(content, "\n```\n");
        }
        catch (_a) {
            return _match;
        }
    });
}
function isVersionQuestion(message) { return message.toLowerCase().includes('versiyon') || message.toLowerCase().includes('version'); }
function normalizeThinkingState(value) { var v = value.toLowerCase(); if (['on', 'enable', 'enabled'].includes(v))
    return 'enabled'; if (['off', 'disable', 'disabled'].includes(v))
    return 'disabled'; return null; }
function normalizeThinkingEffort(value) { return value.toLowerCase() === 'max' ? 'max' : 'high'; }
function completeCommand(line) {
    if (!line.startsWith('/'))
        return [[], line];
    var hits = COMMAND_SUGGESTIONS.filter(function (cmd) { return cmd.startsWith(line); });
    return [hits.length ? hits : COMMAND_SUGGESTIONS, line];
}
function getInlineSuggestion(line) {
    var _a;
    if (!line.startsWith('/') || COMMAND_SUGGESTIONS.includes(line))
        return '';
    return (_a = COMMAND_SUGGESTIONS.find(function (cmd) { return cmd.startsWith(line); })) !== null && _a !== void 0 ? _a : '';
}
