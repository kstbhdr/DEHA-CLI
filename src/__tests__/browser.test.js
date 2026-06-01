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
var vitest_1 = require("vitest");
// Playwright mock
var mockPage = vitest_1.vi.hoisted(function () { return ({
    goto: vitest_1.vi.fn().mockResolvedValue({ status: function () { return 200; } }),
    click: vitest_1.vi.fn().mockResolvedValue(undefined),
    fill: vitest_1.vi.fn().mockResolvedValue(undefined),
    textContent: vitest_1.vi.fn().mockResolvedValue('test content'),
    innerHTML: vitest_1.vi.fn().mockResolvedValue('<p>test</p>'),
    evaluate: vitest_1.vi.fn().mockResolvedValue('eval result'),
    screenshot: vitest_1.vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vitest_1.vi.fn().mockResolvedValue(undefined),
    waitForSelector: vitest_1.vi.fn().mockResolvedValue(undefined),
    selectOption: vitest_1.vi.fn().mockResolvedValue(undefined),
    check: vitest_1.vi.fn().mockResolvedValue(undefined),
    hover: vitest_1.vi.fn().mockResolvedValue(undefined),
}); });
var mockContext = vitest_1.vi.hoisted(function () { return ({
    newPage: vitest_1.vi.fn().mockResolvedValue(mockPage),
}); });
var mockBrowser = vitest_1.vi.hoisted(function () { return ({
    newContext: vitest_1.vi.fn().mockResolvedValue(mockContext),
    close: vitest_1.vi.fn().mockResolvedValue(undefined),
}); });
var mockChromium = vitest_1.vi.hoisted(function () { return ({
    launch: vitest_1.vi.fn().mockResolvedValue(mockBrowser),
}); });
vitest_1.vi.mock('playwright', function () { return ({
    chromium: mockChromium,
}); });
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
}); });
vitest_1.vi.mock('../tools/terminal', function () { return ({
    runCommand: vitest_1.vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 100 }),
}); });
var browser_1 = require("../tools/browser");
(0, vitest_1.describe)('ensurePlaywrightInstalled', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('playwright import edilebiliyorsa true doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.ensurePlaywrightInstalled)()];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('runBrowserSession', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('navigate action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [{ type: 'navigate', url: 'https://example.com' }],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(1);
                    (0, vitest_1.expect)(results[0].success).toBe(true);
                    (0, vitest_1.expect)(mockPage.goto).toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('click action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'click', selector: '#btn' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(2);
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(mockPage.click).toHaveBeenCalledWith('#btn', vitest_1.expect.any(Object));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('fill action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'fill', selector: '#input', value: 'test' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(mockPage.fill).toHaveBeenCalledWith('#input', 'test', vitest_1.expect.any(Object));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('getText action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'getText', selector: 'h1' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(results[1].data).toBe('test content');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('getHtml action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'getHtml', selector: 'body' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('evaluate action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'evaluate', code: 'document.title' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(results[1].data).toBe('eval result');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('wait action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'wait', timeout: 500 },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('waitForSelector action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'waitForSelector', selector: '.loaded' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('scroll action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'scroll' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(mockPage.evaluate).toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('select action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'select', selector: '#dropdown', value: 'option1' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('screenshot action calisir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'screenshot', fullPage: true },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(true);
                    (0, vitest_1.expect)(results[1].screenshotPath).toBeTruthy();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hata durumunda FAIL doner ve devami calismaz', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockPage.goto.mockRejectedValueOnce(new Error('Connection refused'));
                    return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                            actions: [
                                { type: 'navigate', url: 'https://example.com' },
                                { type: 'click', selector: '#btn' },
                            ],
                        })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[0].success).toBe(false);
                    (0, vitest_1.expect)(results).toHaveLength(1); // ikinci action calismaz
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('bilinmeyen action FAIL doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.runBrowserSession)({
                        actions: [
                            { type: 'navigate', url: 'https://example.com' },
                            { type: 'unknown_action' },
                        ],
                    })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results[1].success).toBe(false);
                    (0, vitest_1.expect)(results[1].error).toContain('Bilinmeyen');
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('takeScreenshot', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('screenshot alir ve path doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.takeScreenshot)('https://example.com')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(typeof result).toBe('string');
                    (0, vitest_1.expect)(result).toContain('.png');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hata durumunda throw eder', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockPage.goto.mockRejectedValueOnce(new Error('fail'));
                    return [4 /*yield*/, (0, vitest_1.expect)((0, browser_1.takeScreenshot)('https://example.com')).rejects.toThrow()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('toolBrowserAction', function () {
    (0, vitest_1.beforeEach)(function () { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('action sonuclarini formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, browser_1.toolBrowserAction)({
                        url: 'https://example.com',
                        actions: [{ type: 'click', selector: '#btn' }],
                    })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('OK');
                    (0, vitest_1.expect)(result).toContain('click');
                    return [2 /*return*/];
            }
        });
    }); });
});
