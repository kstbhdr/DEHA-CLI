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
exports.detectPython = detectPython;
exports.runPythonCode = runPythonCode;
exports.createVenv = createVenv;
exports.installRequirements = installRequirements;
exports.runPytest = runPytest;
exports.toolRunPython = toolRunPython;
var fs = require("fs");
var path = require("path");
var os = require("os");
var terminal_1 = require("./terminal");
var PYTHON_BIN = process.platform === 'win32' ? 'python' : 'python3';
// ─── Python versiyonunu bul ─────────────────────────────────────────────────
function detectPython() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, bin, r, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _i = 0, _a = ['python3', 'python', 'py'];
                    _c.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    bin = _a[_i];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, terminal_1.runCommand)("".concat(bin, " --version"), { timeout: 5000 })];
                case 3:
                    r = _c.sent();
                    if (r.exitCode === 0)
                        return [2 /*return*/, bin];
                    return [3 /*break*/, 5];
                case 4:
                    _b = _c.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, null];
            }
        });
    });
}
// ─── Kod snippet çalıştır (geçici dosyaya yazar) ───────────────────────────
function runPythonCode(code_1) {
    return __awaiter(this, arguments, void 0, function (code, opts) {
        var python, tmpFile;
        var _a, _b;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    python = opts.venvPath
                        ? path.join(opts.venvPath, process.platform === 'win32' ? 'Scripts/python' : 'bin/python')
                        : PYTHON_BIN;
                    if (!((_a = opts.installPackages) === null || _a === void 0 ? void 0 : _a.length)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, terminal_1.runCommand)("".concat(python, " -m pip install ").concat(opts.installPackages.join(' '), " -q"), {
                            timeout: 60000,
                        })];
                case 1:
                    _c.sent();
                    _c.label = 2;
                case 2:
                    tmpFile = path.join(os.tmpdir(), "deha_py_".concat(Date.now(), ".py"));
                    fs.writeFileSync(tmpFile, code, 'utf-8');
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, , 5, 6]);
                    return [4 /*yield*/, (0, terminal_1.runCommand)("".concat(python, " \"").concat(tmpFile, "\""), {
                            timeout: ((_b = opts.timeout) !== null && _b !== void 0 ? _b : 30) * 1000,
                            cwd: opts.cwd,
                        })];
                case 4: return [2 /*return*/, _c.sent()];
                case 5:
                    try {
                        fs.unlinkSync(tmpFile);
                    }
                    catch ( /* ignore */_d) { /* ignore */ }
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ─── Virtual environment oluştur ────────────────────────────────────────────
function createVenv(targetDir) {
    return __awaiter(this, void 0, void 0, function () {
        var venvPath, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    venvPath = path.join(targetDir, '.venv');
                    if (!!fs.existsSync(venvPath)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, terminal_1.runCommand)("".concat(PYTHON_BIN, " -m venv \"").concat(venvPath, "\""), { timeout: 30000 })];
                case 1:
                    r = _a.sent();
                    if (r.exitCode !== 0)
                        throw new Error("venv olu\u015Fturulamad\u0131: ".concat(r.stderr));
                    _a.label = 2;
                case 2: return [2 /*return*/, venvPath];
            }
        });
    });
}
// ─── requirements.txt varsa kur ─────────────────────────────────────────────
function installRequirements(venvPath, projectDir) {
    return __awaiter(this, void 0, void 0, function () {
        var reqFile, pip, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    reqFile = path.join(projectDir, 'requirements.txt');
                    if (!fs.existsSync(reqFile))
                        return [2 /*return*/, 'requirements.txt bulunamadı'];
                    pip = path.join(venvPath, process.platform === 'win32' ? 'Scripts/pip' : 'bin/pip');
                    return [4 /*yield*/, (0, terminal_1.runCommand)("\"".concat(pip, "\" install -r \"").concat(reqFile, "\" -q"), { timeout: 120000 })];
                case 1:
                    r = _a.sent();
                    return [2 /*return*/, r.exitCode === 0 ? 'Paketler kuruldu' : "Hata: ".concat(r.stderr)];
            }
        });
    });
}
// ─── pytest çalıştır ────────────────────────────────────────────────────────
function runPytest(projectDir_1) {
    return __awaiter(this, arguments, void 0, function (projectDir, opts) {
        var pytest, pattern, r;
        var _a;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    pytest = opts.venvPath
                        ? path.join(opts.venvPath, process.platform === 'win32' ? 'Scripts/pytest' : 'bin/pytest')
                        : 'pytest';
                    pattern = (_a = opts.pattern) !== null && _a !== void 0 ? _a : '';
                    return [4 /*yield*/, (0, terminal_1.runCommand)("\"".concat(pytest, "\" ").concat(pattern, " -v --tb=short"), {
                            cwd: projectDir,
                            timeout: 120000,
                            stream: true,
                        })];
                case 1:
                    r = _b.sent();
                    return [2 /*return*/, [
                            r.stdout.trim(),
                            r.stderr.trim() ? "STDERR:\n".concat(r.stderr.trim()) : '',
                            "\nExit: ".concat(r.exitCode),
                        ].filter(Boolean).join('\n')];
            }
        });
    });
}
// ─── Tool versiyonu ─────────────────────────────────────────────────────────
function toolRunPython(input) {
    return __awaiter(this, void 0, void 0, function () {
        var code, venvPath, cwd, r, out;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    code = (_a = input.code) !== null && _a !== void 0 ? _a : '';
                    if (input.file) {
                        if (!fs.existsSync(input.file))
                            return [2 /*return*/, "Dosya bulunamad\u0131: ".concat(input.file)];
                        code = fs.readFileSync(input.file, 'utf-8');
                    }
                    if (!code)
                        return [2 /*return*/, 'code veya file gerekli'];
                    if (!input.use_venv) return [3 /*break*/, 2];
                    cwd = (_b = input.cwd) !== null && _b !== void 0 ? _b : process.cwd();
                    return [4 /*yield*/, createVenv(cwd)];
                case 1:
                    venvPath = _d.sent();
                    _d.label = 2;
                case 2: return [4 /*yield*/, runPythonCode(code, {
                        venvPath: venvPath,
                        timeout: (_c = input.timeout) !== null && _c !== void 0 ? _c : 30,
                        installPackages: input.packages,
                        cwd: input.cwd,
                    })];
                case 3:
                    r = _d.sent();
                    out = [];
                    if (r.stdout)
                        out.push("STDOUT:\n".concat(r.stdout.trim()));
                    if (r.stderr)
                        out.push("STDERR:\n".concat(r.stderr.trim()));
                    out.push("EXIT: ".concat(r.exitCode));
                    return [2 /*return*/, out.join('\n\n')];
            }
        });
    });
}
