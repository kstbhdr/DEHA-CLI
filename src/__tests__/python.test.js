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
var fs = require("fs");
// terminal.runCommand mock
var mockRunCommand = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(); });
vitest_1.vi.mock('../tools/terminal', function () { return ({
    runCommand: mockRunCommand,
}); });
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
    unlinkSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
}); });
var _a = await Promise.resolve().then(function () { return require('../tools/python'); }), detectPython = _a.detectPython, runPythonCode = _a.runPythonCode, toolRunPython = _a.toolRunPython, createVenv = _a.createVenv, installRequirements = _a.installRequirements;
(0, vitest_1.describe)('detectPython', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('python3 bulunursa python3 dondurur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: 'Python 3.11.0\n', stderr: '', exitCode: 0, duration: 100 });
                    return [4 /*yield*/, detectPython()];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('python3');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('python bulunursa python dondurur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand
                        .mockRejectedValueOnce(new Error('not found'))
                        .mockResolvedValue({ stdout: 'Python 3.11.0\n', stderr: '', exitCode: 0, duration: 100 });
                    return [4 /*yield*/, detectPython()];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBe('python');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hicbiri bulunamazsa null dondurur', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockRejectedValue(new Error('not found'));
                    return [4 /*yield*/, detectPython()];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('runPythonCode', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.writeFileSync).mockImplementation(function () { });
        vitest_1.vi.mocked(fs.unlinkSync).mockImplementation(function () { });
    });
    (0, vitest_1.it)('kodu gecici dosyaya yazar ve calistirir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: 'hello\n', stderr: '', exitCode: 0, duration: 50 });
                    return [4 /*yield*/, runPythonCode('print("hello")', { timeout: 30 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.stdout).toContain('hello');
                    (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalled();
                    (0, vitest_1.expect)(fs.unlinkSync).toHaveBeenCalled(); // temp file cleaned up
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('pip paketlerini kurar', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 50 });
                    return [4 /*yield*/, runPythonCode('import numpy', { installPackages: ['numpy', 'pandas'], timeout: 30 })];
                case 1:
                    _a.sent();
                    // pip install cagrisi yapilmali
                    (0, vitest_1.expect)(mockRunCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('pip install numpy pandas'), vitest_1.expect.any(Object));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('hata durumunda stderr doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: 'SyntaxError', exitCode: 1, duration: 50 });
                    return [4 /*yield*/, runPythonCode('invalid code', { timeout: 30 })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.exitCode).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('venvPath kullanirsa dogru binaryi kullanir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var platform, expectedDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 50 });
                    platform = process.platform;
                    expectedDir = platform === 'win32' ? 'Scripts' : 'bin';
                    return [4 /*yield*/, runPythonCode('print("test")', { venvPath: '/tmp/venv', timeout: 30 })];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(mockRunCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining(expectedDir), vitest_1.expect.any(Object));
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('toolRunPython', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.writeFileSync).mockImplementation(function () { });
        vitest_1.vi.mocked(fs.unlinkSync).mockImplementation(function () { });
    });
    (0, vitest_1.it)('kod calistirir ve sonucu formatlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockRunCommand.mockResolvedValue({ stdout: 'hello\n', stderr: '', exitCode: 0, duration: 50 });
                    return [4 /*yield*/, toolRunPython({ code: 'print("hello")' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('STDOUT');
                    (0, vitest_1.expect)(result).toContain('hello');
                    (0, vitest_1.expect)(result).toContain('EXIT: 0');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('code yoksa hata mesaji doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, toolRunPython({})];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('gerekli');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('dosya okur ve calistirir', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('print("from file")');
                    mockRunCommand.mockResolvedValue({ stdout: 'from file\n', stderr: '', exitCode: 0, duration: 50 });
                    return [4 /*yield*/, toolRunPython({ file: 'script.py' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('from file');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('dosya yoksa hata doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
                    return [4 /*yield*/, toolRunPython({ file: 'yok.py' })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('bulunamadı');
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('createVenv', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('venv olusturur ve path doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 1000 });
                    return [4 /*yield*/, createVenv('/tmp/project')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('.venv');
                    (0, vitest_1.expect)(mockRunCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('-m venv'), vitest_1.expect.any(Object));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('venv zaten varsa atlar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    return [4 /*yield*/, createVenv('/tmp/project')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('.venv');
                    (0, vitest_1.expect)(mockRunCommand).not.toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('venv olusturma hatasinda throw eder', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: 'permission denied', exitCode: 1, duration: 100 });
                    return [4 /*yield*/, (0, vitest_1.expect)(createVenv('/tmp/project')).rejects.toThrow()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, vitest_1.describe)('installRequirements', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('requirements.txt varsa paketleri kurar', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
                    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, duration: 1000 });
                    return [4 /*yield*/, installRequirements('/tmp/venv', '/tmp/project')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('Paketler kuruldu');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('requirements.txt yoksa mesaj doner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
                    return [4 /*yield*/, installRequirements('/tmp/venv', '/tmp/project')];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toContain('bulunamadı');
                    return [2 /*return*/];
            }
        });
    }); });
});
