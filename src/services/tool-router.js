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
exports.decideToolRoute = decideToolRoute;
var ai_service_1 = require("./ai-service");
var TOOL_ROUTER_SYSTEM = "You are DEHA's tool router.\n\nDecide whether the user request needs tools/file system/shell/browser/web search, or can be answered directly from conversation context.\n\nReply ONLY with JSON:\n{\"use_tools\":true,\"reason\":\"short reason\"}\n{\"use_tools\":false,\"reason\":\"short reason\"}\n\nUse tools when the user asks to read/list/search files, inspect directories, run commands/tests, edit code, use browser/playwright, crawl/search the web, analyze images, deploy, git operations, or verify current system state.\nDo NOT use tools for casual chat, explanations, coding advice, summaries from already loaded conversation context, or questions answerable from visible context.\n\nExamples:\nUser: \"root dizinindeki index.md yi oku\" -> {\"use_tools\":true,\"reason\":\"must read a file\"}\nUser: \"projeye bak sorunlar\u0131 tespit et\" -> {\"use_tools\":true,\"reason\":\"must inspect files\"}\nUser: \"en son ne yapt\u0131k\" -> {\"use_tools\":false,\"reason\":\"answer from loaded conversation context\"}\nUser: \"bu fonksiyon ne yap\u0131yor\" -> {\"use_tools\":false,\"reason\":\"can explain if code is already in context\"}";
var OBVIOUS_TOOL_PATTERNS = [
    /\b(oku|aç|listele|ls|cat|grep|araştır|incele|bak|kontrol et|çalıştır|test et|build et|deploy|push|pull|commit)\b/i,
    /\b(read|open|list|search|inspect|check|run|test|build|deploy|push|pull|commit)\b/i,
    /\b(index\.md|\.md|\.ts|\.js|\.json|\.env|package\.json|dosya|klasör|dizin|repo|github|vps|root)\b/i,
    /\b(browser|playwright|screenshot|vision|web search|crawl|duckduckgo)\b/i,
];
function decideToolRoute(message, config) {
    return __awaiter(this, void 0, void 0, function () {
        var normalized, hasObviousToolSignal, routerConfig, messages, raw, match, parsed, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    normalized = message.trim();
                    if (!normalized)
                        return [2 /*return*/, { useTools: false }];
                    hasObviousToolSignal = OBVIOUS_TOOL_PATTERNS.some(function (pattern) { return pattern.test(normalized); });
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    routerConfig = __assign(__assign({}, config), { maxTokens: 256, temperature: 0, systemPrompt: TOOL_ROUTER_SYSTEM, deepseekThinking: 'disabled' });
                    if (config.provider === 'deepseek') {
                        routerConfig.deepseekModel = 'deepseek-chat';
                    }
                    messages = [{ role: 'user', content: normalized }];
                    return [4 /*yield*/, (0, ai_service_1.sendMessage)(messages, routerConfig)];
                case 2:
                    raw = _b.sent();
                    match = raw.match(/\{[\s\S]*?\}/);
                    if (!match) {
                        return [2 /*return*/, { useTools: hasObviousToolSignal, reason: 'router returned no json' }];
                    }
                    parsed = JSON.parse(match[0]);
                    return [2 /*return*/, {
                            useTools: typeof parsed.use_tools === 'boolean' ? parsed.use_tools : hasObviousToolSignal,
                            reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
                        }];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, { useTools: hasObviousToolSignal, reason: 'router fallback' }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
