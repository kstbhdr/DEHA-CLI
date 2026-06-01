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
exports.analyzeImage = analyzeImage;
exports.screenshotAndAnalyze = screenshotAndAnalyze;
exports.analyzeExistingImage = analyzeExistingImage;
exports.toolVisionAnalyze = toolVisionAnalyze;
var fs = require("fs");
var path = require("path");
var sdk_1 = require("@anthropic-ai/sdk");
var axios_1 = require("axios");
var browser_1 = require("./browser");
var prompts_config_1 = require("../prompts.config");
var usage_tracker_1 = require("../services/usage-tracker");
// ─── Ana fonksiyon: görüntü analizi ─────────────────────────────────────────
function analyzeImage(imagePath_1, config_1) {
    return __awaiter(this, arguments, void 0, function (imagePath, config, opts) {
        var imageData, base64, mimeType, prompt, provider;
        var _a, _b;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_c) {
            if (!fs.existsSync(imagePath))
                throw new Error("G\u00F6r\u00FCnt\u00FC bulunamad\u0131: ".concat(imagePath));
            imageData = fs.readFileSync(imagePath);
            base64 = imageData.toString('base64');
            mimeType = getMimeType(imagePath);
            prompt = (_a = opts.prompt) !== null && _a !== void 0 ? _a : prompts_config_1.VISION_PROMPT;
            provider = (_b = opts.provider) !== null && _b !== void 0 ? _b : (config.visionProvider || 'openrouter');
            if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
                return [2 /*return*/, analyzeWithOpenAICompat(base64, mimeType, prompt, config, __assign(__assign({}, opts), { provider: provider }))];
            }
            return [2 /*return*/, analyzeWithClaude(base64, mimeType, prompt, config, opts)];
        });
    });
}
// ─── URL'den screenshot al, analiz et ───────────────────────────────────────
function screenshotAndAnalyze(url_1, config_1) {
    return __awaiter(this, arguments, void 0, function (url, config, opts) {
        var screenshotPath, analysis;
        var _a, _b;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, browser_1.takeScreenshot)(url, {
                        fullPage: opts.fullPage,
                        waitMs: (_a = opts.waitMs) !== null && _a !== void 0 ? _a : 1000,
                    })];
                case 1:
                    screenshotPath = _c.sent();
                    return [4 /*yield*/, analyzeImage(screenshotPath, config, __assign(__assign({}, opts), { prompt: (_b = opts.prompt) !== null && _b !== void 0 ? _b : "Bu URL'nin ekran g\u00F6r\u00FCnt\u00FCs\u00FCn\u00FC analiz et: ".concat(url, "\n\nUI sorunlar\u0131, performans ipu\u00E7lar\u0131, eri\u015Filebilirlik sorunlar\u0131 ve iyile\u015Ftirme \u00F6nerileri ver.") }))];
                case 2:
                    analysis = _c.sent();
                    return [2 /*return*/, { screenshotPath: screenshotPath, analysis: analysis }];
            }
        });
    });
}
// ─── Mevcut görüntü dosyasını analiz et ─────────────────────────────────────
function analyzeExistingImage(imagePath, config, prompt) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, analyzeImage(imagePath, config, { prompt: prompt })];
        });
    });
}
// ─── Claude vision ───────────────────────────────────────────────────────────
function analyzeWithClaude(base64, mimeType, prompt, config, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, clientOpts, client, model, response, usage, block;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    apiKey = (_a = opts.apiKey) !== null && _a !== void 0 ? _a : config.anthropicApiKey;
                    if (!apiKey)
                        throw new Error('ANTHROPIC_API_KEY missing');
                    clientOpts = { apiKey: apiKey };
                    if (opts.apiUrl)
                        clientOpts.baseURL = opts.apiUrl;
                    client = new sdk_1.default(clientOpts);
                    model = (_b = opts.model) !== null && _b !== void 0 ? _b : config.claudeModel;
                    return [4 /*yield*/, client.messages.create({
                            model: model,
                            max_tokens: 2048,
                            messages: [
                                {
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'image',
                                            source: {
                                                type: 'base64',
                                                media_type: mimeType,
                                                data: base64,
                                            },
                                        },
                                        { type: 'text', text: prompt },
                                    ],
                                },
                            ],
                        })];
                case 1:
                    response = _e.sent();
                    usage = response.usage;
                    if (usage) {
                        (0, usage_tracker_1.recordUsage)('anthropic', model, 'vision', (_c = usage.input_tokens) !== null && _c !== void 0 ? _c : 0, (_d = usage.output_tokens) !== null && _d !== void 0 ? _d : 0, config);
                    }
                    block = response.content[0];
                    if (block.type !== 'text')
                        throw new Error('Beklenmeyen yanıt');
                    return [2 /*return*/, block.text];
            }
        });
    });
}
// ─── OpenAI vision ───────────────────────────────────────────────────────────
function analyzeWithOpenAICompat(base64, mimeType, prompt, config, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, apiKey, model, detail, baseUrl, response, usage;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    provider = (_a = opts.provider) !== null && _a !== void 0 ? _a : 'openai';
                    apiKey = (_e = (_d = (_c = (_b = opts.apiKey) !== null && _b !== void 0 ? _b : config.visionApiKey) !== null && _c !== void 0 ? _c : (provider === 'openrouter' ? config.openrouterApiKey : undefined)) !== null && _d !== void 0 ? _d : (provider === 'custom' ? config.customApiKey : undefined)) !== null && _e !== void 0 ? _e : config.openaiApiKey;
                    if (!apiKey)
                        throw new Error("".concat(provider.toUpperCase(), " API key missing (or pass apiKey in options)"));
                    model = (_g = (_f = opts.model) !== null && _f !== void 0 ? _f : config.visionModel) !== null && _g !== void 0 ? _g : 'gpt-4o';
                    detail = (_h = opts.detail) !== null && _h !== void 0 ? _h : 'auto';
                    baseUrl = (_m = (_l = (_k = (_j = opts.apiUrl) !== null && _j !== void 0 ? _j : config.visionApiUrl) !== null && _k !== void 0 ? _k : (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined)) !== null && _l !== void 0 ? _l : (provider === 'custom' ? config.customApiUrl : undefined)) !== null && _m !== void 0 ? _m : 'https://api.openai.com/v1';
                    return [4 /*yield*/, axios_1.default.post("".concat(baseUrl.replace(/\/$/, ''), "/chat/completions"), {
                            model: model,
                            max_tokens: 2048,
                            messages: [
                                {
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'image_url',
                                            image_url: { url: "data:".concat(mimeType, ";base64,").concat(base64), detail: detail },
                                        },
                                        { type: 'text', text: prompt },
                                    ],
                                },
                            ],
                        }, {
                            headers: __assign({ Authorization: "Bearer ".concat(apiKey) }, (provider === 'openrouter' ? {
                                'HTTP-Referer': 'https://github.com/kstbhdr/DEHA-CLI',
                                'X-Title': 'DEHA CLI',
                            } : {})),
                        })];
                case 1:
                    response = _q.sent();
                    usage = response.data.usage;
                    if (usage) {
                        (0, usage_tracker_1.recordUsage)(provider, model, 'vision', (_o = usage.prompt_tokens) !== null && _o !== void 0 ? _o : 0, (_p = usage.completion_tokens) !== null && _p !== void 0 ? _p : 0, config);
                    }
                    return [2 /*return*/, response.data.choices[0].message.content];
            }
        });
    });
}
// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function getMimeType(filePath) {
    var _a;
    var ext = path.extname(filePath).toLowerCase();
    var types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    };
    return (_a = types[ext]) !== null && _a !== void 0 ? _a : 'image/png';
}
// ─── Tool versiyonu ─────────────────────────────────────────────────────────
function toolVisionAnalyze(input, config) {
    return __awaiter(this, void 0, void 0, function () {
        var opts, _a, screenshotPath, analysis;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    opts = {
                        prompt: input.prompt,
                        provider: input.provider,
                        model: input.model,
                        apiKey: input.api_key,
                        apiUrl: input.api_url,
                    };
                    if (!input.url) return [3 /*break*/, 2];
                    return [4 /*yield*/, screenshotAndAnalyze(input.url, config, __assign(__assign({}, opts), { fullPage: input.full_page }))];
                case 1:
                    _a = _b.sent(), screenshotPath = _a.screenshotPath, analysis = _a.analysis;
                    return [2 /*return*/, "Screenshot: ".concat(screenshotPath, "\n\n").concat(analysis)];
                case 2:
                    if (input.image_path) {
                        return [2 /*return*/, analyzeImage(input.image_path, config, opts)];
                    }
                    return [2 /*return*/, 'url or image_path is required'];
            }
        });
    });
}
