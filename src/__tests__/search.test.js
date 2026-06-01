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
// https modulunu mock'la — vi.hoisted ile initialize et
var _a = vitest_1.vi.hoisted(function () {
    var mockReq = {
        write: vitest_1.vi.fn(),
        end: vitest_1.vi.fn(),
        setTimeout: vitest_1.vi.fn(),
        on: vitest_1.vi.fn(),
        destroy: vitest_1.vi.fn(),
    };
    var mockRes = {
        on: vitest_1.vi.fn(),
        statusCode: 200,
        headers: {},
    };
    var mockRequest = vitest_1.vi.fn(function (options, callback) {
        setTimeout(function () { return callback(mockRes); }, 0);
        return mockReq;
    });
    return { mockRequest: mockRequest, mockReq: mockReq, mockRes: mockRes };
}), mockRequest = _a.mockRequest, mockReq = _a.mockReq, mockRes = _a.mockRes;
vitest_1.vi.mock('https', function () { return ({
    default: { request: mockRequest },
    request: mockRequest,
}); });
vitest_1.vi.mock('cheerio');
var search_1 = require("../tools/search");
var cheerio = require("cheerio");
(0, vitest_1.describe)('toolWebSearch', function () {
    var cheerioMock = vitest_1.vi.hoisted(function () { return ({
        load: vitest_1.vi.fn().mockReturnValue(function (sel) { return ({
            each: vitest_1.vi.fn(function (cb) {
                cb(0, {});
                return { length: 1 };
            }),
            text: vitest_1.vi.fn().mockReturnValue('Test'),
            attr: vitest_1.vi.fn(function (name) { return name === 'href' ? 'https://example.com' : ''; }),
            closest: vitest_1.vi.fn().mockReturnThis(),
            next: vitest_1.vi.fn().mockReturnThis(),
            find: vitest_1.vi.fn().mockReturnThis(),
            last: vitest_1.vi.fn().mockReturnThis(),
        }); }),
    }); });
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('sonuc formatini dondurur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(cheerio.load).mockImplementation(cheerioMock.load);
                    mockRes.statusCode = 200;
                    mockRes.on = vitest_1.vi.fn(function (event, cb) {
                        if (event === 'data')
                            cb(Buffer.from('<html><body><a href="https://example.com">Test</a></body></html>'));
                        if (event === 'end')
                            cb();
                        return mockRes;
                    });
                    return [4 /*yield*/, (0, search_1.toolWebSearch)({ query: 'test query', max_results: 5 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(typeof result).toBe('string');
                    (0, vitest_1.expect)(result.length).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('toolCrawlUrl', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('URL icerigini getirir ve temizler', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // cheerio load mock
                    vitest_1.vi.mocked(cheerio.load).mockReturnValue(vitest_1.vi.fn(function (sel) { return ({
                        text: vitest_1.vi.fn().mockReturnValue('Test content for crawling'),
                        remove: vitest_1.vi.fn(),
                        length: sel === 'body' ? 1 : 0,
                    }); }));
                    mockRes.statusCode = 200;
                    mockRes.headers = {};
                    mockRes.on = vitest_1.vi.fn(function (event, cb) {
                        if (event === 'data')
                            cb(Buffer.from('<html><body><article><p>Test content</p></article></body></html>'));
                        if (event === 'end')
                            cb();
                        return mockRes;
                    });
                    return [4 /*yield*/, (0, search_1.toolCrawlUrl)({ url: 'https://example.com/test' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('Test content');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('max_chars ile kisaltma yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var longText, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    longText = 'x'.repeat(200);
                    vitest_1.vi.mocked(cheerio.load).mockReturnValue(vitest_1.vi.fn(function (sel) { return ({
                        text: vitest_1.vi.fn().mockReturnValue(longText),
                        remove: vitest_1.vi.fn(),
                        length: 1,
                    }); }));
                    mockRes.on = vitest_1.vi.fn(function (event, cb) {
                        if (event === 'data')
                            cb(Buffer.from("<html><body>".concat(longText, "</body></html>")));
                        if (event === 'end')
                            cb();
                        return mockRes;
                    });
                    return [4 /*yield*/, (0, search_1.toolCrawlUrl)({ url: 'https://example.com', max_chars: 10 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.length).toBeLessThanOrEqual(11);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('gecersiz URLde hata firlatir', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, vitest_1.expect)((0, search_1.toolCrawlUrl)({ url: 'not-a-url' })).rejects.toThrow()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
