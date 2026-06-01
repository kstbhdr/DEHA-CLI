"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var fs = require("fs");
// context.ts içindeki fonksiyonları test etmek için fs modülünü mock'la
vitest_1.vi.mock('fs', function () { return ({
    default: {},
    existsSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
    readdirSync: vitest_1.vi.fn(),
}); });
// Modülü import et (mock'tan sonra)
var _a = await Promise.resolve().then(function () { return require('../services/context'); }), getUserContext = _a.getUserContext, setUserContext = _a.setUserContext, scanProject = _a.scanProject, generateAutoContext = _a.generateAutoContext, buildFullContext = _a.buildFullContext;
(0, vitest_1.describe)('getUserContext', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('context dosyası yoksa boş string döndürür', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
        (0, vitest_1.expect)(getUserContext()).toBe('');
    });
    (0, vitest_1.it)('context dosyası varsa içeriğini döndürür', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('  Proje hakkında önemli not  ');
        (0, vitest_1.expect)(getUserContext()).toBe('Proje hakkında önemli not');
    });
    (0, vitest_1.it)('okuma hatasında boş string döndürür', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        vitest_1.vi.mocked(fs.readFileSync).mockImplementation(function () { throw new Error('EACCES'); });
        (0, vitest_1.expect)(getUserContext()).toBe('');
    });
});
(0, vitest_1.describe)('setUserContext', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('.deha dizini yoksa oluşturur ve dosyayı yazar', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
        setUserContext('test context');
        (0, vitest_1.expect)(fs.mkdirSync).toHaveBeenCalled();
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledWith(vitest_1.expect.stringContaining('.deha'), 'test context', 'utf-8');
    });
    (0, vitest_1.it)('.deha dizini varsa doğrudan yazar', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        setUserContext('başka içerik');
        (0, vitest_1.expect)(fs.mkdirSync).not.toHaveBeenCalled();
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('scanProject', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('TypeScript projesini doğru tespit eder', function () {
        vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
            { name: 'src', isDirectory: function () { return true; } },
        ]);
        // src altında index.ts var
        vitest_1.vi.mocked(fs.readdirSync).mockImplementation(function (dir) {
            var dirStr = dir.toString();
            if (dirStr.includes('src')) {
                return [
                    { name: 'index.ts', isDirectory: function () { return false; } },
                ];
            }
            return [
                { name: 'src', isDirectory: function () { return true; } },
                { name: 'package.json', isDirectory: function () { return false; } },
                { name: 'tsconfig.json', isDirectory: function () { return false; } },
            ];
        });
        var summary = scanProject();
        (0, vitest_1.expect)(summary.language).toBe('TypeScript');
        (0, vitest_1.expect)(summary.hasPackageJson).toBe(true);
        (0, vitest_1.expect)(summary.hasTsconfig).toBe(true);
    });
    (0, vitest_1.it)('gizli dizinleri ve node_modules/git atlar', function () {
        vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
            { name: '.git', isDirectory: function () { return true; } },
            { name: 'node_modules', isDirectory: function () { return true; } },
            { name: 'index.ts', isDirectory: function () { return false; } },
        ]);
        var summary = scanProject();
        (0, vitest_1.expect)(summary.fileCount).toBe(1);
        (0, vitest_1.expect)(summary.topFiles).toContain('index.ts');
    });
});
(0, vitest_1.describe)('generateAutoContext', function () {
    (0, vitest_1.it)('Markdown formatında context üretir', function () {
        vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
            { name: 'index.ts', isDirectory: function () { return false; } },
            { name: 'package.json', isDirectory: function () { return false; } },
        ]);
        var result = generateAutoContext();
        (0, vitest_1.expect)(result).toContain('# Proje Otomatik Context');
        (0, vitest_1.expect)(result).toContain('**Dil:**');
        (0, vitest_1.expect)(result).toContain('**Dosya sayısı:** 2');
        (0, vitest_1.expect)(result).toContain('package.json mevcut');
    });
});
(0, vitest_1.describe)('buildFullContext', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('user context + auto context birleştirir', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('Kullanıcı notları');
        vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
            { name: 'main.py', isDirectory: function () { return false; } },
        ]);
        var result = buildFullContext();
        (0, vitest_1.expect)(result).toContain('Kullanıcı notları');
        (0, vitest_1.expect)(result).toContain('Proje Otomatik Context');
        (0, vitest_1.expect)(result).toContain('---');
    });
    (0, vitest_1.it)('user context yoksa sadece auto context döner', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false); // context.md yok
        vitest_1.vi.mocked(fs.readdirSync).mockReturnValue([
            { name: 'app.py', isDirectory: function () { return false; } },
        ]);
        var result = buildFullContext();
        (0, vitest_1.expect)(result).not.toContain('---');
        (0, vitest_1.expect)(result).toContain('Proje Otomatik Context');
    });
});
