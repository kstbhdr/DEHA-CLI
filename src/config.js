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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.getProviderLabel = getProviderLabel;
exports.resolveApiKey = resolveApiKey;
exports.resolveApiUrl = resolveApiUrl;
var DEFAULT_VISION_PROVIDER = 'openrouter';
var DEFAULT_VISION_MODEL = 'qwen/qwen3-vl-32b-instruct';
var LEGACY_WRONG_VISION_MODELS = new Set([
    'qwen/qwen3-32b',
]);
// ─── Config Fabrikası ───────────────────────────────────────────────────────
function getConfig(overrides) {
    if (overrides === void 0) { overrides = {}; }
    var base = {
        provider: (process.env.DEHA_PROVIDER || 'deepseek').toLowerCase(),
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        openrouterApiKey: process.env.OPENROUTER_API_KEY,
        xaiApiKey: process.env.XAI_API_KEY,
        customApiKey: process.env.CUSTOM_API_KEY,
        deepseekThinking: parseDeepSeekThinking(process.env.DEEPSEEK_THINKING),
        deepseekReasoningEffort: parseDeepSeekReasoningEffort(process.env.DEEPSEEK_REASONING_EFFORT),
        claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-4-6',
        openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
        deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-4',
        xaiModel: process.env.XAI_MODEL || 'grok-4.3',
        customModel: process.env.CUSTOM_MODEL || 'local-model',
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
        ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
        customApiUrl: process.env.CUSTOM_API_URL || 'http://localhost:8080/v1',
        openrouterProvider: process.env.OPENROUTER_PROVIDER || undefined,
        visionProvider: normalizeVisionProvider(process.env.VISION_PROVIDER),
        visionModel: normalizeVisionModel(process.env.VISION_MODEL),
        visionApiKey: process.env.VISION_API_KEY,
        visionApiUrl: process.env.VISION_API_URL,
        chatInputPrice: safeParseFloat(process.env.CHAT_INPUT_PRICE, 3.00),
        chatOutputPrice: safeParseFloat(process.env.CHAT_OUTPUT_PRICE, 15.00),
        plannerInputPrice: safeParseFloat(process.env.PLANNER_INPUT_PRICE, 3.00),
        plannerOutputPrice: safeParseFloat(process.env.PLANNER_OUTPUT_PRICE, 15.00),
        coderInputPrice: safeParseFloat(process.env.CODER_INPUT_PRICE, 0.27),
        coderOutputPrice: safeParseFloat(process.env.CODER_OUTPUT_PRICE, 1.10),
        judgeInputPrice: safeParseFloat(process.env.JUDGE_INPUT_PRICE, 5.00),
        judgeOutputPrice: safeParseFloat(process.env.JUDGE_OUTPUT_PRICE, 15.00),
        visionInputPrice: safeParseFloat(process.env.VISION_INPUT_PRICE, 3.00),
        visionOutputPrice: safeParseFloat(process.env.VISION_OUTPUT_PRICE, 15.00),
        agentInputPrice: safeParseFloat(process.env.AGENT_INPUT_PRICE, 3.00),
        agentOutputPrice: safeParseFloat(process.env.AGENT_OUTPUT_PRICE, 15.00),
        systemPrompt: process.env.DEHA_SYSTEM_PROMPT || (function () {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            var CHAT_PROMPT = require('./prompts.config').CHAT_PROMPT;
            return CHAT_PROMPT;
        })(),
        maxToolRounds: safeParseInt(process.env.DEHA_MAX_TOOL_ROUNDS, 200),
        toolMaxTokens: safeParseInt(process.env.DEHA_TOOL_MAX_TOKENS, 48 * 1024),
        maxTokens: safeParseInt(process.env.DEHA_MAX_TOKENS, 4096),
        temperature: safeParseFloat(process.env.DEHA_TEMPERATURE, 0.7),
        maxContextTokens: safeParseInt(process.env.DEHA_MAX_CONTEXT_TOKENS, 0), // 0 = otomatik
        compressThreshold: safeParseFloat(process.env.DEHA_COMPRESS_THRESHOLD, 0.75),
        minHotMessages: safeParseInt(process.env.DEHA_MIN_HOT_MESSAGES, 10),
        language: ((process.env.DEHA_LANG || 'tr').toLowerCase() === 'en' ? 'en' : 'tr'),
        pipeline: {
            planner: {
                provider: (process.env.PLANNER_PROVIDER || 'deepseek').toLowerCase(),
                model: process.env.PLANNER_MODEL || 'deepseek-v4-flash',
                apiKey: process.env.PLANNER_API_KEY,
                apiUrl: process.env.PLANNER_API_URL,
                maxTokens: safeParseInt(process.env.PLANNER_MAX_TOKENS, 4096),
                temperature: safeParseFloat(process.env.PLANNER_TEMPERATURE, 0.3),
                openrouterProvider: process.env.PLANNER_OPENROUTER_PROVIDER || undefined,
            },
            coder: {
                provider: (process.env.CODER_PROVIDER || 'deepseek').toLowerCase(),
                model: process.env.CODER_MODEL || 'deepseek-v4-flash',
                apiKey: process.env.CODER_API_KEY,
                apiUrl: process.env.CODER_API_URL,
                maxTokens: safeParseInt(process.env.CODER_MAX_TOKENS, 8192),
                temperature: safeParseFloat(process.env.CODER_TEMPERATURE, 0.2),
                openrouterProvider: process.env.CODER_OPENROUTER_PROVIDER || undefined,
            },
            judge: {
                provider: (process.env.JUDGE_PROVIDER || 'xai').toLowerCase(),
                model: process.env.JUDGE_MODEL || 'grok-4.3',
                apiKey: process.env.JUDGE_API_KEY,
                apiUrl: process.env.JUDGE_API_URL,
                maxTokens: safeParseInt(process.env.JUDGE_MAX_TOKENS, 2048),
                temperature: safeParseFloat(process.env.JUDGE_TEMPERATURE, 0.1),
                openrouterProvider: process.env.JUDGE_OPENROUTER_PROVIDER || undefined,
            },
            maxIterations: safeParseMaxIterations(process.env.PIPELINE_MAX_ITERATIONS),
        },
    };
    return __assign(__assign({}, base), overrides);
}
// ─── Güvenli sayı dönüşümleri (NaN önleme) ─────────────────────────────────
function safeParseInt(value, defaultVal) {
    if (value === undefined || value === '')
        return defaultVal;
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultVal : parsed;
}
function safeParseFloat(value, defaultVal) {
    if (value === undefined || value === '')
        return defaultVal;
    var parsed = parseFloat(value);
    return isNaN(parsed) ? defaultVal : parsed;
}
function safeParseMaxIterations(value) {
    var parsed = safeParseInt(value, 5);
    if (parsed <= 0)
        return 5;
    return Math.min(parsed, 5);
}
function normalizeVisionProvider(value) {
    var normalized = (value || '').trim().toLowerCase();
    return normalized || DEFAULT_VISION_PROVIDER;
}
function normalizeVisionModel(value) {
    var normalized = (value || '').trim();
    if (!normalized)
        return DEFAULT_VISION_MODEL;
    if (LEGACY_WRONG_VISION_MODELS.has(normalized))
        return DEFAULT_VISION_MODEL;
    return normalized;
}
function parseDeepSeekThinking(value) {
    var normalized = (value || '').trim().toLowerCase();
    if (['enabled', 'enable', 'on', 'true', '1', 'yes'].includes(normalized))
        return 'enabled';
    if (['disabled', 'disable', 'off', 'false', '0', 'no'].includes(normalized))
        return 'disabled';
    return 'disabled';
}
function parseDeepSeekReasoningEffort(value) {
    var normalized = (value || '').trim().toLowerCase();
    if (normalized === 'max' || normalized === 'xhigh')
        return 'max';
    return 'high';
}
// ─── Yardımcılar ────────────────────────────────────────────────────────────
function getProviderLabel(provider) {
    var labels = {
        claude: 'Claude (Anthropic)',
        openai: 'OpenAI GPT',
        deepseek: 'DeepSeek',
        ollama: 'Ollama (Yerel)',
        openrouter: 'OpenRouter',
        xai: 'xAI (Grok)',
        custom: 'Custom API',
    };
    return labels[provider];
}
/** Bir RoleConfig için geçerli API key'i döner (role-özgü > global) */
function resolveApiKey(role, global) {
    if (role.apiKey)
        return role.apiKey;
    switch (role.provider) {
        case 'claude': return global.anthropicApiKey;
        case 'openai': return global.openaiApiKey;
        case 'deepseek': return global.deepseekApiKey;
        case 'openrouter': return global.openrouterApiKey;
        case 'xai': return global.xaiApiKey;
        case 'custom': return global.customApiKey;
        case 'ollama': return undefined;
    }
}
/** Bir RoleConfig için geçerli API URL'ini döner */
function resolveApiUrl(role, global) {
    var _a;
    // role-özgü URL varsa onu kullan
    if (role.apiUrl)
        return role.apiUrl;
    // custom provider için global CUSTOM_API_URL
    if (role.provider === 'custom')
        return global.customApiUrl;
    // diğer providerlar için sabit URL'ler
    var urls = {
        openai: 'https://api.openai.com/v1',
        deepseek: 'https://api.deepseek.com',
        openrouter: 'https://openrouter.ai/api/v1',
        xai: 'https://api.x.ai/v1',
        ollama: global.ollamaHost,
    };
    return (_a = urls[role.provider]) !== null && _a !== void 0 ? _a : global.customApiUrl;
}
