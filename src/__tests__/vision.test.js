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
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
}); });
vitest_1.vi.mock('axios');
vitest_1.vi.mock('../tools/browser', function () { return ({
    takeScreenshot: vitest_1.vi.fn().mockResolvedValue('/tmp/screenshot.png'),
}); });
vitest_1.vi.mock('../services/usage-tracker', function () { return ({
    recordUsage: vitest_1.vi.fn(),
}); });
vitest_1.vi.mock('../prompts.config', function () { return ({
    VISION_PROMPT: 'Analyze this image.',
}); });
// Anthropic SDK mock — class constructor
var mockMessagesCreate = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(); });
vitest_1.vi.mock('@anthropic-ai/sdk', function () { return ({
    default: /** @class */ (function () {
        function MockAnthropic(opts) {
            this.messages = { create: mockMessagesCreate };
        }
        return MockAnthropic;
    }()),
}); });
var axios_1 = require("axios");
var fs = require("fs");
var vision_1 = require("../tools/vision");
var mockConfig = {
    provider: 'claude',
    anthropicApiKey: 'sk-ant-test',
    openaiApiKey: 'sk-openai-test',
    openrouterApiKey: 'sk-or-test',
    deepseekThinking: 'disabled',
    deepseekReasoningEffort: 'high',
    claudeModel: 'claude-opus-4-6',
    openaiModel: 'gpt-4o',
    deepseekModel: 'deepseek-chat',
    deepseekApiKey: '',
    openrouterModel: '',
    xaiApiKey: '',
    xaiModel: '',
    customApiKey: '',
    customModel: '',
    customApiUrl: '',
    ollamaHost: '',
    ollamaModel: '',
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
(0, vitest_1.describe)('analyzeImage', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('Claude ile analiz yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'This image shows a UI with a button.' }],
                        usage: { input_tokens: 100, output_tokens: 50 },
                    });
                    return [4 /*yield*/, (0, vision_1.analyzeImage)('/tmp/test.png', mockConfig, { provider: 'claude' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('UI');
                    (0, vitest_1.expect)(mockMessagesCreate).toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('OpenAI ile analiz yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
                    vitest_1.vi.mocked(axios_1.default.post).mockResolvedValue({
                        data: {
                            choices: [{ message: { content: 'The image contains a form.' } }],
                            usage: { prompt_tokens: 80, completion_tokens: 40 },
                        },
                    });
                    return [4 /*yield*/, (0, vision_1.analyzeImage)('/tmp/test.png', __assign(__assign({}, mockConfig), { provider: 'openai' }), { provider: 'openai' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('form');
                    (0, vitest_1.expect)(axios_1.default.post).toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('vision config ile OpenRouter kullanir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
                    vitest_1.vi.mocked(axios_1.default.post).mockResolvedValue({
                        data: {
                            choices: [{ message: { content: 'The image contains a dashboard.' } }],
                            usage: { prompt_tokens: 80, completion_tokens: 40 },
                        },
                    });
                    return [4 /*yield*/, (0, vision_1.analyzeImage)('/tmp/test.png', mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('dashboard');
                    (0, vitest_1.expect)(axios_1.default.post).toHaveBeenCalledWith(vitest_1.expect.stringContaining('https://openrouter.ai/api/v1/chat/completions'), vitest_1.expect.objectContaining({
                        model: 'qwen/qwen3-vl-32b-instruct',
                    }), vitest_1.expect.objectContaining({
                        headers: vitest_1.expect.objectContaining({
                            'X-Title': 'DEHA CLI',
                        }),
                    }));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('dosya yoksa hata firlatir', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
                    return [4 /*yield*/, (0, vitest_1.expect)((0, vision_1.analyzeImage)('/tmp/yok.png', mockConfig)).rejects.toThrow('bulunamadı')];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('MIME tipini dogru algilar', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'ok' }],
                    });
                    return [4 /*yield*/, (0, vision_1.analyzeImage)('/tmp/test.jpg', mockConfig, { provider: 'claude' })];
                case 1:
                    _a.sent();
                    // Anthropic messages.create cagrisinda media_type kontrol edilebilir
                    (0, vitest_1.expect)(mockMessagesCreate).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        messages: vitest_1.expect.arrayContaining([
                            vitest_1.expect.objectContaining({
                                content: vitest_1.expect.arrayContaining([
                                    vitest_1.expect.objectContaining({
                                        source: vitest_1.expect.objectContaining({
                                            media_type: 'image/jpeg',
                                        }),
                                    }),
                                ]),
                            }),
                        ]),
                    }));
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('screenshotAndAnalyze', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('screenshot alir ve analiz eder', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'Analysis result' }],
                    });
                    return [4 /*yield*/, (0, vision_1.screenshotAndAnalyze)('https://example.com', mockConfig, { provider: 'claude' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.screenshotPath).toBe('/tmp/screenshot.png');
                    (0, vitest_1.expect)(result.analysis).toContain('Analysis result');
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('analyzeExistingImage', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('mevcut dosyayi analiz eder', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'Analysis' }],
                    });
                    return [4 /*yield*/, (0, vision_1.analyzeImage)('/tmp/test.png', mockConfig, { provider: 'claude', prompt: 'What is this?' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('Analysis');
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('toolVisionAnalyze', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('URL ile cagrilirsa screenshot+analiz yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'Analysis' }],
                    });
                    return [4 /*yield*/, (0, vision_1.toolVisionAnalyze)({ url: 'https://example.com', provider: 'claude' }, mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('Screenshot');
                    (0, vitest_1.expect)(result).toContain('Analysis');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('image_path ile cagrilirsa direkt analiz yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
                    mockMessagesCreate.mockResolvedValue({
                        content: [{ type: 'text', text: 'Direct analysis' }],
                    });
                    return [4 /*yield*/, (0, vision_1.toolVisionAnalyze)({ image_path: '/tmp/test.png', provider: 'claude' }, mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('Direct analysis');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hicbiri yoksa uyari mesaji doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, vision_1.toolVisionAnalyze)({}, mockConfig)];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('required');
                    return [2 /*return*/];
            }
        });
    }); });
});
