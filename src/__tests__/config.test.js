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
var vitest_1 = require("vitest");
var config_1 = require("../config");
var ORIGINAL_ENV = __assign({}, process.env);
(0, vitest_1.beforeEach)(function () {
    // Tüm DEHA_* ve pipeline env'lerini temizle — test izolasyonu
    delete process.env.DEHA_PROVIDER;
    delete process.env.DEHA_MAX_TOKENS;
    delete process.env.DEHA_TEMPERATURE;
    delete process.env.DEHA_MAX_TOOL_ROUNDS;
    delete process.env.DEHA_COMPRESS_THRESHOLD;
    delete process.env.DEHA_MIN_HOT_MESSAGES;
    delete process.env.DEHA_MAX_CONTEXT_TOKENS;
    delete process.env.DEHA_TOOL_MAX_TOKENS;
    delete process.env.DEEPSEEK_THINKING;
    delete process.env.DEEPSEEK_REASONING_EFFORT;
    delete process.env.PLANNER_PROVIDER;
    delete process.env.CODER_PROVIDER;
    delete process.env.JUDGE_PROVIDER;
    delete process.env.PIPELINE_MAX_ITERATIONS;
    // systemPrompt require() hatasını önlemek için env set et
    process.env.DEHA_SYSTEM_PROMPT = 'test prompt';
});
(0, vitest_1.afterEach)(function () {
    process.env = __assign({}, ORIGINAL_ENV);
});
(0, vitest_1.describe)('getConfig', function () {
    (0, vitest_1.it)('varsayılan değerlerle config döndürür', function () {
        var cfg = (0, config_1.getConfig)();
        (0, vitest_1.expect)(cfg.provider).toBe('claude');
        (0, vitest_1.expect)(cfg.claudeModel).toBe('claude-opus-4-6');
        (0, vitest_1.expect)(cfg.maxTokens).toBe(4096);
        (0, vitest_1.expect)(cfg.temperature).toBe(0.7);
        (0, vitest_1.expect)(cfg.maxToolRounds).toBe(200);
        (0, vitest_1.expect)(cfg.toolMaxTokens).toBe(49152);
        (0, vitest_1.expect)(cfg.visionProvider).toBe('openrouter');
        (0, vitest_1.expect)(cfg.visionModel).toBe('qwen/qwen3-vl-32b-instruct');
        (0, vitest_1.expect)(cfg.deepseekThinking).toBe('disabled');
        (0, vitest_1.expect)(cfg.deepseekReasoningEffort).toBe('high');
        (0, vitest_1.expect)(cfg.maxContextTokens).toBe(0);
        (0, vitest_1.expect)(cfg.compressThreshold).toBe(0.75);
        (0, vitest_1.expect)(cfg.minHotMessages).toBe(10);
    });
    (0, vitest_1.it)('provider küçük harfe dönüştürülür', function () {
        process.env.DEHA_PROVIDER = 'DeepSeek';
        (0, vitest_1.expect)((0, config_1.getConfig)().provider).toBe('deepseek');
    });
    (0, vitest_1.it)('ortam değişkenlerini okur', function () {
        process.env.DEHA_MAX_TOKENS = '8192';
        process.env.DEHA_TEMPERATURE = '0.3';
        process.env.DEHA_MAX_TOOL_ROUNDS = '50';
        process.env.DEHA_COMPRESS_THRESHOLD = '0.85';
        process.env.DEEPSEEK_THINKING = 'on';
        process.env.DEEPSEEK_REASONING_EFFORT = 'xhigh';
        process.env.PIPELINE_MAX_ITERATIONS = '200';
        process.env.VISION_MODEL = 'qwen/qwen3-32b';
        var cfg = (0, config_1.getConfig)();
        (0, vitest_1.expect)(cfg.maxTokens).toBe(8192);
        (0, vitest_1.expect)(cfg.temperature).toBe(0.3);
        (0, vitest_1.expect)(cfg.maxToolRounds).toBe(50);
        (0, vitest_1.expect)(cfg.compressThreshold).toBe(0.85);
        (0, vitest_1.expect)(cfg.deepseekThinking).toBe('enabled');
        (0, vitest_1.expect)(cfg.deepseekReasoningEffort).toBe('max');
        (0, vitest_1.expect)(cfg.pipeline.maxIterations).toBe(5);
        (0, vitest_1.expect)(cfg.visionModel).toBe('qwen/qwen3-vl-32b-instruct');
    });
    (0, vitest_1.it)('override değerler base değerleri ezer', function () {
        var cfg = (0, config_1.getConfig)({ maxTokens: 9999, temperature: 1.0 });
        (0, vitest_1.expect)(cfg.maxTokens).toBe(9999);
        (0, vitest_1.expect)(cfg.temperature).toBe(1.0);
        // override edilmeyenler varsayılan kalır
        (0, vitest_1.expect)(cfg.provider).toBeDefined();
    });
    (0, vitest_1.it)('pipeline yapılandırması doğru', function () {
        var cfg = (0, config_1.getConfig)();
        (0, vitest_1.expect)(cfg.pipeline.planner.provider).toBe('claude');
        (0, vitest_1.expect)(cfg.pipeline.coder.provider).toBe('deepseek');
        (0, vitest_1.expect)(cfg.pipeline.judge.provider).toBe('xai');
        (0, vitest_1.expect)(cfg.pipeline.maxIterations).toBe(5);
    });
    (0, vitest_1.it)('pipeline override çalışır', function () {
        var cfg = (0, config_1.getConfig)({
            pipeline: {
                planner: { provider: 'openai', model: 'gpt-4o' },
                coder: { provider: 'claude', model: 'claude-sonnet-4' },
                judge: { provider: 'deepseek', model: 'deepseek-chat' },
                maxIterations: 10,
            },
        });
        (0, vitest_1.expect)(cfg.pipeline.planner.provider).toBe('openai');
        (0, vitest_1.expect)(cfg.pipeline.coder.model).toBe('claude-sonnet-4');
        (0, vitest_1.expect)(cfg.pipeline.judge.provider).toBe('deepseek');
        (0, vitest_1.expect)(cfg.pipeline.maxIterations).toBe(10);
    });
    (0, vitest_1.it)('hatalı env değerinde varsayılan kullanılır (safeParseInt fix)', function () {
        process.env.DEHA_MAX_TOKENS = 'invalid';
        process.env.DEHA_TEMPERATURE = 'invalid';
        var cfg = (0, config_1.getConfig)();
        (0, vitest_1.expect)(cfg.maxTokens).toBe(4096);
        (0, vitest_1.expect)(cfg.temperature).toBe(0.7);
    });
    (0, vitest_1.it)('boş env değerinde varsayılan kullanılır', function () {
        process.env.DEHA_MAX_TOKENS = '';
        var cfg = (0, config_1.getConfig)();
        (0, vitest_1.expect)(cfg.maxTokens).toBe(4096);
    });
});
(0, vitest_1.describe)('getProviderLabel', function () {
    (0, vitest_1.it)('geçerli providerlar için etiket döndürür', function () {
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('claude')).toContain('Claude');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('openai')).toContain('OpenAI');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('deepseek')).toContain('DeepSeek');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('ollama')).toContain('Ollama');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('openrouter')).toContain('OpenRouter');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('xai')).toContain('Grok');
        (0, vitest_1.expect)((0, config_1.getProviderLabel)('custom')).toContain('Custom');
    });
});
(0, vitest_1.describe)('resolveApiKey', function () {
    var fakeGlobal = {
        provider: 'claude',
        anthropicApiKey: 'sk-ant-xxx',
        openaiApiKey: 'sk-openai-xxx',
        deepseekApiKey: 'sk-deep-xxx',
        openrouterApiKey: 'sk-or-xxx',
        xaiApiKey: 'sk-xai-xxx',
        customApiKey: 'sk-custom-xxx',
        deepseekThinking: 'disabled',
        deepseekReasoningEffort: 'high',
        claudeModel: 'claude-opus-4-6',
        openaiModel: 'gpt-4o',
        deepseekModel: 'deepseek-chat',
        openrouterModel: 'anthropic/claude-opus-4',
        xaiModel: 'grok-3',
        customModel: 'local-model',
        ollamaHost: 'http://localhost:11434',
        ollamaModel: 'llama3',
        customApiUrl: 'http://localhost:8080/v1',
        visionProvider: 'openrouter',
        visionModel: 'qwen/qwen3-vl-32b-instruct',
        chatInputPrice: 3,
        chatOutputPrice: 15,
        plannerInputPrice: 3,
        plannerOutputPrice: 15,
        coderInputPrice: 0.27,
        coderOutputPrice: 1.10,
        judgeInputPrice: 5,
        judgeOutputPrice: 15,
        visionInputPrice: 3,
        visionOutputPrice: 15,
        agentInputPrice: 3,
        agentOutputPrice: 15,
        systemPrompt: '',
        maxTokens: 4096,
        temperature: 0.7,
        maxToolRounds: 200,
        toolMaxTokens: 49152,
        maxContextTokens: 0,
        compressThreshold: 0.75,
        minHotMessages: 10,
        pipeline: {},
    };
    (0, vitest_1.it)('role-özgü key global keyi ezer', function () {
        var role = { provider: 'claude', model: 'x', apiKey: 'role-specific-key' };
        (0, vitest_1.expect)((0, config_1.resolveApiKey)(role, fakeGlobal)).toBe('role-specific-key');
    });
    (0, vitest_1.it)('ollama için undefined döndürür', function () {
        var role = { provider: 'ollama', model: 'llama3' };
        (0, vitest_1.expect)((0, config_1.resolveApiKey)(role, fakeGlobal)).toBeUndefined();
    });
    (0, vitest_1.it)('provider bazlı global keyi döndürür', function () {
        (0, vitest_1.expect)((0, config_1.resolveApiKey)({ provider: 'claude', model: 'x' }, fakeGlobal)).toBe('sk-ant-xxx');
        (0, vitest_1.expect)((0, config_1.resolveApiKey)({ provider: 'openai', model: 'x' }, fakeGlobal)).toBe('sk-openai-xxx');
        (0, vitest_1.expect)((0, config_1.resolveApiKey)({ provider: 'deepseek', model: 'x' }, fakeGlobal)).toBe('sk-deep-xxx');
        (0, vitest_1.expect)((0, config_1.resolveApiKey)({ provider: 'xai', model: 'x' }, fakeGlobal)).toBe('sk-xai-xxx');
    });
});
(0, vitest_1.describe)('resolveApiUrl', function () {
    var fakeGlobal = {
        ollamaHost: 'http://localhost:11434',
        customApiUrl: 'http://localhost:8080/v1',
    };
    (0, vitest_1.it)('role-özgü URL global URLi ezer', function () {
        var role = { provider: 'openai', model: 'x', apiUrl: 'https://custom.url/v1' };
        (0, vitest_1.expect)((0, config_1.resolveApiUrl)(role, fakeGlobal)).toBe('https://custom.url/v1');
    });
    (0, vitest_1.it)('custom provider için global CUSTOM_API_URL döndürür', function () {
        var role = { provider: 'custom', model: 'x' };
        (0, vitest_1.expect)((0, config_1.resolveApiUrl)(role, fakeGlobal)).toBe('http://localhost:8080/v1');
    });
    (0, vitest_1.it)('ollama için ollamaHost döndürür', function () {
        var role = { provider: 'ollama', model: 'x' };
        (0, vitest_1.expect)((0, config_1.resolveApiUrl)(role, fakeGlobal)).toBe('http://localhost:11434');
    });
    (0, vitest_1.it)('openai için varsayılan URL döndürür', function () {
        var role = { provider: 'openai', model: 'x' };
        (0, vitest_1.expect)((0, config_1.resolveApiUrl)(role, fakeGlobal)).toBe('https://api.openai.com/v1');
    });
});
