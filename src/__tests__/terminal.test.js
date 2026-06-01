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
// child_process.spawn mock
var mockProc = vitest_1.vi.hoisted(function () { return ({
    stdout: { on: vitest_1.vi.fn() },
    stderr: { on: vitest_1.vi.fn() },
    on: vitest_1.vi.fn(),
    kill: vitest_1.vi.fn(),
}); });
var mockSpawnFn = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(function () { return mockProc; }); });
vitest_1.vi.mock('child_process', function () { return ({
    spawn: mockSpawnFn,
}); });
var terminal_1 = require("../tools/terminal");
// Helper: proc'u belli bir cikti ile yapilandir
function setupProc(proc, stdout, stderr, exitCode) {
    if (stdout === void 0) { stdout = ''; }
    if (stderr === void 0) { stderr = ''; }
    if (exitCode === void 0) { exitCode = 0; }
    proc.stdout.on.mockImplementation(function (event, cb) {
        if (event === 'data' && stdout)
            setTimeout(function () { return cb(Buffer.from(stdout)); }, 0);
        return proc.stdout;
    });
    proc.stderr.on.mockImplementation(function (event, cb) {
        if (event === 'data' && stderr)
            setTimeout(function () { return cb(Buffer.from(stderr)); }, 0);
        return proc.stderr;
    });
    proc.on.mockImplementation(function (event, cb) {
        if (event === 'close')
            setTimeout(function () { return cb(exitCode); }, 5);
        return proc;
    });
    return proc;
}
// Varsayilan proc: basarili, cikti yok
function resetDefaultProc() {
    setupProc(mockProc, '', '', 0);
    mockSpawnFn.mockImplementation(function () { return mockProc; });
    mockProc.kill.mockReset();
}
(0, vitest_1.describe)('runCommand', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        resetDefaultProc();
    });
    (0, vitest_1.it)('basarili komutu calistirir ve stdout doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setupProc(mockProc, 'hello world\n', '', 0);
                    return [4 /*yield*/, (0, terminal_1.runCommand)('echo hello', { shell: true })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.stdout).toContain('hello world');
                    (0, vitest_1.expect)(result.exitCode).toBe(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('stderr yakalanir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setupProc(mockProc, '', 'hata\n', 1);
                    return [4 /*yield*/, (0, terminal_1.runCommand)('invalid-cmd', { shell: true })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.stderr).toContain('hata');
                    (0, vitest_1.expect)(result.exitCode).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('timeout asiminda hata firlatir', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // 'close' event'ini tetikleme — timeout'a birak
                    mockProc.on.mockReturnValue(mockProc);
                    return [4 /*yield*/, (0, vitest_1.expect)((0, terminal_1.runCommand)('sleep 100', { timeout: 10, shell: true })).rejects.toThrow('Timeout')];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('spawn hatasinda reject olur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var testErr;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    testErr = new Error('spawn failed');
                    mockProc.on.mockImplementation(function (event, cb) {
                        if (event === 'error')
                            setTimeout(function () { return cb(testErr); }, 5);
                        return mockProc;
                    });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, terminal_1.runCommand)('bad', { shell: true })).rejects.toThrow('spawn failed')];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('runSequence', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('komutlari sirayla calistirir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var proc1, proc2, callIdx, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    proc1 = { stdout: { on: vitest_1.vi.fn() }, stderr: { on: vitest_1.vi.fn() }, on: vitest_1.vi.fn(), kill: vitest_1.vi.fn() };
                    proc2 = { stdout: { on: vitest_1.vi.fn() }, stderr: { on: vitest_1.vi.fn() }, on: vitest_1.vi.fn(), kill: vitest_1.vi.fn() };
                    setupProc(proc1, 'first\n', '', 0);
                    setupProc(proc2, 'second\n', '', 0);
                    callIdx = 0;
                    mockSpawnFn.mockImplementation(function () {
                        callIdx++;
                        return callIdx === 1 ? proc1 : proc2;
                    });
                    return [4 /*yield*/, (0, terminal_1.runSequence)(['echo first', 'echo second'], { shell: true })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(2);
                    (0, vitest_1.expect)(results[0].stdout).toContain('first');
                    (0, vitest_1.expect)(results[1].stdout).toContain('second');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hata alinca durur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var proc1, proc2, callIdx, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    proc1 = { stdout: { on: vitest_1.vi.fn() }, stderr: { on: vitest_1.vi.fn() }, on: vitest_1.vi.fn(), kill: vitest_1.vi.fn() };
                    proc2 = { stdout: { on: vitest_1.vi.fn() }, stderr: { on: vitest_1.vi.fn() }, on: vitest_1.vi.fn(), kill: vitest_1.vi.fn() };
                    setupProc(proc1, '', 'error\n', 1);
                    setupProc(proc2, 'unreachable\n', '', 0);
                    callIdx = 0;
                    mockSpawnFn.mockImplementation(function () {
                        callIdx++;
                        return callIdx === 1 ? proc1 : proc2;
                    });
                    return [4 /*yield*/, (0, terminal_1.runSequence)(['cmd1', 'cmd2'], { shell: true })];
                case 1:
                    results = _a.sent();
                    (0, vitest_1.expect)(results).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('toolRunTerminal', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        resetDefaultProc();
    });
    (0, vitest_1.it)('basarili sonucu formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setupProc(mockProc, 'test output\n', '', 0);
                    return [4 /*yield*/, (0, terminal_1.toolRunTerminal)({ command: 'echo test', timeout: 30 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('STDOUT');
                    (0, vitest_1.expect)(result).toContain('test output');
                    (0, vitest_1.expect)(result).toContain('EXIT: 0');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('stderr varsa ekler', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setupProc(mockProc, 'ok\n', 'warning\n', 0);
                    return [4 /*yield*/, (0, terminal_1.toolRunTerminal)({ command: 'cmd', timeout: 30 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('STDOUT');
                    (0, vitest_1.expect)(result).toContain('STDERR');
                    (0, vitest_1.expect)(result).toContain('warning');
                    return [2 /*return*/];
            }
        });
    }); });
});
