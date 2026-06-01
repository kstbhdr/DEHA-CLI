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
exports.injectWorkDir = injectWorkDir;
exports.runAgent = runAgent;
exports.summarizeOldToolResults = summarizeOldToolResults;
var chalk_1 = require("chalk");
var ai_service_1 = require("../services/ai-service");
var tools_1 = require("../tools");
var manager_1 = require("../mcp/manager");
var session_memory_1 = require("../services/session-memory");
var logger_1 = require("../services/logger");
/** WorkDir bilgisini config'e system prompt olarak enjekte et */
function injectWorkDir(config, customSystemPrompt) {
    var workDir = (0, session_memory_1.getWorkDir)();
    var basePrompt = customSystemPrompt !== null && customSystemPrompt !== void 0 ? customSystemPrompt : config.systemPrompt;
    var workDirNote = workDir
        ? "\n\n[PROJECT CONTEXT]\n- ACTIVE WORKING DIRECTORY: ".concat(workDir, "\n- CRITICAL RULE: You are currently working in this project. All file operations (read, write, list, search) and shell commands MUST be performed within this directory by default.\n- If the user explicitly asks for another absolute path or says \"root dizini\", \"/root\", \"VPS root\", or similar, use that requested path exactly. In that case, \"/root\" means the server root user's home directory, NOT the project root.\n- Do NOT look at C:\\Users\\BAHADIR or other parent directories unless the user explicitly asks for a different project/path.\n- FOCUS: Stay within the project context unless the user explicitly names another path. If you need to list files without a specific path, list ").concat(workDir, " first.")
        : '';
    return __assign(__assign({}, config), { systemPrompt: basePrompt + workDirNote });
}
function runAgent(userMessage_1, config_1) {
    return __awaiter(this, arguments, void 0, function (userMessage, config, history, abortSignal, customSystemPrompt) {
        var mcpTools, allTools, enrichedConfig;
        if (history === void 0) { history = []; }
        return __generator(this, function (_a) {
            mcpTools = manager_1.mcpManager.getAnthropicTools();
            allTools = __spreadArray(__spreadArray([], tools_1.DEHA_TOOLS, true), mcpTools, true);
            if (mcpTools.length > 0) {
                logger_1.logger.write(chalk_1.default.dim("  [".concat(mcpTools.length, " MCP arac\u0131 aktif]\n")));
            }
            enrichedConfig = injectWorkDir(config, customSystemPrompt);
            // Claude → native tool calling
            if (config.provider === 'claude') {
                return [2 /*return*/, runAgentClaude(userMessage, enrichedConfig, history, allTools, abortSignal)];
            }
            // OpenAI-uyumlu providerlar (DeepSeek, OpenAI, OpenRouter, xAI, custom)
            return [2 /*return*/, runAgentOpenAI(userMessage, enrichedConfig, history, allTools, abortSignal)];
        });
    });
}
var MAX_TOOL_ROUNDS = 200;
var MAX_AUTO_CONTINUE_ROUNDS = 6;
var MAX_POST_TOOL_COMPLETION_ROUNDS = 8;
var MAX_TOOL_RESULT_CHARS = 32000;
// ─── Claude agent döngüsü ────────────────────────────────────────────────────
function runAgentClaude(userMessage, config, history, allTools, abortSignal) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, startIdx, maxRounds, aggressiveAutoContinue, round, finalText, autoContinueRounds, forceToolUse, hadToolActivity, postToolCompletionRounds, _loop_1, state_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    messages = __spreadArray(__spreadArray([], history, true), [{ role: 'user', content: userMessage }], false);
                    startIdx = history.length;
                    maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
                    aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
                    round = 0;
                    finalText = '';
                    autoContinueRounds = 0;
                    forceToolUse = false;
                    hadToolActivity = false;
                    postToolCompletionRounds = 0;
                    _loop_1 = function () {
                        var roundText, _b, text, toolCalls, effectiveToolCalls, shouldContinue, _c, toolResultBlocks, _i, effectiveToolCalls_1, tc, result, compactedResult, preview;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    round++;
                                    roundText = '';
                                    return [4 /*yield*/, (0, ai_service_1.sendWithTools)(messages, config, allTools, function (chunk) {
                                            roundText += chunk;
                                        }, abortSignal, forceToolUse ? 'required' : 'auto')];
                                case 1:
                                    _b = _d.sent(), text = _b.text, toolCalls = _b.toolCalls;
                                    effectiveToolCalls = toolCalls.length > 0
                                        ? toolCalls
                                        : parseInlineXmlToolCalls(text, allTools);
                                    if (!(effectiveToolCalls.length === 0)) return [3 /*break*/, 6];
                                    finalText = text;
                                    if (!hadToolActivity) return [3 /*break*/, 3];
                                    return [4 /*yield*/, shouldContinueAfterToolPhase(userMessage, text, config, round, maxRounds, postToolCompletionRounds)];
                                case 2:
                                    _c = _d.sent();
                                    return [3 /*break*/, 5];
                                case 3: return [4 /*yield*/, shouldContinueAfterNoToolResponse(userMessage, text, config, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)];
                                case 4:
                                    _c = _d.sent();
                                    _d.label = 5;
                                case 5:
                                    shouldContinue = _c;
                                    if (shouldContinue) {
                                        autoContinueRounds++;
                                        forceToolUse = true;
                                        messages.push({ role: 'assistant', content: text });
                                        messages.push({
                                            role: 'user',
                                            content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
                                        });
                                        if (hadToolActivity) {
                                            postToolCompletionRounds++;
                                        }
                                        return [2 /*return*/, "continue"];
                                    }
                                    if (text && !isSilentInterimOutput(text)) {
                                        logger_1.logger.write('\n' + chalk_1.default.bold.cyan('DEHA:'));
                                        logger_1.logger.raw(roundText);
                                        logger_1.logger.raw('\n');
                                    }
                                    return [2 /*return*/, "break"];
                                case 6:
                                    toolResultBlocks = [];
                                    hadToolActivity = true;
                                    postToolCompletionRounds = 0;
                                    autoContinueRounds = 0;
                                    forceToolUse = false;
                                    if (text && !isSilentInterimOutput(text)) {
                                        logger_1.logger.write('\n' + chalk_1.default.bold.cyan('DEHA:'));
                                        logger_1.logger.raw(roundText);
                                        logger_1.logger.raw('\n');
                                    }
                                    _i = 0, effectiveToolCalls_1 = effectiveToolCalls;
                                    _d.label = 7;
                                case 7:
                                    if (!(_i < effectiveToolCalls_1.length)) return [3 /*break*/, 10];
                                    tc = effectiveToolCalls_1[_i];
                                    (0, tools_1.printToolCall)(tc.name, tc.input);
                                    return [4 /*yield*/, runTool(tc.name, tc.input, config)];
                                case 8:
                                    result = _d.sent();
                                    compactedResult = compactToolResultForModel(tc.name, result);
                                    preview = compactedResult.length > 200 ? compactedResult.slice(0, 200) + '…' : compactedResult;
                                    logger_1.logger.write(chalk_1.default.dim('    → ') + chalk_1.default.gray(preview));
                                    toolResultBlocks.push("<tool_result name=\"".concat(tc.name, "\" id=\"").concat(tc.id, "\">\n").concat(compactedResult, "\n</tool_result>"));
                                    finalText = text;
                                    _d.label = 9;
                                case 9:
                                    _i++;
                                    return [3 /*break*/, 7];
                                case 10:
                                    messages.push({ role: 'assistant', content: text || '[tool calls]' });
                                    messages.push({
                                        role: 'user',
                                        content: toolResultBlocks.join('\n\n') + '\n\nBu sonuçları kullanarak devam et.',
                                    });
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _a.label = 1;
                case 1:
                    if (!(round < maxRounds)) return [3 /*break*/, 3];
                    return [5 /*yield**/, _loop_1()];
                case 2:
                    state_1 = _a.sent();
                    if (state_1 === "break")
                        return [3 /*break*/, 3];
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, { response: finalText, messages: messages.slice(startIdx) }];
            }
        });
    });
}
// ─── OpenAI-uyumlu agent döngüsü ────────────────────────────────────────────
function runAgentOpenAI(userMessage, config, history, allTools, abortSignal) {
    return __awaiter(this, void 0, void 0, function () {
        var startIdx, messages, maxRounds, aggressiveAutoContinue, round, finalText, autoContinueRounds, forceToolUse, hadToolActivity, postToolCompletionRounds, _loop_2, state_2, resultHistory;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startIdx = history.length;
                    messages = __spreadArray(__spreadArray([
                        { role: 'system', content: config.systemPrompt }
                    ], history.map(function (m) {
                        var msg = { role: m.role, content: m.content };
                        if (m.tool_calls)
                            msg.tool_calls = m.tool_calls;
                        if (m.tool_call_id)
                            msg.tool_call_id = m.tool_call_id;
                        if (m.reasoning_content)
                            msg.reasoning_content = m.reasoning_content;
                        return msg;
                    }), true), [
                        { role: 'user', content: userMessage },
                    ], false);
                    maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
                    aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
                    round = 0;
                    finalText = '';
                    autoContinueRounds = 0;
                    forceToolUse = false;
                    hadToolActivity = false;
                    postToolCompletionRounds = 0;
                    _loop_2 = function () {
                        var roundText, _b, text, toolCalls, rawAssistantMsg, malformedToolCalls, inlineToolCalls, effectiveToolCalls, effectiveAssistantMsg, shouldContinue, _c, _i, effectiveToolCalls_2, tc, result, compactedResult, preview;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    round++;
                                    roundText = '';
                                    return [4 /*yield*/, (0, ai_service_1.sendWithToolsOpenAICompat)(messages, config, allTools, function (chunk) {
                                            roundText += chunk;
                                        }, abortSignal, forceToolUse ? 'required' : 'auto')];
                                case 1:
                                    _b = _d.sent(), text = _b.text, toolCalls = _b.toolCalls, rawAssistantMsg = _b.rawAssistantMsg, malformedToolCalls = _b.malformedToolCalls;
                                    inlineToolCalls = toolCalls.length > 0 ? [] : parseInlineXmlToolCalls(text, allTools);
                                    effectiveToolCalls = toolCalls.length > 0 ? toolCalls : inlineToolCalls;
                                    effectiveAssistantMsg = inlineToolCalls.length > 0
                                        ? withSyntheticOpenAIToolCalls(rawAssistantMsg, inlineToolCalls)
                                        : rawAssistantMsg;
                                    if (malformedToolCalls > 0 && effectiveToolCalls.length === 0) {
                                        forceToolUse = true;
                                        messages.push({
                                            role: 'user',
                                            content: MALFORMED_TOOL_CALL_PROMPT,
                                        });
                                        return [2 /*return*/, "continue"];
                                    }
                                    if (!(effectiveToolCalls.length === 0)) return [3 /*break*/, 6];
                                    finalText = text;
                                    if (!hadToolActivity) return [3 /*break*/, 3];
                                    return [4 /*yield*/, shouldContinueAfterToolPhase(userMessage, text, config, round, maxRounds, postToolCompletionRounds)];
                                case 2:
                                    _c = _d.sent();
                                    return [3 /*break*/, 5];
                                case 3: return [4 /*yield*/, shouldContinueAfterNoToolResponse(userMessage, text, config, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)];
                                case 4:
                                    _c = _d.sent();
                                    _d.label = 5;
                                case 5:
                                    shouldContinue = _c;
                                    if (shouldContinue) {
                                        autoContinueRounds++;
                                        forceToolUse = true;
                                        messages.push(effectiveAssistantMsg);
                                        messages.push({
                                            role: 'user',
                                            content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
                                        });
                                        if (hadToolActivity) {
                                            postToolCompletionRounds++;
                                        }
                                        return [2 /*return*/, "continue"];
                                    }
                                    if (text && !isSilentInterimOutput(text)) {
                                        logger_1.logger.write('\n' + chalk_1.default.bold.cyan('DEHA:'));
                                        logger_1.logger.raw(roundText);
                                        logger_1.logger.raw('\n');
                                    }
                                    return [2 /*return*/, "break"];
                                case 6:
                                    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
                                    messages.push(effectiveAssistantMsg);
                                    hadToolActivity = true;
                                    postToolCompletionRounds = 0;
                                    autoContinueRounds = 0;
                                    forceToolUse = false;
                                    if (text && !isSilentInterimOutput(text)) {
                                        logger_1.logger.write('\n' + chalk_1.default.bold.cyan('DEHA:'));
                                        logger_1.logger.raw(roundText);
                                        logger_1.logger.raw('\n');
                                    }
                                    _i = 0, effectiveToolCalls_2 = effectiveToolCalls;
                                    _d.label = 7;
                                case 7:
                                    if (!(_i < effectiveToolCalls_2.length)) return [3 /*break*/, 10];
                                    tc = effectiveToolCalls_2[_i];
                                    (0, tools_1.printToolCall)(tc.name, tc.input);
                                    return [4 /*yield*/, runTool(tc.name, tc.input, config)];
                                case 8:
                                    result = _d.sent();
                                    compactedResult = compactToolResultForModel(tc.name, result);
                                    preview = compactedResult.length > 200 ? compactedResult.slice(0, 200) + '…' : compactedResult;
                                    logger_1.logger.write(chalk_1.default.dim('    → ') + chalk_1.default.gray(preview));
                                    // OpenAI tool result format
                                    messages.push({
                                        role: 'tool',
                                        tool_call_id: tc.id,
                                        content: compactedResult,
                                    });
                                    finalText = text;
                                    _d.label = 9;
                                case 9:
                                    _i++;
                                    return [3 /*break*/, 7];
                                case 10: return [2 /*return*/];
                            }
                        });
                    };
                    _a.label = 1;
                case 1:
                    if (!(round < maxRounds)) return [3 /*break*/, 3];
                    return [5 /*yield**/, _loop_2()];
                case 2:
                    state_2 = _a.sent();
                    if (state_2 === "break")
                        return [3 /*break*/, 3];
                    return [3 /*break*/, 1];
                case 3:
                    resultHistory = messages
                        .filter(function (m) { return m.role !== 'system'; })
                        .slice(startIdx) // Take only the new messages from this turn
                        .map(function (m) { return ({
                        role: m.role,
                        content: typeof m.content === 'string' ? m.content : (m.content === null ? '' : String(m.content)),
                        tool_calls: m.tool_calls,
                        tool_call_id: m.tool_call_id,
                        reasoning_content: m.reasoning_content
                    }); });
                    return [2 /*return*/, { response: finalText, messages: resultHistory }];
            }
        });
    });
}
function compactToolResultForModel(toolName, result) {
    var maxChars = readPositiveInt(process.env.DEHA_MAX_TOOL_RESULT_CHARS, MAX_TOOL_RESULT_CHARS);
    if (!result || result.length <= maxChars)
        return result;
    var headChars = Math.floor(maxChars * 0.7);
    var tailChars = Math.max(0, maxChars - headChars - 260);
    var omitted = result.length - headChars - tailChars;
    return [
        result.slice(0, headChars),
        '',
        "[DEHA TOOL OUTPUT TRUNCATED: ".concat(toolName, " sonucu ").concat(result.length, " karakterdi; ").concat(omitted, " karakter modele g\u00F6nderilmedi. Daha spesifik path/pattern ile tekrar \u00E7a\u011F\u0131r.]"),
        '',
        tailChars > 0 ? result.slice(-tailChars) : '',
    ].join('\n');
}
/**
 * Geçmişteki devasa tool çıktılarını özetler.
 * Mesaj geçmişinde 5 turdan eski olan tool sonuçlarını
 * "[TOOL: name -> OKUNDU/ÇALIŞTIRILDI]" formatına indirger.
 */
