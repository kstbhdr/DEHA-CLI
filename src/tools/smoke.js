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
exports.runSmokeCheck = runSmokeCheck;
exports.runSmokeTests = runSmokeTests;
exports.printSmokeReport = printSmokeReport;
exports.buildQuickChecks = buildQuickChecks;
exports.toolSmokeTest = toolSmokeTest;
var axios_1 = require("axios");
var chalk_1 = require("chalk");
var logger_1 = require("../services/logger");
// ─── Tek check ──────────────────────────────────────────────────────────────
function runSmokeCheck(check) {
    return __awaiter(this, void 0, void 0, function () {
        var start, failures, response, error, err_1, durationMs, status, expectedStatuses, body, _i, _a, _b, key, val, actual;
        var _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    start = Date.now();
                    failures = [];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1.default.request({
                            url: check.url,
                            method: (_c = check.method) !== null && _c !== void 0 ? _c : 'GET',
                            data: check.body,
                            headers: check.headers,
                            timeout: (_d = check.maxMs) !== null && _d !== void 0 ? _d : 10000,
                            validateStatus: function () { return true; }, // tüm status kodlarını kabul et
                        })];
                case 2:
                    response = _f.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _f.sent();
                    error = err_1 instanceof Error ? err_1.message : String(err_1);
                    return [3 /*break*/, 4];
                case 4:
                    durationMs = Date.now() - start;
                    if (error) {
                        return [2 /*return*/, { name: check.name, url: check.url, pass: false, durationMs: durationMs, error: error, failures: failures }];
                    }
                    status = response.status;
                    expectedStatuses = Array.isArray(check.expectedStatus)
                        ? check.expectedStatus
                        : [(_e = check.expectedStatus) !== null && _e !== void 0 ? _e : 200];
                    if (!expectedStatuses.includes(status)) {
                        failures.push("Status ".concat(status, " \u2260 beklenen ").concat(expectedStatuses.join('|')));
                    }
                    // Yanıt süresi kontrolü
                    if (check.maxMs && durationMs > check.maxMs) {
                        failures.push("Yan\u0131t s\u00FCresi ".concat(durationMs, "ms > ").concat(check.maxMs, "ms"));
                    }
                    // Body string kontrolü
                    if (check.expectedBody) {
                        body = typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data);
                        if (!body.includes(check.expectedBody)) {
                            failures.push("Response body \"".concat(check.expectedBody, "\" i\u00E7ermiyor"));
                        }
                    }
                    // JSON key kontrolü
                    if (check.expectedJson && typeof response.data === 'object') {
                        for (_i = 0, _a = Object.entries(check.expectedJson); _i < _a.length; _i++) {
                            _b = _a[_i], key = _b[0], val = _b[1];
                            actual = response.data[key];
                            if (JSON.stringify(actual) !== JSON.stringify(val)) {
                                failures.push("JSON[".concat(key, "] = ").concat(JSON.stringify(actual), " \u2260 ").concat(JSON.stringify(val)));
                            }
                        }
                    }
                    return [2 /*return*/, {
                            name: check.name,
                            url: check.url,
                            pass: failures.length === 0,
                            status: status,
                            durationMs: durationMs,
                            failures: failures,
                        }];
            }
        });
    });
}
// ─── Birden fazla check ──────────────────────────────────────────────────────
function runSmokeTests(checks) {
    return __awaiter(this, void 0, void 0, function () {
        var start, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    start = Date.now();
                    return [4 /*yield*/, Promise.all(checks.map(runSmokeCheck))];
                case 1:
                    results = _a.sent();
                    return [2 /*return*/, {
                            total: results.length,
                            passed: results.filter(function (r) { return r.pass; }).length,
                            failed: results.filter(function (r) { return !r.pass; }).length,
                            results: results,
                            durationMs: Date.now() - start,
                        }];
            }
        });
    });
}
// ─── Raporu yazdır ───────────────────────────────────────────────────────────
function printSmokeReport(report) {
    var _a;
    logger_1.logger.write('\n' + chalk_1.default.bold('═══ Smoke Test Raporu ═══\n'));
    for (var _i = 0, _b = report.results; _i < _b.length; _i++) {
        var r = _b[_i];
        var icon = r.pass ? chalk_1.default.green('✓') : chalk_1.default.red('✗');
        var name_1 = r.pass ? chalk_1.default.white(r.name) : chalk_1.default.red(r.name);
        var meta = chalk_1.default.dim("".concat((_a = r.status) !== null && _a !== void 0 ? _a : 'ERR', " \u2022 ").concat(r.durationMs, "ms"));
        logger_1.logger.write("  ".concat(icon, "  ").concat(name_1, "  ").concat(meta));
        if (!r.pass) {
            if (r.error)
                logger_1.logger.write(chalk_1.default.red("     Hata: ".concat(r.error)));
            for (var _c = 0, _d = r.failures; _c < _d.length; _c++) {
                var f = _d[_c];
                logger_1.logger.write(chalk_1.default.red("     \u2717 ".concat(f)));
            }
        }
    }
    logger_1.logger.write('');
    var total = chalk_1.default.dim("Toplam: ".concat(report.total));
    var passed = chalk_1.default.green("\u2713 ".concat(report.passed));
    var failed = report.failed > 0 ? chalk_1.default.red("\u2717 ".concat(report.failed)) : chalk_1.default.dim('✗ 0');
    var elapsed = chalk_1.default.dim("".concat(report.durationMs, "ms"));
    logger_1.logger.write("  ".concat(total, "  ").concat(passed, "  ").concat(failed, "  ").concat(elapsed, "\n"));
}
// ─── URL'den otomatik check listesi oluştur ──────────────────────────────────
function buildQuickChecks(baseUrl, routes) {
    if (routes === void 0) { routes = ['/']; }
    return routes.map(function (route) { return ({
        name: route === '/' ? 'Ana Sayfa' : route,
        url: baseUrl.replace(/\/$/, '') + route,
        expectedStatus: [200, 201, 301, 302],
        maxMs: 5000,
    }); });
}
// ─── Tool versiyonu ─────────────────────────────────────────────────────────
function toolSmokeTest(input) {
    return __awaiter(this, void 0, void 0, function () {
        var routes, checks, report, lines, _i, _a, r;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    routes = (_b = input.routes) !== null && _b !== void 0 ? _b : ['/'];
                    checks = routes.map(function (r) {
                        var _a;
                        return ({
                            name: r,
                            url: input.url.replace(/\/$/, '') + r,
                            expectedStatus: input.expected_status ? [input.expected_status] : [200, 201, 301, 302],
                            expectedBody: input.expected_body,
                            maxMs: (_a = input.max_ms) !== null && _a !== void 0 ? _a : 5000,
                        });
                    });
                    return [4 /*yield*/, runSmokeTests(checks)];
                case 1:
                    report = _d.sent();
                    lines = [];
                    for (_i = 0, _a = report.results; _i < _a.length; _i++) {
                        r = _a[_i];
                        lines.push("".concat(r.pass ? 'PASS' : 'FAIL', " ").concat(r.name, " \u2014 ").concat((_c = r.status) !== null && _c !== void 0 ? _c : 'ERR', " ").concat(r.durationMs, "ms"));
                        if (!r.pass) {
                            if (r.error)
                                lines.push("  HATA: ".concat(r.error));
                            lines.push.apply(lines, r.failures.map(function (f) { return "  \u2717 ".concat(f); }));
                        }
                    }
                    lines.push("\nSonu\u00E7: ".concat(report.passed, "/").concat(report.total, " ge\u00E7ti"));
                    return [2 /*return*/, lines.join('\n')];
            }
        });
    });
}
