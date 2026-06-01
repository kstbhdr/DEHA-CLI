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
exports.runCommand = runCommand;
exports.runSequence = runSequence;
exports.toolRunTerminal = toolRunTerminal;
var child_process_1 = require("child_process");
var path = require("path");
var chalk_1 = require("chalk");
/**
 * Komutu çalıştırır, stdout/stderr'i yakalar, isteğe bağlı canlı yazar.
 */
function runCommand(command, opts) {
    if (opts === void 0) { opts = {}; }
    return new Promise(function (resolve, reject) {
        var _a, _b, _c, _d, _e;
        var start = Date.now();
        var timeout = (_a = opts.timeout) !== null && _a !== void 0 ? _a : 30000;
        var cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
        var label = opts.label ? chalk_1.default.dim("[".concat(opts.label, "] ")) : '';
        var proc = (0, child_process_1.spawn)(command, {
            cwd: cwd,
            shell: (_b = opts.shell) !== null && _b !== void 0 ? _b : true,
            env: __assign(__assign({}, process.env), ((_c = opts.env) !== null && _c !== void 0 ? _c : {})),
        });
        var stdout = '';
        var stderr = '';
        (_d = proc.stdout) === null || _d === void 0 ? void 0 : _d.on('data', function (chunk) {
            var text = chunk.toString();
            stdout += text;
            if (opts.stream)
                process.stdout.write(label + text);
        });
        (_e = proc.stderr) === null || _e === void 0 ? void 0 : _e.on('data', function (chunk) {
            var text = chunk.toString();
            stderr += text;
            if (opts.stream)
                process.stderr.write(chalk_1.default.red(label) + text);
        });
        var timer = setTimeout(function () {
            proc.kill('SIGTERM');
            reject(new Error("Timeout: komut ".concat(timeout / 1000, "s i\u00E7inde tamamlanamad\u0131")));
        }, timeout);
        proc.on('close', function (exitCode) {
            clearTimeout(timer);
            resolve({ stdout: stdout, stderr: stderr, exitCode: exitCode !== null && exitCode !== void 0 ? exitCode : -1, duration: Date.now() - start });
        });
        proc.on('error', function (err) {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/**
 * Birden fazla komutu sırayla çalıştırır, biri başarısız olursa durur.
 */
function runSequence(commands_1) {
    return __awaiter(this, arguments, void 0, function (commands, opts) {
        var results, _i, commands_2, cmd, result;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    _i = 0, commands_2 = commands;
                    _a.label = 1;
                case 1:
                    if (!(_i < commands_2.length)) return [3 /*break*/, 4];
                    cmd = commands_2[_i];
                    return [4 /*yield*/, runCommand(cmd, opts)];
                case 2:
                    result = _a.sent();
                    results.push(result);
                    if (result.exitCode !== 0)
                        return [3 /*break*/, 4];
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Tool olarak çağrılabilir versiyon — agent için string döner.
 */
function toolRunTerminal(input) {
    return __awaiter(this, void 0, void 0, function () {
        var result, lines;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, runCommand(input.command, {
                        cwd: input.cwd,
                        timeout: ((_a = input.timeout) !== null && _a !== void 0 ? _a : 30) * 1000,
                        env: input.env,
                        shell: true,
                    })];
                case 1:
                    result = _b.sent();
                    lines = [];
                    if (result.stdout)
                        lines.push("STDOUT:\n".concat(result.stdout.trim()));
                    if (result.stderr)
                        lines.push("STDERR:\n".concat(result.stderr.trim()));
                    lines.push("EXIT: ".concat(result.exitCode, "  (").concat(result.duration, "ms)"));
                    return [2 /*return*/, lines.join('\n\n')];
            }
        });
    });
}
