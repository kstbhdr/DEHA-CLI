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
exports.modelSetup = modelSetup;
var inquirer_1 = require("inquirer");
var chalk_1 = require("chalk");
var fs = require("fs");
var path = require("path");
var logger_1 = require("../services/logger");
var PROVIDERS = [
    { name: 'Claude  (Anthropic)', value: 'claude' },
    { name: 'OpenAI  (GPT)', value: 'openai' },
    { name: 'DeepSeek', value: 'deepseek' },
    { name: 'OpenRouter', value: 'openrouter' },
    { name: 'xAI  (Grok)', value: 'xai' },
    { name: 'Ollama  (Local)', value: 'ollama' },
    { name: 'Custom  API', value: 'custom' },
];
// ─── Mevcut config'den varsayılan model adını döner ──────────────────────────
function defaultModel(provider, config) {
    switch (provider) {
        case 'claude': return config.claudeModel;
        case 'openai': return config.openaiModel;
        case 'deepseek': return config.deepseekModel;
        case 'openrouter': return config.openrouterModel;
        case 'xai': return config.xaiModel;
        case 'ollama': return config.ollamaModel;
        case 'custom': return config.customModel;
    }
}
function defaultKey(provider, config) {
    var _a, _b, _c, _d, _e, _f;
    switch (provider) {
        case 'claude': return (_a = config.anthropicApiKey) !== null && _a !== void 0 ? _a : '';
        case 'openai': return (_b = config.openaiApiKey) !== null && _b !== void 0 ? _b : '';
        case 'deepseek': return (_c = config.deepseekApiKey) !== null && _c !== void 0 ? _c : '';
        case 'openrouter': return (_d = config.openrouterApiKey) !== null && _d !== void 0 ? _d : '';
        case 'xai': return (_e = config.xaiApiKey) !== null && _e !== void 0 ? _e : '';
        case 'custom': return (_f = config.customApiKey) !== null && _f !== void 0 ? _f : '';
        default: return '';
    }
}
function defaultVisionModel(provider, config) {
    switch (provider) {
        case 'claude': return config.claudeModel;
        case 'openai': return config.openaiModel;
        case 'openrouter': return normalizeVisionModel(config.visionModel || config.openrouterModel);
        case 'custom': return config.visionModel || config.customModel;
        default: return config.visionModel;
    }
}
function defaultVisionKey(provider, config) {
    var _a, _b, _c, _d;
    if (config.visionApiKey)
        return config.visionApiKey;
    switch (provider) {
        case 'claude': return (_a = config.anthropicApiKey) !== null && _a !== void 0 ? _a : '';
        case 'openai': return (_b = config.openaiApiKey) !== null && _b !== void 0 ? _b : '';
        case 'openrouter': return (_c = config.openrouterApiKey) !== null && _c !== void 0 ? _c : '';
        case 'custom': return (_d = config.customApiKey) !== null && _d !== void 0 ? _d : '';
        default: return '';
    }
}
// ─── Ana fonksiyon ────────────────────────────────────────────────────────────
function modelSetup(config) {
    return __awaiter(this, void 0, void 0, function () {
        var chat, planner, coder, judge, vision, pipeline, row;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('╔══════════════════════════════════════════╗'));
                    logger_1.logger.write(chalk_1.default.bold.cyan('║') + chalk_1.default.bold.white('   Model & Provider Ayarları') + ' '.repeat(16) + chalk_1.default.bold.cyan('║'));
                    logger_1.logger.write(chalk_1.default.bold.cyan('╚══════════════════════════════════════════╝') + '\n');
                    logger_1.logger.write(chalk_1.default.dim('  Boş bıraktığın alanlar mevcut değeri korur.\n'));
                    // ── 1. Ana chat modeli ─────────────────────────────────────────────────────
                    logger_1.logger.write(chalk_1.default.bold.yellow('  ── Chat (İnteraktif Mod) ─────────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'list',
                                name: 'provider',
                                message: 'Provider:',
                                choices: PROVIDERS,
                                default: config.provider,
                            },
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Model adı:',
                                default: function (ans) { return defaultModel(ans.provider, config); },
                            },
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'API Key (boş = mevcut):',
                                mask: '*',
                                default: '',
                            },
                            {
                                type: 'input',
                                name: 'apiUrl',
                                message: 'API URL (custom için):',
                                default: config.customApiUrl,
                                when: function (ans) { return ans.provider === 'custom' || ans.provider === 'ollama'; },
                            },
                        ])];
                case 1:
                    chat = _k.sent();
                    // ── 2. Planner ─────────────────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.blue('  ── Planner (Plan çıkarır) ─────────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'list',
                                name: 'provider',
                                message: 'Provider:',
                                choices: PROVIDERS,
                                default: config.pipeline.planner.provider,
                            },
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Model adı:',
                                default: function (ans) {
                                    return config.pipeline.planner.model || defaultModel(ans.provider, config);
                                },
                            },
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'API Key (boş = global key):',
                                mask: '*',
                                default: '',
                            },
                            {
                                type: 'input',
                                name: 'apiUrl',
                                message: 'Custom API URL:',
                                default: (_a = config.pipeline.planner.apiUrl) !== null && _a !== void 0 ? _a : '',
                                when: function (ans) { return ans.provider === 'custom' || ans.provider === 'ollama'; },
                            },
                            {
                                type: 'number',
                                name: 'maxTokens',
                                message: 'Max tokens:',
                                default: (_b = config.pipeline.planner.maxTokens) !== null && _b !== void 0 ? _b : 2048,
                            },
                            {
                                type: 'number',
                                name: 'temperature',
                                message: 'Temperature (0-1):',
                                default: (_c = config.pipeline.planner.temperature) !== null && _c !== void 0 ? _c : 0.3,
                            },
                        ])];
                case 2:
                    planner = _k.sent();
                    // ── 3. Coder (Draft) ───────────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.green('  ── Coder / Draft (Kodu yazar) ─────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'list',
                                name: 'provider',
                                message: 'Provider:',
                                choices: PROVIDERS,
                                default: config.pipeline.coder.provider,
                            },
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Model adı:',
                                default: function (ans) {
                                    return config.pipeline.coder.model || defaultModel(ans.provider, config);
                                },
                            },
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'API Key (boş = global key):',
                                mask: '*',
                                default: '',
                            },
                            {
                                type: 'input',
                                name: 'apiUrl',
                                message: 'Custom API URL:',
                                default: (_d = config.pipeline.coder.apiUrl) !== null && _d !== void 0 ? _d : '',
                                when: function (ans) { return ans.provider === 'custom' || ans.provider === 'ollama'; },
                            },
                            {
                                type: 'number',
                                name: 'maxTokens',
                                message: 'Max tokens:',
                                default: (_e = config.pipeline.coder.maxTokens) !== null && _e !== void 0 ? _e : 8192,
                            },
                            {
                                type: 'number',
                                name: 'temperature',
                                message: 'Temperature (0-1):',
                                default: (_f = config.pipeline.coder.temperature) !== null && _f !== void 0 ? _f : 0.2,
                            },
                        ])];
                case 3:
                    coder = _k.sent();
                    // ── 4. Judge ───────────────────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.red('  ── Judge (Kodu inceler) ────────────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'list',
                                name: 'provider',
                                message: 'Provider:',
                                choices: PROVIDERS,
                                default: config.pipeline.judge.provider,
                            },
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Model adı:',
                                default: function (ans) {
                                    return config.pipeline.judge.model || defaultModel(ans.provider, config);
                                },
                            },
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'API Key (boş = global key):',
                                mask: '*',
                                default: '',
                            },
                            {
                                type: 'input',
                                name: 'apiUrl',
                                message: 'Custom API URL:',
                                default: (_g = config.pipeline.judge.apiUrl) !== null && _g !== void 0 ? _g : '',
                                when: function (ans) { return ans.provider === 'custom' || ans.provider === 'ollama'; },
                            },
                            {
                                type: 'number',
                                name: 'maxTokens',
                                message: 'Max tokens:',
                                default: (_h = config.pipeline.judge.maxTokens) !== null && _h !== void 0 ? _h : 2048,
                            },
                            {
                                type: 'number',
                                name: 'temperature',
                                message: 'Temperature (0-1):',
                                default: (_j = config.pipeline.judge.temperature) !== null && _j !== void 0 ? _j : 0.1,
                            },
                        ])];
                case 4:
                    judge = _k.sent();
                    // ── 5. Vision ──────────────────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.magenta('  ── Vision (Görüntü analizi) ───────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'list',
                                name: 'provider',
                                message: 'Provider:',
                                choices: [
                                    { name: 'Claude  (Anthropic)', value: 'claude' },
                                    { name: 'OpenAI  (GPT-4o)', value: 'openai' },
                                    { name: 'OpenRouter', value: 'openrouter' },
                                    { name: 'Custom  API', value: 'custom' },
                                ],
                                default: config.visionProvider || 'openrouter',
                            },
                            {
                                type: 'input',
                                name: 'model',
                                message: 'Model adı:',
                                default: function (ans) {
                                    return defaultVisionModel(ans.provider, config);
                                },
                            },
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: 'API Key (boş = global key):',
                                mask: '*',
                                default: function (ans) { return defaultVisionKey(ans.provider, config); },
                            },
                            {
                                type: 'input',
                                name: 'apiUrl',
                                message: 'Custom API URL:',
                                default: config.visionApiUrl || config.customApiUrl,
                                when: function (ans) { return ans.provider === 'custom'; },
                            },
                        ])];
                case 5:
                    vision = _k.sent();
                    // ── Pipeline max iterations ────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.white('  ── Pipeline Ayarları ──────────────────────'));
                    return [4 /*yield*/, inquirer_1.default.prompt([
                            {
                                type: 'number',
                                name: 'maxIterations',
                                message: 'Max iterasyon (Judge FAIL → tekrar yaz):',
                                default: config.pipeline.maxIterations,
                            },
                        ])];
                case 6:
                    pipeline = _k.sent();
                    // ── Config'e uygula ────────────────────────────────────────────────────────
                    applyToConfig(config, {
                        chat: chat,
                        planner: planner,
                        coder: coder,
                        judge: judge,
                        vision: vision,
                        pipeline: pipeline,
                    });
                    persistConfig(config);
                    // ── Özet göster ────────────────────────────────────────────────────────────
                    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('  ✓ Ayarlar kaydedildi ve güncellendi:\n'));
                    row = function (label, color, p, m) {
                        return logger_1.logger.write("  ".concat(color(label.padEnd(10)), "  ").concat(chalk_1.default.dim('provider=')).concat(chalk_1.default.green(p), "  ").concat(chalk_1.default.dim('model=')).concat(chalk_1.default.yellow(m)));
                    };
                    row('Chat', chalk_1.default.bold.yellow, config.provider, getModelFromConfig(config, config.provider));
                    row('Planner', chalk_1.default.bold.blue, config.pipeline.planner.provider, config.pipeline.planner.model);
                    row('Coder', chalk_1.default.bold.green, config.pipeline.coder.provider, config.pipeline.coder.model);
                    row('Judge', chalk_1.default.bold.red, config.pipeline.judge.provider, config.pipeline.judge.model);
                    row('Vision', chalk_1.default.bold.magenta, vision.provider, vision.model);
                    logger_1.logger.write('');
                    return [2 /*return*/];
            }
        });
    });
}
// ─── Config'e yansıt ─────────────────────────────────────────────────────────
function applyToConfig(config, answers) {
    var chat = answers.chat, planner = answers.planner, coder = answers.coder, judge = answers.judge, vision = answers.vision, pipeline = answers.pipeline;
    // Chat
    config.provider = chat.provider;
    setModel(config, chat.provider, chat.model);
    if (chat.apiKey)
        setKey(config, chat.provider, chat.apiKey);
    if (chat.apiUrl)
        config.customApiUrl = chat.apiUrl;
    // Planner
    config.pipeline.planner.provider = planner.provider;
    config.pipeline.planner.model = planner.model;
    if (planner.apiKey)
        config.pipeline.planner.apiKey = planner.apiKey;
    if (planner.apiUrl)
        config.pipeline.planner.apiUrl = planner.apiUrl;
    if (planner.maxTokens)
        config.pipeline.planner.maxTokens = planner.maxTokens;
    if (planner.temperature !== undefined)
        config.pipeline.planner.temperature = planner.temperature;
    // Coder
    config.pipeline.coder.provider = coder.provider;
    config.pipeline.coder.model = coder.model;
    if (coder.apiKey)
        config.pipeline.coder.apiKey = coder.apiKey;
    if (coder.apiUrl)
        config.pipeline.coder.apiUrl = coder.apiUrl;
    if (coder.maxTokens)
        config.pipeline.coder.maxTokens = coder.maxTokens;
    if (coder.temperature !== undefined)
        config.pipeline.coder.temperature = coder.temperature;
    // Judge
    config.pipeline.judge.provider = judge.provider;
    config.pipeline.judge.model = judge.model;
    if (judge.apiKey)
        config.pipeline.judge.apiKey = judge.apiKey;
    if (judge.apiUrl)
        config.pipeline.judge.apiUrl = judge.apiUrl;
    if (judge.maxTokens)
        config.pipeline.judge.maxTokens = judge.maxTokens;
    if (judge.temperature !== undefined)
        config.pipeline.judge.temperature = judge.temperature;
    // Vision — config'deki vision alanlarına yaz
    config.visionProvider = vision.provider;
    config.visionModel = normalizeVisionModel(vision.model);
    if (vision.apiKey)
        config.visionApiKey = vision.apiKey;
    if (vision.apiUrl)
        config.visionApiUrl = vision.apiUrl;
    // Pipeline
    config.pipeline.maxIterations = Math.min(Math.max(Number(pipeline.maxIterations) || 5, 1), 5);
}
function setModel(config, provider, model) {
    if (!model)
        return;
    switch (provider) {
        case 'claude':
            config.claudeModel = model;
            break;
        case 'openai':
            config.openaiModel = model;
            break;
        case 'deepseek':
            config.deepseekModel = model;
            break;
        case 'openrouter':
            config.openrouterModel = model;
            break;
        case 'xai':
            config.xaiModel = model;
            break;
        case 'ollama':
            config.ollamaModel = model;
            break;
        case 'custom':
            config.customModel = model;
            break;
    }
}
function setKey(config, provider, key) {
    switch (provider) {
        case 'claude':
            config.anthropicApiKey = key;
            break;
        case 'openai':
            config.openaiApiKey = key;
            break;
        case 'deepseek':
            config.deepseekApiKey = key;
            break;
        case 'openrouter':
            config.openrouterApiKey = key;
            break;
        case 'xai':
            config.xaiApiKey = key;
            break;
        case 'custom':
            config.customApiKey = key;
            break;
    }
}
function getModelFromConfig(config, provider) {
    switch (provider) {
        case 'claude': return config.claudeModel;
        case 'openai': return config.openaiModel;
        case 'deepseek': return config.deepseekModel;
        case 'openrouter': return config.openrouterModel;
        case 'xai': return config.xaiModel;
        case 'ollama': return config.ollamaModel;
        case 'custom': return config.customModel;
    }
}
function persistConfig(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    var envPath = path.resolve(__dirname, '../../.env');
    var existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    var updates = {
        DEHA_PROVIDER: config.provider,
        CLAUDE_MODEL: config.claudeModel,
        OPENAI_MODEL: config.openaiModel,
        DEEPSEEK_MODEL: config.deepseekModel,
        OPENROUTER_MODEL: config.openrouterModel,
        XAI_MODEL: config.xaiModel,
        CUSTOM_MODEL: config.customModel,
        CUSTOM_API_URL: config.customApiUrl,
        OLLAMA_HOST: config.ollamaHost,
        OLLAMA_MODEL: config.ollamaModel,
        ANTHROPIC_API_KEY: (_a = config.anthropicApiKey) !== null && _a !== void 0 ? _a : '',
        OPENAI_API_KEY: (_b = config.openaiApiKey) !== null && _b !== void 0 ? _b : '',
        DEEPSEEK_API_KEY: (_c = config.deepseekApiKey) !== null && _c !== void 0 ? _c : '',
        OPENROUTER_API_KEY: (_d = config.openrouterApiKey) !== null && _d !== void 0 ? _d : '',
        XAI_API_KEY: (_e = config.xaiApiKey) !== null && _e !== void 0 ? _e : '',
        CUSTOM_API_KEY: (_f = config.customApiKey) !== null && _f !== void 0 ? _f : '',
        PLANNER_PROVIDER: config.pipeline.planner.provider,
        PLANNER_MODEL: config.pipeline.planner.model,
        PLANNER_API_KEY: (_g = config.pipeline.planner.apiKey) !== null && _g !== void 0 ? _g : '',
        PLANNER_API_URL: (_h = config.pipeline.planner.apiUrl) !== null && _h !== void 0 ? _h : '',
        PLANNER_MAX_TOKENS: String((_j = config.pipeline.planner.maxTokens) !== null && _j !== void 0 ? _j : ''),
        PLANNER_TEMPERATURE: String((_k = config.pipeline.planner.temperature) !== null && _k !== void 0 ? _k : ''),
        CODER_PROVIDER: config.pipeline.coder.provider,
        CODER_MODEL: config.pipeline.coder.model,
        CODER_API_KEY: (_l = config.pipeline.coder.apiKey) !== null && _l !== void 0 ? _l : '',
        CODER_API_URL: (_m = config.pipeline.coder.apiUrl) !== null && _m !== void 0 ? _m : '',
        CODER_MAX_TOKENS: String((_o = config.pipeline.coder.maxTokens) !== null && _o !== void 0 ? _o : ''),
        CODER_TEMPERATURE: String((_p = config.pipeline.coder.temperature) !== null && _p !== void 0 ? _p : ''),
        JUDGE_PROVIDER: config.pipeline.judge.provider,
        JUDGE_MODEL: config.pipeline.judge.model,
        JUDGE_API_KEY: (_q = config.pipeline.judge.apiKey) !== null && _q !== void 0 ? _q : '',
        JUDGE_API_URL: (_r = config.pipeline.judge.apiUrl) !== null && _r !== void 0 ? _r : '',
        JUDGE_MAX_TOKENS: String((_s = config.pipeline.judge.maxTokens) !== null && _s !== void 0 ? _s : ''),
        JUDGE_TEMPERATURE: String((_t = config.pipeline.judge.temperature) !== null && _t !== void 0 ? _t : ''),
        VISION_PROVIDER: config.visionProvider,
        VISION_MODEL: config.visionModel,
        VISION_API_KEY: (_u = config.visionApiKey) !== null && _u !== void 0 ? _u : '',
        VISION_API_URL: (_v = config.visionApiUrl) !== null && _v !== void 0 ? _v : '',
        PIPELINE_MAX_ITERATIONS: String(config.pipeline.maxIterations),
        DEHA_MAX_TOOL_ROUNDS: String(config.maxToolRounds),
    };
    var content = existing;
    for (var _i = 0, _w = Object.entries(updates); _i < _w.length; _i++) {
        var _x = _w[_i], key = _x[0], value = _x[1];
        var escaped = value.replace(/\r?\n/g, ' ');
        var line = "".concat(key, "=").concat(escaped);
        var pattern = new RegExp("^".concat(escapeRegex(key), "=.*$"), 'm');
        if (pattern.test(content)) {
            content = content.replace(pattern, line);
        }
        else {
            content += "".concat(content.endsWith('\n') || content.length === 0 ? '' : '\n').concat(line, "\n");
        }
    }
    fs.writeFileSync(envPath, content, 'utf-8');
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeVisionModel(model) {
    return model === 'qwen/qwen3-32b' ? 'qwen/qwen3-vl-32b-instruct' : model;
}
