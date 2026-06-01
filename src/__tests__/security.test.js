"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var index_1 = require("../tools/index");
(0, vitest_1.describe)('isSafeCommand — güvenlik filtresi', function () {
    (0, vitest_1.it)('güvenli komutlar geçer', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('ls -la').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('npm run build').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('git status').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('cat package.json').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('npx tsc --noEmit').safe).toBe(true);
    });
    (0, vitest_1.it)('rm -rf / engellenir', function () {
        var result = (0, index_1.isSafeCommand)('rm -rf /');
        (0, vitest_1.expect)(result.safe).toBe(false);
        (0, vitest_1.expect)(result.reason).toContain('engellendi');
    });
    (0, vitest_1.it)('rm -rf /* engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('rm -rf /*').safe).toBe(false);
    });
    (0, vitest_1.it)('rm -rf ~ engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('rm -rf ~').safe).toBe(false);
    });
    (0, vitest_1.it)('dd if= engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('dd if=/dev/zero of=/dev/sda').safe).toBe(false);
    });
    (0, vitest_1.it)('mkfs engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('mkfs.ext4 /dev/sda1').safe).toBe(false);
    });
    (0, vitest_1.it)('fdisk engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('fdisk /dev/sda').safe).toBe(false);
    });
    (0, vitest_1.it)('format (Windows) engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('format C: /fs:NTFS').safe).toBe(false);
    });
    (0, vitest_1.it)('shutdown engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('shutdown /s /t 0').safe).toBe(false);
    });
    (0, vitest_1.it)('fork bomb engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)(':(){ :|:& };:').safe).toBe(false);
    });
    (0, vitest_1.it)('chmod 777 / engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('chmod 777 /').safe).toBe(false);
    });
    (0, vitest_1.it)('chown engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('chown nobody /').safe).toBe(false);
    });
    (0, vitest_1.it)('shred engellenir', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('shred -n 3 /dev/sda').safe).toBe(false);
    });
    (0, vitest_1.it)('komut 2000 karakterden uzunsa engellenir', function () {
        var longCmd = 'echo ' + 'a'.repeat(2000);
        var result = (0, index_1.isSafeCommand)(longCmd);
        (0, vitest_1.expect)(result.safe).toBe(false);
        (0, vitest_1.expect)(result.reason).toContain('çok uzun');
    });
    (0, vitest_1.it)('normal grep format_ isimleri engellenmez (false positive)', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('grep -r "format_" src/').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('grep "format_currency" file.ts').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('cat file.ts | grep format_').safe).toBe(true);
    });
    (0, vitest_1.it)('normal rm komutları (relative path) engellenmez', function () {
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('rm file.txt').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('rm -rf ./dist').safe).toBe(true);
        (0, vitest_1.expect)((0, index_1.isSafeCommand)('rm -rf node_modules').safe).toBe(true);
    });
});
