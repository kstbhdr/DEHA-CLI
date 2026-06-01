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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
exports.callRole = callRole;
exports.sendMessage = sendMessage;
exports.streamMessage = streamMessage;
exports.sendWithTools = sendWithTools;
exports.sendWithToolsOpenAICompat = sendWithToolsOpenAICompat;
var fs = require("fs");
var path = require("path");
var axios_1 = require("axios");
var sdk_1 = require("@anthropic-ai/sdk");
var config_1 = require("../config");
var usage_tracker_1 = require("./usage-tracker");
var cache_1 = require("./cache");
// ─── Role-based çağrı (Pipeline için) ──────────────────────────────────────
function callRole(role_1, globalConfig_1, messages_1, systemPrompt_1, onChunk_1) {
    return __awaiter(this, arguments, void 0, function (role, globalConfig, messages, systemPrompt, onChunk, roleLabel, onReasoning) {
        var apiKey, maxTokens, temperature, apiUrl, openrouterProvider, track;
        var _a, _b, _c, _d;
        if (roleLabel === void 0) { roleLabel = 'chat'; }
        return __generator(this, function (_e) {
            apiKey = (0, config_1.resolveApiKey)(role, globalConfig);
            maxTokens = (_a = role.maxTokens) !== null && _a !== void 0 ? _a : globalConfig.maxTokens;
            temperature = (_b = role.temperature) !== null && _b !== void 0 ? _b : globalConfig.temperature;
            apiUrl = (0, config_1.resolveApiUrl)(role, globalConfig);
            openrouterProvider = (_d = (_c = role.openrouterProvider) !== null && _c !== void 0 ? _c : globalConfig.openrouterProvider) !== null && _d !== void 0 ? _d : undefined;
            track = function (inp, out, reasoning, cache) {
                if (reasoning === void 0) { reasoning = 0; }
                if (cache === void 0) { cache = 0; }
                return (0, usage_tracker_1.recordUsage)(role.provider, role.model, roleLabel, inp, out, globalConfig, reasoning, cache);
            };
            switch (role.provider) {
                case 'claude':
                    return [2 /*return*/, onChunk
                            ? streamClaude(messages, role.model, apiKey, maxTokens, systemPrompt, onChunk, track)
                            : sendClaude(messages, role.model, apiKey, maxTokens, systemPrompt, track)];
                case 'ollama':
                    return [2 /*return*/, onChunk
                            ? streamOllama(messages, role.model, apiUrl, systemPrompt, maxTokens, temperature, onChunk)
                            : sendOllama(messages, role.model, apiUrl, systemPrompt, maxTokens, temperature)];
                case 'openai':
                case 'deepseek':
                case 'openrouter':
                case 'xai':
                case 'custom':
                    return [2 /*return*/, onChunk
                            ? streamOpenAICompat(apiUrl, apiKey, role.provider, role.model, messages, systemPrompt, maxTokens, temperature, globalConfig, onChunk, track, openrouterProvider)
                            : sendOpenAICompat(apiUrl, apiKey, role.provider, role.model, messages, systemPrompt, maxTokens, temperature, globalConfig, track, openrouterProvider)];
                default:
                    throw new Error("Unknown provider: ".concat(role.provider));
            }
            return [2 /*return*/];
        });
    });
}
function roleFromConfig(config) {
    var _a;
    var modelMap = {
        claude: config.claudeModel,
        openai: config.openaiModel,
        deepseek: config.deepseekModel,
        openrouter: config.openrouterModel,
        xai: config.xaiModel,
        ollama: config.ollamaModel,
        custom: config.customModel,
    };
    return {
        provider: config.provider,
        model: (_a = modelMap[config.provider]) !== null && _a !== void 0 ? _a : config.customModel,
        apiUrl: config.provider === 'custom' ? config.customApiUrl : undefined,
    };
}
function sendMessage(messages_1, config_2) {
    return __awaiter(this, arguments, void 0, function (messages, config, useCache) {
        var model, cached, result;
        if (useCache === void 0) { useCache = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    model = roleFromConfig(config).model;
                    if (useCache) {
                        cached = (0, cache_1.getCached)(config.systemPrompt, messages, model);
                        if (cached !== null)
                            return [2 /*return*/, cached];
                    }
                    return [4 /*yield*/, callRole(roleFromConfig(config), config, messages, config.systemPrompt)];
                case 1:
                    result = _a.sent();
                    if (useCache)
                        (0, cache_1.setCache)(config.systemPrompt, messages, model, result);
                    return [2 /*return*/, result];
            }
        });
    });
}
function streamMessage(messages, config, onChunk, onReasoning) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, callRole(roleFromConfig(config), config, messages, config.systemPrompt, onChunk, 'chat', onReasoning)];
        });
    });
}
function toOpenAITools(tools) {
    return tools.map(function (t) { return ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
    }); });
}
function withSpinner(_config, _label, fn) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, fn()];
        });
    });
}
/** Anthropic specific message mapper */
function toClaudeMessages(messages) {
    return messages
        .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
        .map(function (m) { return ({
        role: m.role,
        content: m.content || ''
    }); });
}
function sendWithTools(messages_1, config_2, tools_1, onChunk_1, abortSignal_1) {
    return __awaiter(this, arguments, void 0, function (messages, config, tools, onChunk, abortSignal, toolChoice) {
        var oaiMessages, r, apiKey, client, response, text, toolCalls, _i, _a, block;
        if (toolChoice === void 0) { toolChoice = 'auto'; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(config.provider !== 'claude')) return [3 /*break*/, 2];
                    oaiMessages = messages.map(function (m) {
                        var msg = { role: m.role, content: m.content };
                        if (m.tool_calls)
                            msg.tool_calls = m.tool_calls;
                        if (m.tool_call_id)
                            msg.tool_call_id = m.tool_call_id;
                        return msg;
                    });
                    return [4 /*yield*/, sendWithToolsOpenAICompat(oaiMessages, config, tools, onChunk, abortSignal, toolChoice)];
                case 1:
                    r = _b.sent();
                    return [2 /*return*/, { text: r.text, toolCalls: r.toolCalls }];
                case 2:
                    apiKey = config.anthropicApiKey;
                    if (!apiKey)
                        throw new Error('ANTHROPIC_API_KEY eksik');
                    client = new sdk_1.default({ apiKey: apiKey });
                    return [4 /*yield*/, withSpinner(config, 'düşünüyor', function () { return client.messages.create({
                            model: config.claudeModel,
                            max_tokens: config.maxTokens,
                            system: config.systemPrompt,
                            tools: tools,
                            tool_choice: toolChoice === 'required' ? { type: 'any' } : { type: 'auto' },
                            messages: toClaudeMessages(messages),
                        }, { signal: abortSignal }); })];
                case 3:
                    response = _b.sent();
                    (0, usage_tracker_1.recordUsage)('anthropic', config.claudeModel, 'agent', response.usage.input_tokens, response.usage.output_tokens, config);
                    text = '';
                    toolCalls = [];
                    for (_i = 0, _a = response.content; _i < _a.length; _i++) {
                        block = _a[_i];
                        if (block.type === 'text') {
                            text += block.text;
                            if (onChunk)
                                onChunk(block.text);
                        }
                        else if (block.type === 'tool_use') {
                            toolCalls.push({ name: block.name, input: block.input, id: block.id });
                        }
                    }
                    return [2 /*return*/, { text: text, toolCalls: toolCalls }];
            }
        });
    });
}
function sendWithToolsOpenAICompat(messages_1, config_2, tools_1, onChunk_1, abortSignal_1) {
    return __awaiter(this, arguments, void 0, function (messages, config, tools, onChunk, abortSignal, toolChoice) {
        var role, apiKey, apiUrl, toolMaxTokens, body, response, err_1, fallbackBody, msg, agentUsage, sanitizedAssistantMsg, text, rawToolCalls, toolCalls;
        var _a, _b, _c;
        if (toolChoice === void 0) { toolChoice = 'auto'; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    role = roleFromConfig(config);
                    apiKey = (0, config_1.resolveApiKey)(role, config);
                    apiUrl = (0, config_1.resolveApiUrl)(role, config);
                    if (!apiKey)
                        throw new Error("API key missing (".concat(apiUrl, ")"));
                    toolMaxTokens = (_a = role.maxTokens) !== null && _a !== void 0 ? _a : config.maxTokens;
                    body = {
                        model: role.model,
                        messages: messages,
                        tools: toOpenAITools(tools),
                        tool_choice: toolChoice === 'required' ? 'required' : 'auto',
                        max_tokens: toolMaxTokens,
                        temperature: config.temperature,
                    };
                    if (config.openrouterProvider) {
                        body.provider = { only: [config.openrouterProvider], allow_fallbacks: false };
                    }
                    applyOpenAICompatProviderOptions(body, role.provider, config);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 7]);
                    return [4 /*yield*/, withSpinner(config, 'düşünüyor', function () { return axios_1.default.post("".concat(apiUrl, "/chat/completions"), body, {
                            headers: { Authorization: "Bearer ".concat(apiKey), 'Content-Type': 'application/json' },
                            timeout: 300000,
                            signal: abortSignal,
                        }); })];
                case 2:
                    response = _d.sent();
                    return [3 /*break*/, 7];
                case 3:
                    err_1 = _d.sent();
                    writeOpenAICompatDebugFile('last-openai-tool-error.json', {
                        phase: 'initial_request',
                        url: "".concat(apiUrl, "/chat/completions"),
                        body: body,
                        error: extractAxiosErrorPayload(err_1),
                    });
                    if (!shouldRetryWithAutoToolChoice(err_1, toolChoice)) return [3 /*break*/, 5];
                    fallbackBody = __assign(__assign({}, body), { tool_choice: 'auto' });
                    return [4 /*yield*/, axios_1.default.post("".concat(apiUrl, "/chat/completions"), fallbackBody, {
                            headers: { Authorization: "Bearer ".concat(apiKey), 'Content-Type': 'application/json' },
                            timeout: 120000,
                            signal: abortSignal,
                        })];
                case 4:
                    response = _d.sent();
                    return [3 /*break*/, 6];
                case 5: throw normalizeAxiosError(err_1);
                case 6: return [3 /*break*/, 7];
                case 7:
                    msg = response.data.choices[0].message;
                    agentUsage = extractUsageTokens(response.data.usage, msg);
                    if (agentUsage.input > 0 || agentUsage.output > 0) {
                        (0, usage_tracker_1.recordUsage)(role.provider, role.model, 'agent', agentUsage.input, agentUsage.output, config, agentUsage.reasoning);
                    }
                    writeOpenAICompatDebugFile('last-openai-tool-message.json', msg);
                    sanitizedAssistantMsg = sanitizeOpenAICompatAssistantMessage(msg, role.provider === 'deepseek' && config.deepseekThinking === 'enabled');
                    writeOpenAICompatDebugFile('last-openai-tool-message-sanitized.json', sanitizedAssistantMsg);
                    text = (_b = sanitizedAssistantMsg.content) !== null && _b !== void 0 ? _b : '';
                    if (text && onChunk)
                        onChunk(text);
                    rawToolCalls = ((_c = sanitizedAssistantMsg.tool_calls) !== null && _c !== void 0 ? _c : []);
                    toolCalls = rawToolCalls
                        .map(function (tc) {
                        var _a;
                        var fn = tc.function;
                        var name = (_a = fn === null || fn === void 0 ? void 0 : fn.name) === null || _a === void 0 ? void 0 : _a.trim();
                        var rawArguments = normalizeToolArguments(fn === null || fn === void 0 ? void 0 : fn.arguments);
                        if (!name || !rawArguments) {
                            return null;
                        }
                        try {
                            var input = JSON.parse(rawArguments);
                            return { name: name, input: input, id: tc.id };
                        }
                        catch (_b) {
                            return null;
                        }
                    })
                        .filter(function (toolCall) { return toolCall !== null; });
                    return [2 /*return*/, {
                            text: text,
                            toolCalls: toolCalls,
                            rawAssistantMsg: sanitizedAssistantMsg,
                            malformedToolCalls: Math.max(0, rawToolCalls.length - toolCalls.length),
                        }];
            }
        });
    });
}
function sanitizeOpenAICompatAssistantMessage(msg, preserveReasoningForToolCalls) {
    if (preserveReasoningForToolCalls === void 0) { preserveReasoningForToolCalls = false; }
    var msgToolCalls = Array.isArray(msg.tool_calls)
        ? msg.tool_calls
        : [];
    var hasToolCalls = msgToolCalls.length > 0;
    var sanitized = {
        role: 'assistant',
        content: hasToolCalls ? null : (typeof msg.content === 'string' ? msg.content : ''),
    };
    if (typeof msg.reasoning_content === 'string' &&
        msg.reasoning_content.trim() &&
        (!hasToolCalls || preserveReasoningForToolCalls)) {
        sanitized.reasoning_content = msg.reasoning_content;
    }
    if (hasToolCalls) {
        sanitized.tool_calls = msgToolCalls
            .map(function (tc) {
            var id = typeof (tc === null || tc === void 0 ? void 0 : tc.id) === 'string' ? tc.id : '';
            var fn = tc === null || tc === void 0 ? void 0 : tc.function;
            var name = typeof (fn === null || fn === void 0 ? void 0 : fn.name) === 'string' ? fn.name : '';
            var rawArguments = normalizeToolArguments(fn === null || fn === void 0 ? void 0 : fn.arguments);
            if (!id || !name || !rawArguments) {
                return null;
            }
            return {
                id: id,
                type: 'function',
                function: {
                    name: name,
                    arguments: rawArguments,
                },
            };
        })
            .filter(Boolean);
    }
    return sanitized;
}
function normalizeToolArguments(value) {
    if (typeof value === 'string')
        return value.trim();
    if (value && typeof value === 'object') {
        try {
            return JSON.stringify(value);
        }
        catch (_a) {
            return '';
        }
    }
    return '';
}
function applyOpenAICompatProviderOptions(body, provider, config) {
    if (provider !== 'deepseek')
        return;
    body.thinking = { type: config.deepseekThinking };
    if (config.deepseekThinking === 'enabled') {
        body.reasoning_effort = config.deepseekReasoningEffort;
        delete body.temperature;
    }
    else {
        delete body.reasoning_effort;
    }
}
function shouldRetryWithAutoToolChoice(err, toolChoice) {
    var _a, _b, _c, _d;
    if (toolChoice !== 'required' || !axios_1.default.isAxiosError(err))
        return false;
    var status = (_a = err.response) === null || _a === void 0 ? void 0 : _a.status;
    if (status !== 400)
        return false;
    var payload = typeof ((_b = err.response) === null || _b === void 0 ? void 0 : _b.data) === 'string'
        ? err.response.data
        : JSON.stringify((_d = (_c = err.response) === null || _c === void 0 ? void 0 : _c.data) !== null && _d !== void 0 ? _d : {});
    var normalized = payload.toLowerCase();
    return normalized.includes('tool_choice')
        || normalized.includes('required')
        || normalized.includes('tool use')
        || normalized.includes('tool_calls');
}
function normalizeAxiosError(err) {
    var _a, _b, _c, _d;
    if (!axios_1.default.isAxiosError(err)) {
        return err instanceof Error ? err : new Error(String(err));
    }
    var status = (_a = err.response) === null || _a === void 0 ? void 0 : _a.status;
    var payload = typeof ((_b = err.response) === null || _b === void 0 ? void 0 : _b.data) === 'string'
        ? err.response.data
        : JSON.stringify((_d = (_c = err.response) === null || _c === void 0 ? void 0 : _c.data) !== null && _d !== void 0 ? _d : {});
    var detail = payload && payload !== '{}' ? " - ".concat(payload) : '';
    var axiosMsg = err.message ? ": ".concat(err.message) : '';
    return new Error("API request failed".concat(status ? " (".concat(status, ")") : '').concat(axiosMsg).concat(detail));
}
function extractAxiosErrorPayload(err) {
    var _a, _b, _c, _d;
    if (!axios_1.default.isAxiosError(err)) {
        return err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
    }
    return {
        message: err.message,
        status: (_b = (_a = err.response) === null || _a === void 0 ? void 0 : _a.status) !== null && _b !== void 0 ? _b : null,
        data: (_d = (_c = err.response) === null || _c === void 0 ? void 0 : _c.data) !== null && _d !== void 0 ? _d : null,
    };
}
function writeOpenAICompatDebugFile(fileName, payload) {
    if (!process.env.DEHA_DEBUG_TOOL_CALLS)
        return;
    try {
        var debugDir = path.join(process.cwd(), '.deha');
        fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, fileName), JSON.stringify(payload, null, 2), 'utf-8');
    }
    catch (_a) {
    }
}
function extractUsageTokens(usage, assistantMessage) {
    var _a, _b, _c, _d;
    var u = (usage && typeof usage === 'object') ? usage : {};
    var input = (_b = (_a = readNumber(u.prompt_tokens)) !== null && _a !== void 0 ? _a : readNumber(u.input_tokens)) !== null && _b !== void 0 ? _b : 0;
    var baseOutput = (_d = (_c = readNumber(u.completion_tokens)) !== null && _c !== void 0 ? _c : readNumber(u.output_tokens)) !== null && _d !== void 0 ? _d : 0;
    var explicitReasoning = extractReasoningTokens(u);
    var explicitCache = extractCacheTokens(u);
    var visibleText = typeof (assistantMessage === null || assistantMessage === void 0 ? void 0 : assistantMessage.content) === 'string' ? assistantMessage.content : '';
    var reasoningText = typeof (assistantMessage === null || assistantMessage === void 0 ? void 0 : assistantMessage.reasoning_content) === 'string' ? assistantMessage.reasoning_content : '';
    var visibleEstimate = estimateTextTokens(visibleText);
    var reasoningEstimate = explicitReasoning > 0 ? explicitReasoning : estimateTextTokens(reasoningText);
    var fallbackOutput = visibleEstimate + reasoningEstimate;
    return {
        input: input,
        output: Math.max(baseOutput, fallbackOutput),
        reasoning: reasoningEstimate,
        cache: explicitCache,
    };
}
function extractCacheTokens(usage) {
    var _a, _b, _c, _d, _e, _f;
    var details = (_b = (_a = asRecord(usage.prompt_tokens_details)) !== null && _a !== void 0 ? _a : asRecord(usage.input_tokens_details)) !== null && _b !== void 0 ? _b : asRecord(usage.usage_details);
    return (_f = (_e = (_d = (_c = readNumber(details === null || details === void 0 ? void 0 : details.cached_tokens)) !== null && _c !== void 0 ? _c : readNumber(details === null || details === void 0 ? void 0 : details.cache_read_tokens)) !== null && _d !== void 0 ? _d : readNumber(details === null || details === void 0 ? void 0 : details.cache_hit_tokens)) !== null && _e !== void 0 ? _e : readNumber(usage.prompt_cache_hit_tokens)) !== null && _f !== void 0 ? _f : 0;
}
function extractReasoningTokens(usage) {
    var _a, _b, _c, _d, _e;
    var details = (_b = (_a = asRecord(usage.completion_tokens_details)) !== null && _a !== void 0 ? _a : asRecord(usage.output_tokens_details)) !== null && _b !== void 0 ? _b : asRecord(usage.usage_details);
    return (_e = (_d = (_c = readNumber(details === null || details === void 0 ? void 0 : details.reasoning_tokens)) !== null && _c !== void 0 ? _c : readNumber(details === null || details === void 0 ? void 0 : details.reasoning)) !== null && _d !== void 0 ? _d : readNumber(usage.reasoning_tokens)) !== null && _e !== void 0 ? _e : 0;
}
function asRecord(value) {
    return value && typeof value === 'object' ? value : null;
}
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function estimateTextTokens(text) {
    if (!text.trim())
        return 0;
    return Math.ceil(text.length / 4);
}
function sendClaude(messages, model, apiKey, maxTokens, systemPrompt, track) {
    return __awaiter(this, void 0, void 0, function () {
        var client, response, block;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!apiKey)
                        throw new Error('ANTHROPIC_API_KEY is not set.');
                    client = new sdk_1.default({ apiKey: apiKey });
                    return [4 /*yield*/, client.messages.create({
                            model: model,
                            max_tokens: maxTokens, system: systemPrompt,
                            messages: toClaudeMessages(messages),
                        })];
                case 1:
                    response = _a.sent();
                    track === null || track === void 0 ? void 0 : track(response.usage.input_tokens, response.usage.output_tokens);
                    block = response.content[0];
                    if (block.type !== 'text')
                        throw new Error('Unexpected response type');
                    return [2 /*return*/, block.text];
            }
        });
    });
}
function streamClaude(messages, model, apiKey, maxTokens, systemPrompt, onChunk, track) {
    return __awaiter(this, void 0, void 0, function () {
        var client, full, stream, _a, stream_1, stream_1_1, event_1, e_1_1, final;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!apiKey)
                        throw new Error('ANTHROPIC_API_KEY is not set.');
                    client = new sdk_1.default({ apiKey: apiKey });
                    full = '';
                    stream = client.messages.stream({
                        model: model,
                        max_tokens: maxTokens, system: systemPrompt,
                        messages: toClaudeMessages(messages),
                    });
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 2;
                case 2: return [4 /*yield*/, stream_1.next()];
                case 3:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = stream_1_1.value;
                    _a = false;
                    event_1 = _d;
                    if (event_1.type === 'content_block_delta' && event_1.delta.type === 'text_delta') {
                        onChunk(event_1.delta.text);
                        full += event_1.delta.text;
                    }
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12: return [4 /*yield*/, stream.finalMessage()];
                case 13:
                    final = _e.sent();
                    track === null || track === void 0 ? void 0 : track(final.usage.input_tokens, final.usage.output_tokens);
                    return [2 /*return*/, full];
            }
        });
    });
}
function sendOpenAICompat(baseUrl, apiKey, provider, model, messages, systemPrompt, maxTokens, temperature, config, track, openrouterProvider) {
    return __awaiter(this, void 0, void 0, function () {
        var body, response, msg, usage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!apiKey)
                        throw new Error("API key missing (".concat(baseUrl, ")"));
                    body = {
                        model: model,
                        messages: __spreadArray([
                            { role: 'system', content: systemPrompt }
                        ], messages.map(function (m) {
                            var msg = { role: m.role, content: m.content };
                            if (m.tool_calls)
                                msg.tool_calls = m.tool_calls;
                            if (m.tool_call_id)
                                msg.tool_call_id = m.tool_call_id;
                            return msg;
                        }), true),
                        max_tokens: maxTokens,
                        temperature: temperature,
                    };
                    if (openrouterProvider) {
                        body.provider = { only: [openrouterProvider], allow_fallbacks: false };
                    }
                    applyOpenAICompatProviderOptions(body, provider, config);
                    return [4 /*yield*/, axios_1.default.post("".concat(baseUrl, "/chat/completions"), body, {
                            headers: { Authorization: "Bearer ".concat(apiKey), 'Content-Type': 'application/json' },
                        })];
                case 1:
                    response = _a.sent();
                    msg = response.data.choices[0].message;
                    usage = extractUsageTokens(response.data.usage, msg);
                    if (usage.input > 0 || usage.output > 0)
                        track === null || track === void 0 ? void 0 : track(usage.input, usage.output, usage.reasoning, usage.cache);
                    return [2 /*return*/, typeof msg.content === 'string' ? msg.content : ''];
            }
        });
    });
}
function streamOpenAICompat(baseUrl, apiKey, provider, model, messages, systemPrompt, maxTokens, temperature, config, onChunk, track, openrouterProvider, onReasoning) {
    return __awaiter(this, void 0, void 0, function () {
        var body, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!apiKey)
                        throw new Error("API key missing (".concat(baseUrl, ")"));
                    body = {
                        model: model,
                        messages: __spreadArray([
                            { role: 'system', content: systemPrompt }
                        ], messages.map(function (m) {
                            var msg = { role: m.role, content: m.content };
                            if (m.tool_calls)
                                msg.tool_calls = m.tool_calls;
                            if (m.tool_call_id)
                                msg.tool_call_id = m.tool_call_id;
                            return msg;
                        }), true),
                        max_tokens: maxTokens,
                        temperature: temperature,
                        stream: true,
                        stream_options: { include_usage: true },
                    };
                    if (openrouterProvider) {
                        body.provider = { only: [openrouterProvider], allow_fallbacks: false };
                    }
                    applyOpenAICompatProviderOptions(body, provider, config);
                    return [4 /*yield*/, axios_1.default.post("".concat(baseUrl, "/chat/completions"), body, {
                            headers: { Authorization: "Bearer ".concat(apiKey), 'Content-Type': 'application/json' },
                            responseType: 'stream',
                        })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, parseSSEStream(response.data, onChunk, track, onReasoning)];
            }
        });
    });
}
function sendOllama(messages, model, host, systemPrompt, maxTokens, temperature) {
    return __awaiter(this, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, axios_1.default.post("".concat(host, "/api/chat"), {
                        model: model,
                        messages: __spreadArray([
                            { role: 'system', content: systemPrompt }
                        ], messages.map(function (m) { return ({ role: m.role, content: m.content }); }), true),
                        stream: false,
                        options: { temperature: temperature, num_predict: maxTokens },
                    }, { timeout: 120000 })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.data.message.content];
            }
        });
    });
}
function streamOllama(messages, model, host, systemPrompt, maxTokens, temperature, onChunk) {
    return __awaiter(this, void 0, void 0, function () {
        var response, full;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, axios_1.default.post("".concat(host, "/api/chat"), {
                        model: model,
                        messages: __spreadArray([
                            { role: 'system', content: systemPrompt }
                        ], messages.map(function (m) { return ({ role: m.role, content: m.content }); }), true),
                        stream: true,
                        options: { temperature: temperature, num_predict: maxTokens },
                    }, { responseType: 'stream', timeout: 120000 })];
                case 1:
                    response = _a.sent();
                    full = '';
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            response.data.on('data', function (chunk) {
                                var _a, _b;
                                for (var _i = 0, _c = chunk.toString().split('\n').filter(Boolean); _i < _c.length; _i++) {
                                    var line = _c[_i];
                                    try {
                                        var parsed = JSON.parse(line);
                                        var text = (_b = (_a = parsed.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : '';
                                        if (text) {
                                            onChunk(text);
                                            full += text;
                                        }
                                    }
                                    catch ( /* skip */_d) { /* skip */ }
                                }
                            });
                            response.data.on('end', function () { return resolve(full); });
                            response.data.on('error', reject);
                        })];
            }
        });
    });
}
function parseSSEStream(stream, onChunk, track, onReasoning) {
    var full = '';
    var reasoningContent = '';
    var buf = '';
    return new Promise(function (resolve, reject) {
        stream.on('data', function (raw) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            buf += raw.toString();
            var lines = buf.split('\n');
            buf = (_a = lines.pop()) !== null && _a !== void 0 ? _a : '';
            for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                var line = lines_1[_i];
                var trimmed = line.replace(/^data: /, '').trim();
                if (!trimmed || trimmed === '[DONE]')
                    continue;
                try {
                    var parsed = JSON.parse(trimmed);
                    var delta = (_e = (_d = (_c = (_b = parsed.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.delta) === null || _d === void 0 ? void 0 : _d.content) !== null && _e !== void 0 ? _e : '';
                    var reasoningDelta = (_j = (_h = (_g = (_f = parsed.choices) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.delta) === null || _h === void 0 ? void 0 : _h.reasoning_content) !== null && _j !== void 0 ? _j : '';
                    if (delta) {
                        onChunk(delta);
                        full += delta;
                    }
                    if (reasoningDelta) {
                        if (onReasoning)
                            onReasoning(reasoningDelta);
                        reasoningContent += reasoningDelta;
                    }
                    if (parsed.usage && track) {
                        var usage = extractUsageTokens(parsed.usage, {
                            role: 'assistant',
                            content: full,
                            reasoning_content: reasoningContent,
                        });
                        track(usage.input, usage.output, usage.reasoning, usage.cache);
                    }
                }
                catch ( /* skip */_k) { /* skip */ }
            }
        });
        stream.on('end', function () { return resolve(full); });
        stream.on('error', reject);
    });
}