function summarizeOldToolResults(history, keepCount) {
    if (keepCount === void 0) { keepCount = 10; }
    if (history.length <= keepCount)
        return history;
    var result = [];
    var keepThreshold = history.length - keepCount;
    for (var i = 0; i < history.length; i++) {
        var msg = history[i];
        if (i < keepThreshold && msg.role === 'tool') {
            var content = (msg.content || '').trim();
            var summary = content.length > 100
                ? "[TOOL SONUCU \u00D6ZET\u0130: Veri ba\u015Far\u0131yla al\u0131nd\u0131 (".concat(content.length, " karakter).]")
                : content;
            result.push(__assign(__assign({}, msg), { content: summary }));
        }
        else {
            result.push(msg);
        }
    }
    return result;
}
function parseInlineXmlToolCalls(text, tools) {
    if (!text || !text.includes('<'))
        return [];
    var toolNames = new Set(tools.map(function (tool) { return tool.name; }));
    var calls = [];
    for (var _i = 0, toolNames_1 = toolNames; _i < toolNames_1.length; _i++) {
        var name_1 = toolNames_1[_i];
        var pattern = new RegExp("<".concat(escapeRegExp(name_1), "\\b[^>]*>([\\s\\S]*?)<\\/").concat(escapeRegExp(name_1), ">"), 'gi');
        var match = void 0;
        while ((match = pattern.exec(text)) !== null) {
            var input = parseInlineXmlToolInput(name_1, match[1]);
            if (input) {
                calls.push({
                    name: name_1,
                    input: input,
                    id: "inline_".concat(name_1, "_").concat(calls.length, "_").concat(Date.now()),
                });
            }
        }
    }
    return calls.slice(0, 8);
}
function parseInlineXmlToolInput(toolName, body) {
    var trimmed = body.trim();
    if (!trimmed)
        return null;
    var jsonCandidate = extractJsonObject(trimmed);
    if (jsonCandidate) {
        try {
            var parsed = JSON.parse(jsonCandidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch (_a) {
            // XML child tag parsing fallback.
        }
    }
    var input = {};
    var childPattern = /<([A-Za-z_][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    var child;
    while ((child = childPattern.exec(trimmed)) !== null) {
        input[child[1]] = coerceInlineXmlValue(decodeXmlEntities(child[2].trim()));
    }
    if (Object.keys(input).length > 0)
        return normalizeInlineToolInput(toolName, input);
    if (toolName === 'run_shell' || toolName === 'run_terminal') {
        return { command: decodeXmlEntities(trimmed) };
    }
    if (toolName === 'read_file' || toolName === 'cat' || toolName === 'list_dir' || toolName === 'ls') {
        return { path: decodeXmlEntities(trimmed) };
    }
    return null;
}
function normalizeInlineToolInput(toolName, input) {
    if ((toolName === 'run_shell' || toolName === 'run_terminal') && input.command === undefined && typeof input.cmd === 'string') {
        input.command = input.cmd;
    }
    if ((toolName === 'read_file' || toolName === 'cat') && input.path === undefined && typeof input.file === 'string') {
        input.path = input.file;
    }
    return input;
}
function withSyntheticOpenAIToolCalls(message, toolCalls) {
    return __assign(__assign({}, message), { role: 'assistant', content: typeof message.content === 'string' ? stripInlineXmlToolCalls(message.content, toolCalls) : '', tool_calls: toolCalls.map(function (tc) { return ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
            },
        }); }) });
}
function stripInlineXmlToolCalls(text, toolCalls) {
    var stripped = text;
    for (var _i = 0, toolCalls_1 = toolCalls; _i < toolCalls_1.length; _i++) {
        var tc = toolCalls_1[_i];
        stripped = stripped.replace(new RegExp("<".concat(escapeRegExp(tc.name), "\\b[^>]*>[\\s\\S]*?<\\/").concat(escapeRegExp(tc.name), ">"), 'gi'), '').trim();
    }
    return stripped;
}
function extractJsonObject(text) {
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
function coerceInlineXmlValue(value) {
    var _a;
    if (/^-?\d+(\.\d+)?$/.test(value))
        return Number(value);
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    var jsonCandidate = (_a = extractJsonObject(value)) !== null && _a !== void 0 ? _a : (value.startsWith('[') && value.endsWith(']') ? value : null);
    if (jsonCandidate) {
        try {
            return JSON.parse(jsonCandidate);
        }
        catch (_b) {
            return value;
        }
    }
    return value;
}
function decodeXmlEntities(value) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function readPositiveInt(value, fallback) {
    var parsed = Number.parseInt(value !== null && value !== void 0 ? value : '', 10);
    return Number.isFinite(parsed) && parsed > 1000 ? parsed : fallback;
}
var AUTO_CONTINUE_PROMPT = [
    'Bu yanıt bir ara durum güncellemesi olarak algılandı.',
    'Kullanıcıdan yeni bir mesaj bekleme ve onay isteme.',
    'Az önce söylediğin inceleme, arama, okuma veya düzenleme adımını şimdi gerçekten uygula.',
    'Gerekliyse tool kullanarak devam et ve görev tamamlanana kadar ilerle.',
    'Sadece kendi başına çözülemeyen gerçek bir blokaj varsa dur.',
].join(' ');
var POST_TOOL_CONTINUE_PROMPT = [
    'Az önce tool sonuçları üretildi ama kullanıcıya dönük final yanıt henüz tamamlanmadı.',
    'Eğer kullanıcının istediği bilgi tool sonucunda geldiyse hemen nihai, somut cevabı yaz ve dur.',
    'Sadece kullanıcının isteğini cevaplamak için doğrudan gerekli olan bir sonraki tool çağrısını yap.',
    'Kapsamı genişletme, kod veya yapılandırma dosyalarını incelemeye geçme.',
    'Yeni kullanıcı mesajı bekleme.',
].join(' ');
var MALFORMED_TOOL_CALL_PROMPT = [
    'Önceki tool çağrısı eksik veya bozuk JSON ile kesildi.',
    'Aynı adımı yeniden dene ama sadece geçerli ve eksiksiz tool çağrıları üret.',
    'Büyük bir dosya yazıyorsan içeriği daha küçük parçalara böl veya daha kısa bir araç çağrısı kullan.',
    'Ara durum mesajı yazma.',
].join(' ');
function shouldAutoContinue(text, round, maxRounds, autoContinueRounds, aggressiveAutoContinue) {
    if (aggressiveAutoContinue === void 0) { aggressiveAutoContinue = false; }
    if (!text.trim())
        return false;
    if (round >= maxRounds)
        return false;
    if (autoContinueRounds >= MAX_AUTO_CONTINUE_ROUNDS)
        return false;
    var normalized = text.toLowerCase().trim();
    if (normalized.length > 900)
        return false;
    if (aggressiveAutoContinue && !looksLikeFinalAnswer(normalized)) {
        return true;
    }
    return containsInterimLanguage(normalized);
}
var INTERIM_PATTERNS = [
    /\bgörelim\b/,
    /\bbulup\b/,
    /\bbakayım\b/,
    /\bbakıyorum\b/,
    /\binceleyeyim\b/,
    /\binceleyelim\b/,
    /\binceleyeceğim\b/,
    /\binceleyecegim\b/,
    /\bkontrol edeyim\b/,
    /\bkontrol ediyorum\b/,
    /\bkontrol edeceğim\b/,
    /\bkontrol edecegim\b/,
    /\bgöreyim\b/,
    /\bgoreyim\b/,
    /\bekleyeceğim\b/,
    /\bbelirleyelim\b/,
    /\bson satırları\b/,
    /\bdurmuyorum\b/,
    /\byazıyorum\b/,
    /\byazacağım\b/,
    /\byazacagim\b/,
    /\bekliyorum\b/,
    /\bdüzelteceğim\b/,
    /\bdüzeltiyorum\b/,
    /\bduzeltiyorum\b/,
    /\bdüzenliyorum\b/,
    /\bduzenliyorum\b/,
    /\bgüncelliyorum\b/,
    /\bguncelliyorum\b/,
    /\bilerliyorum\b/,
    /\bbitireceğim\b/,
    /\beklemeden\b/,
    /\bfonksiyonunu\b.*\bgörelim\b/,
    /\bşimdi\b.*\b(bakayım|görelim|inceleyelim|bulayım)\b/,
    /\bşimdi\b.*\b(yazıyorum|ekliyorum|düzeltiyorum|okuyorum|bakıyorum)\b/,
    /\bhemen\b.*\b(yazıyorum|bakıyorum|ekliyorum|okuyorum)\b/,
    /\bönce\b.*\b(oku|okuyayım|bakayım|görelim|bulayım)\b/,
    /\b(yapacağım|edeceğim|ekleyeceğim|yazacağım|bakacağım|okuyacağım|bulacağım)\b/,
    /\blet me\b.*\b(check|inspect|find|look)\b/,
    /\bi('| a)?ll\b.*\b(check|inspect|look|find)\b/,
];
function containsInterimLanguage(normalized) {
    if (looksLikePlanningJson(normalized))
        return true;
    if (INTERIM_PATTERNS.some(function (p) { return p.test(normalized); }))
        return true;
    return (normalized.endsWith(':') ||
        normalized.endsWith('...') ||
        normalized.includes('ekleme yapacağım yeri') ||
        normalized.includes('ona göre') ||
        normalized.includes('then i') ||
        normalized.includes('next i'));
}
function isSilentInterimOutput(text) {
    return looksLikePlanningJson(text.toLowerCase().trim());
}
function looksLikePlanningJson(normalized) {
    if (!normalized)
        return false;
    if (!normalized.includes('execution_plan') && !normalized.includes('"steps"'))
        return false;
    return normalized.includes('"ready"') || normalized.includes('"files_to_check"') || normalized.includes('"action"');
}
function shouldContinueAfterNoToolResponse(userMessage, assistantText, _config, round, maxRounds, autoContinueRounds, aggressiveAutoContinue) {
    return __awaiter(this, void 0, void 0, function () {
        var normalized;
        return __generator(this, function (_a) {
            if (shouldAutoContinue(assistantText, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)) {
                return [2 /*return*/, true];
            }
            if (!assistantText.trim()) {
                return [2 /*return*/, aggressiveAutoContinue || autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS];
            }
            normalized = assistantText.toLowerCase().trim();
            // Interim dil varsa model sadece niyet bildirmiştir; devam edip işi gerçekten yapsın.
            if (containsInterimLanguage(normalized))
                return [2 /*return*/, true];
            // Non-empty ve interim olmayan cevap final kabul edilir. Aksi halde basit cevaplar
            // "görev tamamlandı" demediği için gereksiz tool döngüsüne giriyor.
            return [2 /*return*/, false];
        });
    });
}
function shouldContinueAfterToolPhase(userMessage, assistantText, _config, round, maxRounds, postToolCompletionRounds) {
    return __awaiter(this, void 0, void 0, function () {
        var normalized;
        return __generator(this, function (_a) {
            if (round >= maxRounds)
                return [2 /*return*/, false];
            if (postToolCompletionRounds >= MAX_POST_TOOL_COMPLETION_ROUNDS)
                return [2 /*return*/, false];
            normalized = assistantText.toLowerCase().trim();
            // Boş cevap → devam et
            if (!normalized)
                return [2 /*return*/, true];
            // Tool sonrası model "okuyorum/bakayım/test edeceğim" gibi ara durum yazdıysa
            // gerçekten sonraki tool adımına geçsin.
            if (containsInterimLanguage(normalized))
                return [2 /*return*/, true];
            // Tool sonrası non-empty ve interim olmayan her cevap finaldir. Böylece basit
            // "dosyayı oku" istekleri okuduktan sonra başka dosyalara sapmaz.
            return [2 /*return*/, false];
        });
    });
}
function wantsUninterruptedExecution(userMessage) {
    var normalized = userMessage.toLowerCase();
    return normalized.includes('devam et')
        || normalized.includes('durma')
        || normalized.includes('bitene kadar')
        || normalized.includes('bitiresiye kadar')
        || normalized.includes('tamam devam et')
        || normalized.includes('sürekli devam');
}
function looksLikeFinalAnswer(text) {
    // Sadece net bitiş ifadeleri final sayılır.
    // "tamamlandı", "sonuç" gibi kelimeler tek başına yeterli değil —
    // rapor sunarken de kullanılabilirler.
    var finalPatterns = [
        /\bgörev tamamlandı\b/,
        /\btask completed\b/,
        /\biş bitti\b/,
        /\ball done\b/,
        /\bsorun çözüldü\b/,
        /\bproblem solved\b/,
        /\btüm (adımlar|işlemler) (tamamlandı|bitti)\b/,
        /\bdone here\b/,
        /\bno further (action|changes) (needed|required)\b/,
    ];
    // Kod bloğu TEK BAŞINA final cevap sayılmaz — raporlamada kod olabilir.
    // Sadece metin ÇOK kısaysa ve kod bloğundan ibaretse final say.
    if (text.includes('```')) {
        var textWithoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
        if (textWithoutCode.length < 30)
            return true;
    }
    return finalPatterns.some(function (pattern) { return pattern.test(text); });
}
// ─── Tool yürütücü (ortak) ───────────────────────────────────────────────────
function runTool(name, input, config) {
    return __awaiter(this, void 0, void 0, function () {
        var err_1, syncResult;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!manager_1.mcpManager.isMcpTool(name)) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, manager_1.mcpManager.callTool(name, input)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    err_1 = _a.sent();
                    return [2 /*return*/, "HATA: ".concat(err_1 instanceof Error ? err_1.message : String(err_1))];
                case 4:
                    syncResult = (0, tools_1.executeTool)(name, input);
                    if (!syncResult.startsWith('__ASYNC_TOOL__:')) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, tools_1.executeToolAsync)(name, input, config)];
                case 5: return [2 /*return*/, _a.sent()];
                case 6: return [2 /*return*/, syncResult];
            }
        });
    });
}
