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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBrowserSession = runBrowserSession;
exports.takeScreenshot = takeScreenshot;
exports.ensurePlaywrightInstalled = ensurePlaywrightInstalled;
exports.installPlaywright = installPlaywright;
exports.toolBrowserAction = toolBrowserAction;
var fs = require("fs");
var path = require("path");
var os = require("os");
var chalk_1 = require("chalk");
var terminal_1 = require("./terminal");
var logger_1 = require("../services/logger");
// Playwright lazy import — yüklü değilse kullanıcıya sor
function getPlaywright() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('playwright'); })];
                case 1: return [2 /*return*/, _b.sent()];
                case 2:
                    _a = _b.sent();
                    throw new Error('Playwright yüklü değil.\n' +
                        'Kurmak için: npx playwright install --with-deps chromium\n' +
                        'veya:        npm install -g playwright && playwright install chromium');
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ─── Oturum çalıştır ─────────────────────────────────────────────────────────
function runBrowserSession(session) {
    return __awaiter(this, void 0, void 0, function () {
        var chromium, results, browser, context, page, _i, _a, action, result;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, getPlaywright()];
                case 1:
                    chromium = (_d.sent()).chromium;
                    results = [];
                    return [4 /*yield*/, chromium.launch({ headless: (_b = session.headless) !== null && _b !== void 0 ? _b : true })];
                case 2:
                    browser = _d.sent();
                    return [4 /*yield*/, browser.newContext({
                            viewport: (_c = session.viewport) !== null && _c !== void 0 ? _c : { width: 1280, height: 720 },
                            userAgent: session.userAgent,
                        })];
                case 3:
                    context = _d.sent();
                    return [4 /*yield*/, context.newPage()];
                case 4:
                    page = _d.sent();
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, , 10, 12]);
                    _i = 0, _a = session.actions;
                    _d.label = 6;
                case 6:
                    if (!(_i < _a.length)) return [3 /*break*/, 9];
                    action = _a[_i];
                    return [4 /*yield*/, runAction(page, action, session.baseUrl)];
                case 7:
                    result = _d.sent();
                    results.push(result);
                    if (!result.success)
                        return [3 /*break*/, 9]; // hata varsa dur
                    _d.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9: return [3 /*break*/, 12];
                case 10: return [4 /*yield*/, browser.close()];
                case 11:
                    _d.sent();
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/, results];
            }
        });
    });
}
// ─── Tek action ──────────────────────────────────────────────────────────────
function runAction(page, action, baseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var timeout, _a, url, resp, text, html, result, screenshotDir, fileName, err_1;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    timeout = (_b = action.timeout) !== null && _b !== void 0 ? _b : 10000;
                    _m.label = 1;
                case 1:
                    _m.trys.push([1, 30, , 31]);
                    _a = action.type;
                    switch (_a) {
                        case 'navigate': return [3 /*break*/, 2];
                        case 'click': return [3 /*break*/, 4];
                        case 'fill': return [3 /*break*/, 6];
                        case 'select': return [3 /*break*/, 8];
                        case 'check': return [3 /*break*/, 10];
                        case 'hover': return [3 /*break*/, 12];
                        case 'scroll': return [3 /*break*/, 14];
                        case 'wait': return [3 /*break*/, 16];
                        case 'waitForSelector': return [3 /*break*/, 18];
                        case 'getText': return [3 /*break*/, 20];
                        case 'getHtml': return [3 /*break*/, 22];
                        case 'evaluate': return [3 /*break*/, 24];
                        case 'screenshot': return [3 /*break*/, 26];
                    }
                    return [3 /*break*/, 28];
                case 2:
                    url = ((_c = action.url) === null || _c === void 0 ? void 0 : _c.startsWith('http')) ? action.url : "".concat(baseUrl).concat(action.url);
                    return [4 /*yield*/, page.goto(url, { timeout: timeout, waitUntil: 'networkidle' })];
                case 3:
                    resp = _m.sent();
                    return [2 /*return*/, { action: "navigate(".concat(url, ")"), success: true, data: "Status: ".concat(resp === null || resp === void 0 ? void 0 : resp.status()) }];
                case 4: return [4 /*yield*/, page.click(action.selector, { timeout: timeout })];
                case 5:
                    _m.sent();
                    return [2 /*return*/, { action: "click(".concat(action.selector, ")"), success: true }];
                case 6: return [4 /*yield*/, page.fill(action.selector, (_d = action.value) !== null && _d !== void 0 ? _d : '', { timeout: timeout })];
                case 7:
                    _m.sent();
                    return [2 /*return*/, { action: "fill(".concat(action.selector, ")"), success: true }];
                case 8: return [4 /*yield*/, page.selectOption(action.selector, (_e = action.value) !== null && _e !== void 0 ? _e : '', { timeout: timeout })];
                case 9:
                    _m.sent();
                    return [2 /*return*/, { action: "select(".concat(action.selector, ")"), success: true }];
                case 10: return [4 /*yield*/, page.check(action.selector, { timeout: timeout })];
                case 11:
                    _m.sent();
                    return [2 /*return*/, { action: "check(".concat(action.selector, ")"), success: true }];
                case 12: return [4 /*yield*/, page.hover(action.selector, { timeout: timeout })];
                case 13:
                    _m.sent();
                    return [2 /*return*/, { action: "hover(".concat(action.selector, ")"), success: true }];
                case 14: 
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return [4 /*yield*/, page.evaluate(function () { var _a; return (_a = globalThis.window) === null || _a === void 0 ? void 0 : _a.scrollBy(0, 500); })];
                case 15:
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    _m.sent();
                    return [2 /*return*/, { action: 'scroll', success: true }];
                case 16: return [4 /*yield*/, page.waitForTimeout((_f = action.timeout) !== null && _f !== void 0 ? _f : 1000)];
                case 17:
                    _m.sent();
                    return [2 /*return*/, { action: "wait(".concat(action.timeout, "ms)"), success: true }];
                case 18: return [4 /*yield*/, page.waitForSelector(action.selector, { timeout: timeout })];
                case 19:
                    _m.sent();
                    return [2 /*return*/, { action: "waitForSelector(".concat(action.selector, ")"), success: true }];
                case 20: return [4 /*yield*/, page.textContent((_g = action.selector) !== null && _g !== void 0 ? _g : 'body', { timeout: timeout })];
                case 21:
                    text = _m.sent();
                    return [2 /*return*/, { action: "getText(".concat(action.selector, ")"), success: true, data: text !== null && text !== void 0 ? text : '' }];
                case 22: return [4 /*yield*/, page.innerHTML((_h = action.selector) !== null && _h !== void 0 ? _h : 'body', { timeout: timeout })];
                case 23:
                    html = _m.sent();
                    return [2 /*return*/, { action: "getHtml(".concat(action.selector, ")"), success: true, data: html.slice(0, 2000) }];
                case 24: return [4 /*yield*/, page.evaluate((_j = action.code) !== null && _j !== void 0 ? _j : '""')];
                case 25:
                    result = _m.sent();
                    return [2 /*return*/, { action: "evaluate(...)", success: true, data: String(result) }];
                case 26:
                    screenshotDir = path.join(os.homedir(), '.deha', 'screenshots');
                    if (!fs.existsSync(screenshotDir))
                        fs.mkdirSync(screenshotDir, { recursive: true });
                    fileName = (_k = action.outputPath) !== null && _k !== void 0 ? _k : path.join(screenshotDir, "screenshot_".concat(Date.now(), ".png"));
                    return [4 /*yield*/, page.screenshot({ path: fileName, fullPage: (_l = action.fullPage) !== null && _l !== void 0 ? _l : false })];
                case 27:
                    _m.sent();
                    return [2 /*return*/, { action: 'screenshot', success: true, screenshotPath: fileName }];
                case 28: return [2 /*return*/, { action: action.type, success: false, error: 'Bilinmeyen action' }];
                case 29: return [3 /*break*/, 31];
                case 30:
                    err_1 = _m.sent();
                    return [2 /*return*/, {
                            action: action.type,
                            success: false,
                            error: err_1 instanceof Error ? err_1.message : String(err_1),
                        }];
                case 31: return [2 /*return*/];
            }
        });
    });
}
// ─── Hızlı screenshot ────────────────────────────────────────────────────────
function takeScreenshot(url_1) {
    return __awaiter(this, arguments, void 0, function (url, opts) {
        var results, shot, err;
        var _a;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, runBrowserSession({
                        actions: __spreadArray(__spreadArray([
                            { type: 'navigate', url: url }
                        ], (opts.waitMs ? [{ type: 'wait', timeout: opts.waitMs }] : []), true), [
                            { type: 'screenshot', fullPage: opts.fullPage, outputPath: opts.outputPath },
                        ], false),
                        headless: true,
                    })];
                case 1:
                    results = _b.sent();
                    shot = results.find(function (r) { return r.screenshotPath; });
                    if (!(shot === null || shot === void 0 ? void 0 : shot.screenshotPath)) {
                        err = results.find(function (r) { return !r.success; });
                        throw new Error((_a = err === null || err === void 0 ? void 0 : err.error) !== null && _a !== void 0 ? _a : 'Screenshot alınamadı');
                    }
                    return [2 /*return*/, shot.screenshotPath];
            }
        });
    });
}
// ─── Playwright kurulum yardımcısı ───────────────────────────────────────────
function ensurePlaywrightInstalled() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('playwright'); })];
                case 1:
                    _b.sent();
                    return [2 /*return*/, true];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function installPlaywright() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.write(chalk_1.default.cyan('\nPlaywright kuruluyor...\n'));
                    return [4 /*yield*/, (0, terminal_1.runCommand)('npm install -g playwright', { stream: true, timeout: 120000 })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, terminal_1.runCommand)('npx playwright install chromium', { stream: true, timeout: 300000 })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ─── Tool versiyonu ─────────────────────────────────────────────────────────
function toolBrowserAction(input) {
    return __awaiter(this, void 0, void 0, function () {
        var actions, results, lines;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    actions = input.actions.map(function (a) { return (__assign(__assign({}, a), { type: a.type })); });
                    return [4 /*yield*/, runBrowserSession({
                            actions: __spreadArray([{ type: 'navigate', url: input.url }], actions, true),
                            headless: (_a = input.headless) !== null && _a !== void 0 ? _a : true,
                        })];
                case 1:
                    results = _b.sent();
                    lines = results.map(function (r) {
                        var status = r.success ? 'OK' : 'FAIL';
                        var extra = r.data ? " \u2192 ".concat(r.data.slice(0, 100)) : '';
                        var shot = r.screenshotPath ? " \u2192 ".concat(r.screenshotPath) : '';
                        var err = r.error ? " HATA: ".concat(r.error) : '';
                        return "".concat(status, " ").concat(r.action).concat(extra).concat(shot).concat(err);
                    });
                    return [2 /*return*/, lines.join('\n')];
            }
        });
    });
}
