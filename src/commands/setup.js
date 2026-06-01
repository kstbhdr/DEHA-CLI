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
exports.setup = setup;
var chalk_1 = require("chalk");
var axios_1 = require("axios");
var config_1 = require("../config");
var logger_1 = require("../services/logger");
function setup(config) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, ok;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ DEHA Kurulum & Bağlantı Testi ═══') + '\n');
                    provider = config.provider;
                    logger_1.logger.write(chalk_1.default.dim('Aktif Provider: ') + chalk_1.default.green((0, config_1.getProviderLabel)(provider)));
                    if (provider === 'custom') {
                        logger_1.logger.write(chalk_1.default.dim('Endpoint: ') + chalk_1.default.yellow(config.customApiUrl));
                        logger_1.logger.write(chalk_1.default.dim('Model: ') + chalk_1.default.yellow(config.customModel));
                    }
                    return [4 /*yield*/, testProvider(provider, config)];
                case 1:
                    ok = _a.sent();
                    if (ok) {
                        logger_1.logger.write('\n' + chalk_1.default.green('✓ Bağlantı başarılı! DEHA kullanıma hazır.'));
                        logger_1.logger.write(chalk_1.default.dim('  deha') + chalk_1.default.white(' komutuyla interaktif moda geçebilirsin.\n'));
                    }
                    else {
                        logger_1.logger.write('\n' + chalk_1.default.red('✗ Bağlantı kurulamadı.'));
                        printFixHints(provider, config);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function testProvider(provider, config) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, Anthropic, client, baseUrl, headers, _b, err_1, message;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    process.stdout.write(chalk_1.default.dim('Bağlantı test ediliyor... '));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 22, , 23]);
                    _a = provider;
                    switch (_a) {
                        case 'claude': return [3 /*break*/, 2];
                        case 'openai': return [3 /*break*/, 5];
                        case 'deepseek': return [3 /*break*/, 7];
                        case 'openrouter': return [3 /*break*/, 9];
                        case 'xai': return [3 /*break*/, 11];
                        case 'ollama': return [3 /*break*/, 13];
                        case 'custom': return [3 /*break*/, 15];
                    }
                    return [3 /*break*/, 21];
                case 2:
                    if (!config.anthropicApiKey)
                        throw new Error('ANTHROPIC_API_KEY eksik');
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@anthropic-ai/sdk'); })];
                case 3:
                    Anthropic = (_c.sent()).default;
                    client = new Anthropic({ apiKey: config.anthropicApiKey });
                    return [4 /*yield*/, client.messages.create({
                            model: config.claudeModel,
                            max_tokens: 10,
                            messages: [{ role: 'user', content: 'Hi' }],
                        })];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 5:
                    if (!config.openaiApiKey)
                        throw new Error('OPENAI_API_KEY eksik');
                    return [4 /*yield*/, testOpenAICompat('https://api.openai.com/v1', config.openaiApiKey, config.openaiModel)];
                case 6:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 7:
                    if (!config.deepseekApiKey)
                        throw new Error('DEEPSEEK_API_KEY eksik');
                    return [4 /*yield*/, testOpenAICompat('https://api.deepseek.com', config.deepseekApiKey, config.deepseekModel)];
                case 8:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 9:
                    if (!config.openrouterApiKey)
                        throw new Error('OPENROUTER_API_KEY eksik');
                    return [4 /*yield*/, testOpenAICompat('https://openrouter.ai/api/v1', config.openrouterApiKey, config.openrouterModel)];
                case 10:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 11:
                    if (!config.xaiApiKey)
                        throw new Error('XAI_API_KEY eksik');
                    return [4 /*yield*/, testOpenAICompat('https://api.x.ai/v1', config.xaiApiKey, config.xaiModel)];
                case 12:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 13: return [4 /*yield*/, axios_1.default.get("".concat(config.ollamaHost, "/api/tags"), { timeout: 5000 })];
                case 14:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 15:
                    baseUrl = config.customApiUrl.replace(/\/$/, '');
                    headers = { 'Content-Type': 'application/json' };
                    if (config.customApiKey)
                        headers['Authorization'] = "Bearer ".concat(config.customApiKey);
                    _c.label = 16;
                case 16:
                    _c.trys.push([16, 18, , 20]);
                    return [4 /*yield*/, axios_1.default.get("".concat(baseUrl, "/models"), { headers: headers, timeout: 5000 })];
                case 17:
                    _c.sent();
                    return [3 /*break*/, 20];
                case 18:
                    _b = _c.sent();
                    // /models yoksa doğrudan chat dene
                    return [4 /*yield*/, testOpenAICompat(baseUrl, config.customApiKey, config.customModel)];
                case 19:
                    // /models yoksa doğrudan chat dene
                    _c.sent();
                    return [3 /*break*/, 20];
                case 20: return [3 /*break*/, 21];
                case 21:
                    logger_1.logger.write(chalk_1.default.green('✓'));
                    return [2 /*return*/, true];
                case 22:
                    err_1 = _c.sent();
                    message = err_1 instanceof Error ? err_1.message : String(err_1);
                    logger_1.logger.write(chalk_1.default.red('✗'));
                    logger_1.logger.write(chalk_1.default.red('  Hata: ') + message);
                    return [2 /*return*/, false];
                case 23: return [2 /*return*/];
            }
        });
    });
}
function testOpenAICompat(baseUrl, apiKey, model) {
    return __awaiter(this, void 0, void 0, function () {
        var headers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    headers = { 'Content-Type': 'application/json' };
                    if (apiKey)
                        headers['Authorization'] = "Bearer ".concat(apiKey);
                    return [4 /*yield*/, axios_1.default.post("".concat(baseUrl, "/chat/completions"), { model: model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }, { headers: headers, timeout: 10000 })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function printFixHints(provider, config) {
    logger_1.logger.write('\n' + chalk_1.default.bold('Çözüm önerileri:'));
    switch (provider) {
        case 'claude':
            logger_1.logger.write(chalk_1.default.dim('  1. .env → ANTHROPIC_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  2. https://console.anthropic.com'));
            break;
        case 'openai':
            logger_1.logger.write(chalk_1.default.dim('  1. .env → OPENAI_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  2. https://platform.openai.com'));
            break;
        case 'deepseek':
            logger_1.logger.write(chalk_1.default.dim('  1. .env → DEEPSEEK_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  2. https://platform.deepseek.com'));
            break;
        case 'openrouter':
            logger_1.logger.write(chalk_1.default.dim('  1. .env → OPENROUTER_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  2. https://openrouter.ai/keys'));
            break;
        case 'xai':
            logger_1.logger.write(chalk_1.default.dim('  1. .env → XAI_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  2. https://console.x.ai'));
            break;
        case 'ollama':
            logger_1.logger.write(chalk_1.default.dim('  1. Ollama kurulu mu? → https://ollama.ai'));
            logger_1.logger.write(chalk_1.default.dim('  2. Servis çalışıyor mu? → ollama serve'));
            logger_1.logger.write(chalk_1.default.dim('  3. Model var mı? → ollama pull llama3'));
            break;
        case 'custom':
            logger_1.logger.write(chalk_1.default.dim("  1. Endpoint eri\u015Filebilir mi? \u2192 ".concat(config.customApiUrl)));
            logger_1.logger.write(chalk_1.default.dim('  2. .env → CUSTOM_API_URL, CUSTOM_MODEL, CUSTOM_API_KEY'));
            logger_1.logger.write(chalk_1.default.dim('  3. Servisin OpenAI-uyumlu /chat/completions endpoint\'i var mı?'));
            logger_1.logger.write(chalk_1.default.dim('     (LM Studio, vLLM, LocalAI, llama.cpp server, Kobold vb.)'));
            break;
    }
    logger_1.logger.write('');
}
