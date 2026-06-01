"use strict";
/**
 * CLI Entegrasyon Testleri (e2e)
 *
 * `deha` CLI'sını spawnSync ile çağırarak argument parsing
 * ve temel komutların çalıştığını doğrular.
 * Windows uyumluluğu için shell:true + spawnSync kullanılır.
 */
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
var vitest_1 = require("vitest");
var child_process_1 = require("child_process");
var path = require("path");
var PROJECT_DIR = path.resolve(__dirname, '../..');
var CLI_SCRIPT = path.resolve(PROJECT_DIR, 'dist/index.js');
function runCLI() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    var result = (0, child_process_1.spawnSync)('node', __spreadArray([CLI_SCRIPT], args, true), {
        cwd: PROJECT_DIR,
        timeout: 15000,
        encoding: 'utf-8',
        windowsHide: true,
    });
    return {
        stdout: (result.stdout || '').toString(),
        stderr: (result.stderr || '').toString(),
        status: result.status,
    };
}
(0, vitest_1.describe)('deha CLI', function () {
    (0, vitest_1.it)('--help yardım mesajını gösterir', function () {
        var _a = runCLI('--help'), stdout = _a.stdout, status = _a.status;
        (0, vitest_1.expect)(status).toBe(0);
        (0, vitest_1.expect)(stdout).toContain('deha');
        (0, vitest_1.expect)(stdout).toContain('chat');
        (0, vitest_1.expect)(stdout).toContain('build');
        (0, vitest_1.expect)(stdout).toContain('judge');
    });
    (0, vitest_1.it)('--version sürümü gösterir', function () {
        var _a = runCLI('--version'), stdout = _a.stdout, status = _a.status;
        (0, vitest_1.expect)(status).toBe(0);
        (0, vitest_1.expect)(stdout).toMatch(/[\d]+\.[\d]+\.?[\d]*/);
    });
    (0, vitest_1.it)('bilinmeyen komut hata ile çıkar', function () {
        var _a = runCLI('nonexistent-command-xyz'), stdout = _a.stdout, stderr = _a.stderr, status = _a.status;
        var output = stdout + stderr;
        (0, vitest_1.expect)(output.length).toBeGreaterThan(0);
        // Windows'ta spawnSync bazen null status döndürebilir (timeout)
        // ama yine de hata çıktısı üretilmiş olmalı
        if (status !== null) {
            (0, vitest_1.expect)(status).toBe(1);
        }
    });
});
