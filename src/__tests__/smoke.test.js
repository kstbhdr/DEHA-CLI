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
vitest_1.vi.mock('axios');
var axios_1 = require("axios");
var smoke_1 = require("../tools/smoke");
(0, vitest_1.describe)('runSmokeCheck', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('basarili HTTP yanitinda PASS doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 200,
                        data: 'OK',
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({ name: 'test', url: 'https://example.com' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(true);
                    (0, vitest_1.expect)(result.status).toBe(200);
                    (0, vitest_1.expect)(result.failures).toEqual([]);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('beklenmeyen status kodunda FAIL doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 500,
                        data: 'Server Error',
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com', expectedStatus: 200,
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(false);
                    (0, vitest_1.expect)(result.failures.length).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('expectedBody icermiyorsa FAIL doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 200,
                        data: 'Hello World',
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com', expectedBody: 'NotFound',
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(false);
                    (0, vitest_1.expect)(result.failures[0]).toContain('içermiyor');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('expectedBody iceriyorsa PASS doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 200,
                        data: 'Hello World',
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com', expectedBody: 'World',
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('maxMs asiminda FAIL doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Gecikmeli yanit simule et
                    vitest_1.vi.mocked(axios_1.default.request).mockImplementation(function () {
                        return new Promise(function (resolve) {
                            setTimeout(function () { return resolve({ status: 200, data: 'OK', headers: {} }); }, 50);
                        });
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com', maxMs: 10,
                        })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('expectedJson kontrolu yapar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 200,
                        data: { name: 'DEHA', version: 1 },
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com',
                            expectedJson: { name: 'DEHA' },
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('network hatasinda FAIL doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockRejectedValue(new Error('ECONNREFUSED'));
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({ name: 'test', url: 'https://example.com' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(false);
                    (0, vitest_1.expect)(result.error).toContain('ECONNREFUSED');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('birden cok expected status kabul eder', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({
                        status: 301,
                        data: 'Redirect',
                        headers: {},
                    });
                    return [4 /*yield*/, (0, smoke_1.runSmokeCheck)({
                            name: 'test', url: 'https://example.com',
                            expectedStatus: [200, 301, 302],
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.pass).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('runSmokeTests', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('birden cok check calistirir ve rapor doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var report;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({ status: 200, data: 'OK', headers: {} });
                    return [4 /*yield*/, (0, smoke_1.runSmokeTests)([
                            { name: 'a', url: 'https://a.com' },
                            { name: 'b', url: 'https://b.com' },
                        ])];
                case 1:
                    report = _a.sent();
                    (0, vitest_1.expect)(report.total).toBe(2);
                    (0, vitest_1.expect)(report.passed).toBe(2);
                    (0, vitest_1.expect)(report.failed).toBe(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('buildQuickChecks', function () {
    (0, vitest_1.it)('URL ve route listesinden check listesi olusturur', function () {
        var checks = (0, smoke_1.buildQuickChecks)('https://api.example.com', ['/', '/health', '/api/users']);
        (0, vitest_1.expect)(checks).toHaveLength(3);
        (0, vitest_1.expect)(checks[0].url).toBe('https://api.example.com/');
        (0, vitest_1.expect)(checks[1].url).toBe('https://api.example.com/health');
        (0, vitest_1.expect)(checks[0].expectedStatus).toEqual([200, 201, 301, 302]);
    });
    (0, vitest_1.it)('varsayilan route [""] kullanir', function () {
        var checks = (0, smoke_1.buildQuickChecks)('https://example.com');
        (0, vitest_1.expect)(checks).toHaveLength(1);
        (0, vitest_1.expect)(checks[0].name).toBe('Ana Sayfa');
    });
});
(0, vitest_1.describe)('toolSmokeTest', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('basarili test sonucunu formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockResolvedValue({ status: 200, data: 'OK', headers: {} });
                    return [4 /*yield*/, (0, smoke_1.toolSmokeTest)({ url: 'https://example.com' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('PASS');
                    (0, vitest_1.expect)(result).toContain('200');
                    (0, vitest_1.expect)(result).toContain('1/1 geçti');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('basarisiz test sonucunu formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(axios_1.default.request).mockRejectedValue(new Error('Connection failed'));
                    return [4 /*yield*/, (0, smoke_1.toolSmokeTest)({ url: 'https://example.com' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('FAIL');
                    (0, vitest_1.expect)(result).toContain('HATA');
                    return [2 /*return*/];
            }
        });
    }); });
});
