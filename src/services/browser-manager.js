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
exports.BrowserManager = void 0;
var playwright_1 = require("playwright");
var DEFAULT_CONFIG = {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
var BrowserManager = /** @class */ (function () {
    function BrowserManager(config) {
        if (config === void 0) { config = {}; }
        this.browser = null;
        this.context = null;
        this.lastRequestTime = new Map();
        this.config = __assign(__assign({}, DEFAULT_CONFIG), config);
    }
    BrowserManager.getInstance = function (config) {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager(config);
        }
        return BrowserManager.instance;
    };
    BrowserManager.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.browser)
                            return [2 /*return*/];
                        _a = this;
                        return [4 /*yield*/, playwright_1.chromium.launch({
                                headless: this.config.headless,
                                args: [
                                    '--disable-blink-features=AutomationControlled',
                                    '--disable-dev-shm-usage',
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--disable-web-security',
                                    '--disable-features=IsolateOrigins,site-per-process'
                                ]
                            })];
                    case 1:
                        _a.browser = _c.sent();
                        _b = this;
                        return [4 /*yield*/, this.browser.newContext({
                                viewport: this.config.viewport,
                                userAgent: this.config.userAgent,
                                locale: 'tr-TR',
                                timezoneId: 'Europe/Istanbul',
                                geolocation: { latitude: 41.0082, longitude: 28.9784 },
                                permissions: ['geolocation'],
                                extraHTTPHeaders: {
                                    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                    'Accept-Encoding': 'gzip, deflate, br',
                                    'Connection': 'keep-alive',
                                    'Upgrade-Insecure-Requests': '1',
                                    'Sec-Fetch-Dest': 'document',
                                    'Sec-Fetch-Mode': 'navigate',
                                    'Sec-Fetch-Site': 'none',
                                    'Sec-Fetch-User': '?1'
                                }
                            })];
                    case 2:
                        _b.context = _c.sent();
                        // Stealth-like önlemler
                        return [4 /*yield*/, this.context.addInitScript(function () {
                                // WebDriver özelliğini gizle
                                Object.defineProperty(navigator, 'webdriver', {
                                    get: function () { return false; },
                                });
                                // Chrome runtime özelliklerini gizle
                                Object.defineProperty(navigator, 'plugins', {
                                    get: function () { return [1, 2, 3, 4, 5]; },
                                });
                                Object.defineProperty(navigator, 'languages', {
                                    get: function () { return ['tr-TR', 'tr', 'en-US', 'en']; },
                                });
                                // Canvas fingerprint'ı gizle
                                var originalGetContext = HTMLCanvasElement.prototype.getContext;
                                HTMLCanvasElement.prototype.getContext = function (type) {
                                    var args = [];
                                    for (var _i = 1; _i < arguments.length; _i++) {
                                        args[_i - 1] = arguments[_i];
                                    }
                                    var context = originalGetContext.apply(this, __spreadArray([type], args, true));
                                    if (type === '2d') {
                                        var originalGetImageData_1 = context.getImageData;
                                        context.getImageData = function () {
                                            var args = [];
                                            for (var _i = 0; _i < arguments.length; _i++) {
                                                args[_i] = arguments[_i];
                                            }
                                            var imageData = originalGetImageData_1.apply(this, args);
                                            // Rastgele gürültü ekle
                                            for (var i = 0; i < imageData.data.length; i += 4) {
                                                imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 2);
                                                imageData.data[i + 1] = imageData.data[i + 1] + Math.floor(Math.random() * 2);
                                                imageData.data[i + 2] = imageData.data[i + 2] + Math.floor(Math.random() * 2);
                                            }
                                            return imageData;
                                        };
                                    }
                                    return context;
                                };
                            })];
                    case 3:
                        // Stealth-like önlemler
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserManager.prototype.getPage = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.context) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/, this.context.newPage()];
                }
            });
        });
    };
    BrowserManager.prototype.waitForRateLimit = function (storeName) {
        return __awaiter(this, void 0, void 0, function () {
            var now, lastRequest, minInterval, waitTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        lastRequest = this.lastRequestTime.get(storeName) || 0;
                        minInterval = 2000;
                        waitTime = Math.max(0, minInterval - (now - lastRequest));
                        if (!(waitTime > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.sleep(waitTime + Math.random() * 1000)];
                    case 1:
                        _a.sent(); // Rastgele gecikme
                        _a.label = 2;
                    case 2:
                        this.lastRequestTime.set(storeName, Date.now());
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserManager.prototype.randomDelay = function () {
        return __awaiter(this, arguments, void 0, function (min, max) {
            var delay;
            if (min === void 0) { min = 100; }
            if (max === void 0) { max = 500; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        delay = Math.floor(Math.random() * (max - min + 1)) + min;
                        return [4 /*yield*/, this.sleep(delay)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserManager.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    BrowserManager.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.browser) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.browser.close()];
                    case 1:
                        _a.sent();
                        this.browser = null;
                        this.context = null;
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return BrowserManager;
}());
exports.BrowserManager = BrowserManager;
