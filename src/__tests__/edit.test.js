"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var fs = require("fs");
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
}); });
var edit_1 = require("../tools/edit");
(0, vitest_1.describe)('editFile', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('satir 1\nsatir 2\nsatir 3\n');
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
    });
    (0, vitest_1.it)('eski metni yenisiyle degistirir', function () {
        var result = (0, edit_1.editFile)({ path: 'test.txt', old_string: 'satir 2', new_string: 'degisti' });
        (0, vitest_1.expect)(result).toContain('Düzenlendi');
        (0, vitest_1.expect)(result).toContain('1 değişiklik');
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledWith(vitest_1.expect.any(String), 'satir 1\ndegisti\nsatir 3\n', 'utf-8');
    });
    (0, vitest_1.it)('replace_all ile tumunu degistirir', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('x\ny\nx\n');
        var result = (0, edit_1.editFile)({ path: 'test.txt', old_string: 'x', new_string: 'z', replace_all: true });
        (0, vitest_1.expect)(result).toContain('2 değişiklik');
    });
    (0, vitest_1.it)('dosya yoksa hata dondurur', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
        var result = (0, edit_1.editFile)({ path: 'yok.txt', old_string: 'x', new_string: 'y' });
        (0, vitest_1.expect)(result).toContain('HATA');
        (0, vitest_1.expect)(result).toContain('bulunamadı');
    });
    (0, vitest_1.it)('eski metin bulunamazsa hata dondurur', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('farklı içerik\n');
        var result = (0, edit_1.editFile)({ path: 'test.txt', old_string: 'bulunamaz', new_string: 'y' });
        (0, vitest_1.expect)(result).toContain('HATA');
        (0, vitest_1.expect)(result).toContain('bulunamadı');
    });
    (0, vitest_1.it)('bos old_string ile calisir', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('icerik\n');
        var result = (0, edit_1.editFile)({ path: 'test.txt', old_string: '', new_string: 'basa_ek' });
        // Boş string her satırda var, replace_all ile tüm satırları değiştirir
        // Ama varsayılan replace_all=false, ilk geçeni değiştirir
        (0, vitest_1.expect)(result).toContain('Düzenlendi');
    });
});
(0, vitest_1.describe)('insertLines', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('satir 1\nsatir 2\n');
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
    });
    (0, vitest_1.it)('satir 0 a (basa) ekleme yapar', function () {
        var result = (0, edit_1.insertLines)({ path: 'test.txt', line: 0, content: 'basa\nsatir' });
        (0, vitest_1.expect)(result).toContain('2 satır eklendi');
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledWith(vitest_1.expect.any(String), 'basa\nsatir\nsatir 1\nsatir 2\n', 'utf-8');
    });
    (0, vitest_1.it)('ortaya satir ekler', function () {
        var result = (0, edit_1.insertLines)({ path: 'test.txt', line: 2, content: 'yeni satir' });
        (0, vitest_1.expect)(result).toContain('1 satır eklendi');
    });
    (0, vitest_1.it)('dosya yoksa hata dondurur', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
        var result = (0, edit_1.insertLines)({ path: 'yok.txt', line: 1, content: 'test' });
        (0, vitest_1.expect)(result).toContain('HATA');
    });
});
(0, vitest_1.describe)('deleteLines', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('s1\ns2\ns3\ns4\n');
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
    });
    (0, vitest_1.it)('satirlari siler', function () {
        var result = (0, edit_1.deleteLines)({ path: 'test.txt', from_line: 2, to_line: 3 });
        (0, vitest_1.expect)(result).toContain('2 satır silindi');
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledWith(vitest_1.expect.any(String), 's1\ns4\n', 'utf-8');
    });
    (0, vitest_1.it)('dosya yoksa hata dondurur', function () {
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false);
        var result = (0, edit_1.deleteLines)({ path: 'yok.txt', from_line: 1, to_line: 1 });
        (0, vitest_1.expect)(result).toContain('HATA');
    });
});
(0, vitest_1.describe)('parseEditBlocks', function () {
    (0, vitest_1.it)('EDIT bloklarini parse eder', function () {
        var text = "EDIT: src/test.ts\n<<<OLD>>>\neski kod\n<<<NEW>>>\nyeni kod\n<<<END>>>";
        var blocks = (0, edit_1.parseEditBlocks)(text);
        (0, vitest_1.expect)(blocks).toHaveLength(1);
        (0, vitest_1.expect)(blocks[0].file).toBe('src/test.ts');
        (0, vitest_1.expect)(blocks[0].oldStr).toBe('eski kod\n');
        (0, vitest_1.expect)(blocks[0].newStr).toBe('yeni kod\n');
    });
    (0, vitest_1.it)('birden cok EDIT blogu parse eder', function () {
        var text = "EDIT: a.ts\n<<<OLD>>>\na\n<<<NEW>>>\nb\n<<<END>>>\nEDIT: c.ts\n<<<OLD>>>\nc\n<<<NEW>>>\nd\n<<<END>>>";
        var blocks = (0, edit_1.parseEditBlocks)(text);
        (0, vitest_1.expect)(blocks).toHaveLength(2);
    });
    (0, vitest_1.it)('EDIT blogu yoksa bos dizi dondurur', function () {
        (0, vitest_1.expect)((0, edit_1.parseEditBlocks)('normal text')).toEqual([]);
    });
});
(0, vitest_1.describe)('applyEditBlocks', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('eski\n');
        vitest_1.vi.mocked(fs.writeFileSync).mockImplementation(function () { });
    });
    (0, vitest_1.it)('bloklari sirayla uygular', function () {
        var blocks = [{ file: 'test.txt', oldStr: 'eski', newStr: 'yeni' }];
        var results = (0, edit_1.applyEditBlocks)(blocks);
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0]).toContain('Düzenlendi');
    });
});
(0, vitest_1.describe)('showInlineDiff', function () {
    (0, vitest_1.it)('farkli satirlari gosterir', function () {
        var diff = (0, edit_1.showInlineDiff)('a\nb\nc', 'a\nx\nc');
        (0, vitest_1.expect)(diff).toContain('  a');
        (0, vitest_1.expect)(diff).toContain('- b');
        (0, vitest_1.expect)(diff).toContain('+ x');
        (0, vitest_1.expect)(diff).toContain('  c');
    });
    (0, vitest_1.it)('ayni metinlerde fark gostermez', function () {
        var diff = (0, edit_1.showInlineDiff)('a\nb', 'a\nb');
        (0, vitest_1.expect)(diff).not.toContain('-');
        (0, vitest_1.expect)(diff).not.toContain('+');
    });
    (0, vitest_1.it)('bos string calisir', function () {
        var result = (0, edit_1.showInlineDiff)('', '');
        // `''.split('\n')` = `['']`, bir satir oldugu icin `'  '` doner
        (0, vitest_1.expect)(typeof result).toBe('string');
    });
});
