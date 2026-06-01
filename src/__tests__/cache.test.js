"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var fs = require("fs");
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
    unlinkSync: vitest_1.vi.fn(),
    readdirSync: vitest_1.vi.fn(),
    statSync: vitest_1.vi.fn(),
}); });
var cache_1 = require("../services/cache");
(0, vitest_1.describe)('cache', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('setCache / getCached', function () {
        (0, vitest_1.it)('setCache sonrasi getCached ayni degeri dondurur', function () {
            var msgs = [{ role: 'user', content: 'merhaba' }];
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.writeFileSync).mockImplementation(function () { });
            (0, cache_1.setCache)('system', msgs, 'gpt-4o', 'Merhaba!');
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
                response: 'Merhaba!',
                ts: Date.now(),
            }));
            var result = (0, cache_1.getCached)('system', msgs, 'gpt-4o');
            (0, vitest_1.expect)(result).toBe('Merhaba!');
        });
        (0, vitest_1.it)('cache yoksa null dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
            var result = (0, cache_1.getCached)('system', [], 'gpt-4o');
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('suresi gecmis cache null dondurur ve dosyayi siler', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
                response: 'eski',
                ts: Date.now() - 7200000,
            }));
            vitest_1.vi.mocked(fs.unlinkSync).mockImplementation(function () { });
            var result = (0, cache_1.getCached)('system', [], 'gpt-4o');
            (0, vitest_1.expect)(result).toBeNull();
            (0, vitest_1.expect)(fs.unlinkSync).toHaveBeenCalled();
        });
        (0, vitest_1.it)('bozuk JSON cache durumunda null dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('{bozuk json');
            var result = (0, cache_1.getCached)('system', [], 'gpt-4o');
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)('clearCache', function () {
        (0, vitest_1.it)('cache dizini yoksa 0 dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
            (0, vitest_1.expect)((0, cache_1.clearCache)()).toBe(0);
        });
        (0, vitest_1.it)('.json dosyalarini siler ve sayisini dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
                'abc123.json',
                'def456.json',
                'readme.txt',
            ]);
            vitest_1.vi.mocked(fs.unlinkSync).mockImplementation(function () { });
            (0, vitest_1.expect)((0, cache_1.clearCache)()).toBe(2);
            (0, vitest_1.expect)(fs.unlinkSync).toHaveBeenCalledTimes(2);
        });
    });
    (0, vitest_1.describe)('cacheStats', function () {
        (0, vitest_1.it)('cache dizini yoksa sifir dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
            var stats = (0, cache_1.cacheStats)();
            (0, vitest_1.expect)(stats.fileCount).toBe(0);
            (0, vitest_1.expect)(stats.sizeBytes).toBe(0);
        });
        (0, vitest_1.it)('.json dosyalarinin sayisini ve boyutunu dondurur', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
                'a.json',
                'b.json',
            ]);
            vitest_1.vi.mocked(fs.statSync).mockReturnValue({ size: 1024 });
            var stats = (0, cache_1.cacheStats)();
            (0, vitest_1.expect)(stats.fileCount).toBe(2);
            (0, vitest_1.expect)(stats.sizeBytes).toBe(2048);
        });
    });
    (0, vitest_1.describe)('hash farkliligi', function () {
        (0, vitest_1.it)('farkli mesajlar farkli cache anahtari uretir', function () {
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.writeFileSync).mockImplementation(function () { });
            (0, cache_1.setCache)('sys', [{ role: 'user', content: 'a' }], 'model1', 'y1');
            (0, cache_1.setCache)('sys', [{ role: 'user', content: 'b' }], 'model1', 'y2');
            (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledTimes(2);
        });
    });
});
