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
exports.doctor = doctor;
var promises_1 = require("fs/promises");
var fs_1 = require("fs");
var child_process_1 = require("child_process");
var path_1 = require("path");
var logger_1 = require("../services/logger");
var RESET = '\x1b[0m';
var GREEN = '\x1b[32m';
var RED = '\x1b[31m';
var YELLOW = '\x1b[33m';
var BOLD = '\x1b[1m';
var passed = 0;
var failed = 0;
var warnings = 0;
function ok(label, detail) {
    if (detail === void 0) { detail = ''; }
    passed++;
    logger_1.logger.write("  ".concat(GREEN, "\u2714").concat(RESET, " ").concat(label).concat(detail ? " ".concat(YELLOW, "(").concat(detail, ")").concat(RESET) : ''));
}
function fail(label, hint) {
    failed++;
    logger_1.logger.write("  ".concat(RED, "\u2718").concat(RESET, " ").concat(label));
    logger_1.logger.write("    ".concat(YELLOW, "\u2192").concat(RESET, " ").concat(hint));
}
function warn(label, hint) {
    warnings++;
    logger_1.logger.write("  ".concat(YELLOW, "\u26A0").concat(RESET, " ").concat(label));
    logger_1.logger.write("    ".concat(YELLOW, "\u2192").concat(RESET, " ").concat(hint));
}
function checkPlaywright() {
    return __awaiter(this, void 0, void 0, function () {
        var browsers, chromiumPath;
        return __generator(this, function (_a) {
            try {
                browsers = (0, child_process_1.execSync)('npx playwright --version', {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 10000,
                });
                ok('Playwright installed', browsers.trim());
                // Check if chromium browser is available
                try {
                    chromiumPath = (0, child_process_1.execSync)('npx playwright install --dry-run chromium', {
                        encoding: 'utf-8',
                        stdio: ['ignore', 'pipe', 'pipe'],
                        timeout: 10000,
                    });
                    if (chromiumPath.includes('already installed') || chromiumPath.includes('No install')) {
                        ok('Playwright Chromium browser', 'installed');
                    }
                    else {
                        warn('Playwright Chromium browser', 'Not installed. Run: npx playwright install chromium');
                    }
                }
                catch (_b) {
                    warn('Playwright Chromium browser', 'Could not verify. Run: npx playwright install chromium');
                }
            }
            catch (_c) {
                fail('Playwright', 'Not installed. Run: npm install playwright');
            }
            return [2 /*return*/];
        });
    });
}
function checkPython() {
    return __awaiter(this, void 0, void 0, function () {
        var version, version;
        return __generator(this, function (_a) {
            try {
                version = (0, child_process_1.execSync)('python --version', {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 5000,
                });
                ok('Python', version.trim());
            }
            catch (_b) {
                try {
                    version = (0, child_process_1.execSync)('python3 --version', {
                        encoding: 'utf-8',
                        stdio: ['ignore', 'pipe', 'pipe'],
                        timeout: 5000,
                    });
                    ok('Python (python3)', version.trim());
                }
                catch (_c) {
                    fail('Python', 'Python not found. Install Python 3.10+ from https://python.org');
                }
            }
            return [2 /*return*/];
        });
    });
}
function checkNode() {
    return __awaiter(this, void 0, void 0, function () {
        var version, verNum;
        return __generator(this, function (_a) {
            try {
                version = (0, child_process_1.execSync)('node --version', {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 5000,
                });
                verNum = parseInt(version.trim().replace('v', '').split('.')[0], 10);
                if (verNum >= 18) {
                    ok('Node.js', version.trim());
                }
                else {
                    fail('Node.js', "Version ".concat(version.trim(), " is too old. Need 18+."));
                }
            }
            catch (_b) {
                fail('Node.js', 'Node.js not found. Install from https://nodejs.org');
            }
            return [2 /*return*/];
        });
    });
}
function checkOllama() {
    return __awaiter(this, void 0, void 0, function () {
        var version, res, models;
        return __generator(this, function (_a) {
            try {
                version = (0, child_process_1.execSync)('ollama --version', {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 5000,
                });
                ok('Ollama', version.trim());
                // Check if ollama server is running
                try {
                    res = (0, child_process_1.execSync)('ollama list', {
                        encoding: 'utf-8',
                        stdio: ['ignore', 'pipe', 'pipe'],
                        timeout: 10000,
                    });
                    ok('Ollama server', 'running');
                    models = res.split('\n').filter(function (l) { return l.includes(':'); }).length;
                    if (models > 0) {
                        ok("Ollama models", "".concat(models, " model(s) available"));
                    }
                    else {
                        warn('Ollama models', 'No models pulled. Run: ollama pull <model>');
                    }
                }
                catch (_b) {
                    fail('Ollama server', 'Server not running. Start with: ollama serve');
                }
            }
            catch (_c) {
                warn('Ollama', 'Not installed. Optional unless using local models.');
            }
            return [2 /*return*/];
        });
    });
}
function checkEnvFile() {
    return __awaiter(this, void 0, void 0, function () {
        var envPath, content, openaiMatch, anthropicMatch, groqMatch, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    envPath = (0, path_1.resolve)(process.cwd(), '.env');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, promises_1.access)(envPath, fs_1.constants.R_OK)];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, (0, promises_1.readFile)(envPath, 'utf-8')];
                case 3:
                    content = _b.sent();
                    openaiMatch = content.match(/^OPENAI_API_KEY=(.+)$/m);
                    anthropicMatch = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
                    groqMatch = content.match(/^GROQ_API_KEY=(.+)$/m);
                    if (openaiMatch && openaiMatch[1].trim())
                        ok('OPENAI_API_KEY', 'set');
                    else
                        warn('OPENAI_API_KEY', 'Not set in .env');
                    if (anthropicMatch && anthropicMatch[1].trim())
                        ok('ANTHROPIC_API_KEY', 'set');
                    else
                        warn('ANTHROPIC_API_KEY', 'Not set in .env');
                    if (groqMatch && groqMatch[1].trim())
                        ok('GROQ_API_KEY', 'set');
                    else
                        warn('GROQ_API_KEY', 'Not set in .env');
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    warn('.env file', 'Not found. Run: deha init or copy .env.example to .env');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function checkMCPConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var mcpPath, content, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    mcpPath = (0, path_1.resolve)(process.cwd(), 'mcp.json');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, promises_1.access)(mcpPath, fs_1.constants.R_OK)];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, (0, promises_1.readFile)(mcpPath, 'utf-8')];
                case 3:
                    content = _b.sent();
                    try {
                        JSON.parse(content);
                        ok('mcp.json', 'valid JSON');
                    }
                    catch (_c) {
                        fail('mcp.json', 'Invalid JSON format');
                    }
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    warn('mcp.json', 'Not found. Optional MCP configuration file.');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function checkDiskSpace() {
    return __awaiter(this, void 0, void 0, function () {
        var cmd, result;
        return __generator(this, function (_a) {
            try {
                cmd = process.platform === 'win32'
                    ? 'fsutil volume diskfree C:'
                    : 'df -h .';
                result = (0, child_process_1.execSync)(cmd, {
                    encoding: 'utf-8',
                    timeout: 5000,
                });
                ok('Disk access', 'readable');
            }
            catch (_b) {
                warn('Disk space', 'Could not check (non-critical)');
            }
            return [2 /*return*/];
        });
    });
}
function doctor() {
    return __awaiter(this, void 0, void 0, function () {
        var total, emoji;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.write("\n".concat(BOLD, "\uD83D\uDD0D DEHA Diagnostic Report").concat(RESET, "\n"));
                    logger_1.logger.write("".concat(BOLD, "System Checks").concat(RESET));
                    return [4 /*yield*/, checkNode()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, checkPython()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, checkPlaywright()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, checkOllama()];
                case 4:
                    _a.sent();
                    logger_1.logger.write("\n".concat(BOLD, "Configuration Checks").concat(RESET));
                    return [4 /*yield*/, checkEnvFile()];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, checkMCPConfig()];
                case 6:
                    _a.sent();
                    logger_1.logger.write("\n".concat(BOLD, "Environment Checks").concat(RESET));
                    return [4 /*yield*/, checkDiskSpace()];
                case 7:
                    _a.sent();
                    total = passed + failed + warnings;
                    emoji = failed === 0 ? '✅' : '❌';
                    logger_1.logger.write("\n".concat(emoji, " ").concat(BOLD, "Results").concat(RESET, ": ").concat(passed, " passed, ").concat(failed, " failed, ").concat(warnings, " warnings (").concat(total, " total)"));
                    if (failed > 0) {
                        logger_1.logger.write("\n".concat(YELLOW, "Tip:").concat(RESET, " Fix the failed checks first, then re-run ").concat(BOLD, "deha doctor").concat(RESET));
                    }
                    process.exit(failed > 0 ? 1 : 0);
                    return [2 /*return*/];
            }
        });
    });
}
