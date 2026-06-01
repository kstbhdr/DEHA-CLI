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
exports.initCommand = initCommand;
var promises_1 = require("fs/promises");
var fs_1 = require("fs");
var path_1 = require("path");
var readline_1 = require("readline");
var child_process_1 = require("child_process");
var logger_1 = require("../services/logger");
var RESET = '\x1b[0m';
var GREEN = '\x1b[32m';
var YELLOW = '\x1b[33m';
var CYAN = '\x1b[36m';
var BOLD = '\x1b[1m';
function rlQuestion(query) {
    var rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    return new Promise(function (resolve) {
        rl.question(query, function (answer) {
            rl.close();
            resolve(answer.trim());
        });
    });
}
function initCommand() {
    return __awaiter(this, void 0, void 0, function () {
        var cwd, envPath, envExamplePath, packageEnvPath, answer, _a, envContent, _b, keys, _i, keys_1, key, existing, currentVal, masked, answer, mcpPath, _c, answer, defaultMcp, answer, _d, dehaDir, mkdir;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    cwd = process.cwd();
                    logger_1.logger.write("\n".concat(BOLD).concat(CYAN, "\u26A1 DEHA Project Initialization").concat(RESET, "\n"));
                    envPath = (0, path_1.resolve)(cwd, '.env');
                    envExamplePath = (0, path_1.resolve)(cwd, '.env.example');
                    packageEnvPath = (0, path_1.resolve)(__dirname, '../../.env.example');
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 7, , 9]);
                    return [4 /*yield*/, (0, promises_1.access)(envPath, fs_1.constants.R_OK)];
                case 2:
                    _e.sent();
                    return [4 /*yield*/, rlQuestion("  ".concat(YELLOW, "\u26A0").concat(RESET, " .env already exists. Overwrite? (y/N) "))];
                case 3:
                    answer = _e.sent();
                    if (!(answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes')) return [3 /*break*/, 4];
                    logger_1.logger.write("  ".concat(YELLOW, "\u2192").concat(RESET, " Skipped .env"));
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, copyDotenv(envPath, envExamplePath, packageEnvPath)];
                case 5:
                    _e.sent();
                    _e.label = 6;
                case 6: return [3 /*break*/, 9];
                case 7:
                    _a = _e.sent();
                    return [4 /*yield*/, copyDotenv(envPath, envExamplePath, packageEnvPath)];
                case 8:
                    _e.sent();
                    return [3 /*break*/, 9];
                case 9:
                    // 2. API key'leri interactive sor
                    logger_1.logger.write("\n".concat(BOLD, "API Keys").concat(RESET, " (leave blank to skip)"));
                    envContent = '';
                    _e.label = 10;
                case 10:
                    _e.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, (0, promises_1.readFile)(envPath, 'utf-8')];
                case 11:
                    envContent = _e.sent();
                    return [3 /*break*/, 13];
                case 12:
                    _b = _e.sent();
                    envContent = '';
                    return [3 /*break*/, 13];
                case 13:
                    keys = [
                        { var: 'OPENAI_API_KEY', label: 'OpenAI API Key', prefix: 'sk-' },
                        { var: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', prefix: 'sk-ant-' },
                        { var: 'GROQ_API_KEY', label: 'Groq API Key', prefix: 'gsk_' },
                        { var: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', prefix: 'sk-' },
                        { var: 'XAI_API_KEY', label: 'xAI API Key', prefix: 'xai-' },
                        { var: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', prefix: 'sk-or-' },
                    ];
                    _i = 0, keys_1 = keys;
                    _e.label = 14;
                case 14:
                    if (!(_i < keys_1.length)) return [3 /*break*/, 17];
                    key = keys_1[_i];
                    existing = envContent.match(new RegExp("^".concat(key.var, "=(.+)$"), 'm'));
                    currentVal = existing ? existing[1] : '';
                    masked = currentVal ? currentVal.slice(0, 8) + '…' : '(not set)';
                    return [4 /*yield*/, rlQuestion("  ".concat(key.label, " [").concat(masked, "]: "))];
                case 15:
                    answer = _e.sent();
                    if (answer) {
                        // Replace or add
                        if (envContent.includes("".concat(key.var, "="))) {
                            envContent = envContent.replace(new RegExp("^".concat(key.var, "=.*$"), 'm'), "".concat(key.var, "=").concat(answer));
                        }
                        else {
                            envContent += "\n".concat(key.var, "=").concat(answer);
                        }
                    }
                    _e.label = 16;
                case 16:
                    _i++;
                    return [3 /*break*/, 14];
                case 17: return [4 /*yield*/, (0, promises_1.writeFile)(envPath, envContent.trim() + '\n', 'utf-8')];
                case 18:
                    _e.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " .env updated\n"));
                    mcpPath = (0, path_1.resolve)(cwd, 'mcp.json');
                    _e.label = 19;
                case 19:
                    _e.trys.push([19, 21, , 25]);
                    return [4 /*yield*/, (0, promises_1.access)(mcpPath, fs_1.constants.R_OK)];
                case 20:
                    _e.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " mcp.json already exists"));
                    return [3 /*break*/, 25];
                case 21:
                    _c = _e.sent();
                    return [4 /*yield*/, rlQuestion("  Create default mcp.json? (Y/n) ")];
                case 22:
                    answer = _e.sent();
                    if (!(answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no')) return [3 /*break*/, 24];
                    defaultMcp = {
                        mcpServers: {
                            fetch: { command: 'uvx', args: ['mcp-server-fetch'] },
                            playwright: { command: 'npx', args: ['@anthropic-ai/mcp-server-playwright'] },
                        },
                    };
                    return [4 /*yield*/, (0, promises_1.writeFile)(mcpPath, JSON.stringify(defaultMcp, null, 2) + '\n', 'utf-8')];
                case 23:
                    _e.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " mcp.json created"));
                    _e.label = 24;
                case 24: return [3 /*break*/, 25];
                case 25:
                    // 4. Playwright kontrolü
                    logger_1.logger.write("\n".concat(BOLD, "Dependencies").concat(RESET));
                    _e.label = 26;
                case 26:
                    _e.trys.push([26, 28, , 29]);
                    (0, child_process_1.execSync)('npx playwright --version', { stdio: 'pipe', timeout: 10000 });
                    return [4 /*yield*/, rlQuestion("  Install Playwright Chromium browser? (Y/n) ")];
                case 27:
                    answer = _e.sent();
                    if (answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no') {
                        logger_1.logger.write("  ".concat(YELLOW, "\u2192").concat(RESET, " Installing Chromium..."));
                        (0, child_process_1.execSync)('npx playwright install chromium', { stdio: 'inherit', timeout: 120000 });
                        logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " Chromium installed"));
                    }
                    return [3 /*break*/, 29];
                case 28:
                    _d = _e.sent();
                    logger_1.logger.write("  ".concat(YELLOW, "\u26A0").concat(RESET, " Playwright not found. Run: npm install playwright"));
                    return [3 /*break*/, 29];
                case 29:
                    dehaDir = (0, path_1.resolve)(cwd, '.deha');
                    if (!!(0, fs_1.existsSync)(dehaDir)) return [3 /*break*/, 33];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('fs/promises'); })];
                case 30:
                    mkdir = (_e.sent()).mkdir;
                    return [4 /*yield*/, mkdir(dehaDir, { recursive: true })];
                case 31:
                    _e.sent();
                    return [4 /*yield*/, (0, promises_1.writeFile)((0, path_1.join)(dehaDir, '.gitkeep'), '', 'utf-8')];
                case 32:
                    _e.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " .deha/ directory created"));
                    _e.label = 33;
                case 33:
                    logger_1.logger.write("\n".concat(GREEN).concat(BOLD, "\u2705 DEHA initialization complete!").concat(RESET));
                    logger_1.logger.write("  ".concat(YELLOW, "\u2192").concat(RESET, " Run ").concat(BOLD, "deha doctor").concat(RESET, " to verify setup\n"));
                    return [2 /*return*/];
            }
        });
    });
}
function copyDotenv(envPath, envExamplePath, packageEnvPath) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, minimal;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 10]);
                    return [4 /*yield*/, (0, promises_1.access)(envExamplePath, fs_1.constants.R_OK)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, promises_1.copyFile)(envExamplePath, envPath)];
                case 2:
                    _c.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " .env created from .env.example"));
                    return [3 /*break*/, 10];
                case 3:
                    _a = _c.sent();
                    _c.label = 4;
                case 4:
                    _c.trys.push([4, 7, , 9]);
                    return [4 /*yield*/, (0, promises_1.access)(packageEnvPath, fs_1.constants.R_OK)];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, (0, promises_1.copyFile)(packageEnvPath, envPath)];
                case 6:
                    _c.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " .env created from package .env.example"));
                    return [3 /*break*/, 9];
                case 7:
                    _b = _c.sent();
                    minimal = "# DEHA Configuration\n# Get API keys from your provider's dashboard\n\nOPENAI_API_KEY=\nANTHROPIC_API_KEY=\nGROQ_API_KEY=\nDEEPSEEK_API_KEY=\nXAI_API_KEY=\nOPENROUTER_API_KEY=\n";
                    return [4 /*yield*/, (0, promises_1.writeFile)(envPath, minimal, 'utf-8')];
                case 8:
                    _c.sent();
                    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " Minimal .env created"));
                    return [3 /*break*/, 9];
                case 9: return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
