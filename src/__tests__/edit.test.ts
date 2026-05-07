import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { editFile, insertLines, deleteLines, parseEditBlocks, applyEditBlocks, showInlineDiff } from '../tools/edit';

describe('editFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFileSync).mockReturnValue('satir 1\nsatir 2\nsatir 3\n');
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('eski metni yenisiyle degistirir', () => {
    const result = editFile({ path: 'test.txt', old_string: 'satir 2', new_string: 'degisti' });
    expect(result).toContain('Düzenlendi');
    expect(result).toContain('1 değişiklik');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      'satir 1\ndegisti\nsatir 3\n',
      'utf-8'
    );
  });

  it('replace_all ile tumunu degistirir', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('x\ny\nx\n');
    const result = editFile({ path: 'test.txt', old_string: 'x', new_string: 'z', replace_all: true });
    expect(result).toContain('2 değişiklik');
  });

  it('dosya yoksa hata dondurur', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = editFile({ path: 'yok.txt', old_string: 'x', new_string: 'y' });
    expect(result).toContain('HATA');
    expect(result).toContain('bulunamadı');
  });

  it('eski metin bulunamazsa hata dondurur', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('farklı içerik\n');
    const result = editFile({ path: 'test.txt', old_string: 'bulunamaz', new_string: 'y' });
    expect(result).toContain('HATA');
    expect(result).toContain('bulunamadı');
  });

  it('bos old_string ile calisir', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('icerik\n');
    const result = editFile({ path: 'test.txt', old_string: '', new_string: 'basa_ek' });
    // Boş string her satırda var, replace_all ile tüm satırları değiştirir
    // Ama varsayılan replace_all=false, ilk geçeni değiştirir
    expect(result).toContain('Düzenlendi');
  });
});

describe('insertLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFileSync).mockReturnValue('satir 1\nsatir 2\n');
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('satir 0 a (basa) ekleme yapar', () => {
    const result = insertLines({ path: 'test.txt', line: 0, content: 'basa\nsatir' });
    expect(result).toContain('2 satır eklendi');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      'basa\nsatir\nsatir 1\nsatir 2\n',
      'utf-8'
    );
  });

  it('ortaya satir ekler', () => {
    const result = insertLines({ path: 'test.txt', line: 2, content: 'yeni satir' });
    expect(result).toContain('1 satır eklendi');
  });

  it('dosya yoksa hata dondurur', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = insertLines({ path: 'yok.txt', line: 1, content: 'test' });
    expect(result).toContain('HATA');
  });
});

describe('deleteLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFileSync).mockReturnValue('s1\ns2\ns3\ns4\n');
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('satirlari siler', () => {
    const result = deleteLines({ path: 'test.txt', from_line: 2, to_line: 3 });
    expect(result).toContain('2 satır silindi');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      's1\ns4\n',
      'utf-8'
    );
  });

  it('dosya yoksa hata dondurur', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = deleteLines({ path: 'yok.txt', from_line: 1, to_line: 1 });
    expect(result).toContain('HATA');
  });
});

describe('parseEditBlocks', () => {
  it('EDIT bloklarini parse eder', () => {
    const text = `EDIT: src/test.ts\n<<<OLD>>>\neski kod\n<<<NEW>>>\nyeni kod\n<<<END>>>`;
    const blocks = parseEditBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].file).toBe('src/test.ts');
    expect(blocks[0].oldStr).toBe('eski kod\n');
    expect(blocks[0].newStr).toBe('yeni kod\n');
  });

  it('birden cok EDIT blogu parse eder', () => {
    const text = `EDIT: a.ts\n<<<OLD>>>\na\n<<<NEW>>>\nb\n<<<END>>>\nEDIT: c.ts\n<<<OLD>>>\nc\n<<<NEW>>>\nd\n<<<END>>>`;
    const blocks = parseEditBlocks(text);
    expect(blocks).toHaveLength(2);
  });

  it('EDIT blogu yoksa bos dizi dondurur', () => {
    expect(parseEditBlocks('normal text')).toEqual([]);
  });
});

describe('applyEditBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('eski\n');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  it('bloklari sirayla uygular', () => {
    const blocks = [{ file: 'test.txt', oldStr: 'eski', newStr: 'yeni' }];
    const results = applyEditBlocks(blocks);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Düzenlendi');
  });
});

describe('showInlineDiff', () => {
  it('farkli satirlari gosterir', () => {
    const diff = showInlineDiff('a\nb\nc', 'a\nx\nc');
    expect(diff).toContain('  a');
    expect(diff).toContain('- b');
    expect(diff).toContain('+ x');
    expect(diff).toContain('  c');
  });

  it('ayni metinlerde fark gostermez', () => {
    const diff = showInlineDiff('a\nb', 'a\nb');
    expect(diff).not.toContain('-');
    expect(diff).not.toContain('+');
  });

  it('bos string calisir', () => {
    const result = showInlineDiff('', '');
    // `''.split('\n')` = `['']`, bir satir oldugu icin `'  '` doner
    expect(typeof result).toBe('string');
  });
});
