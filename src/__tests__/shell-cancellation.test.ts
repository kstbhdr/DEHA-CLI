import { describe, expect, it } from 'vitest';
import { executeToolAsync } from '../tools';

describe('Terminal komutları giriş döngüsünü kilitlemez', () => {
  it.each(['run_shell', 'run_terminal'])('%s çalışırken ESC sinyalini işleyip komutu durdurur', async name => {
    const abort = new AbortController();
    let responsive = false;
    const timer = setTimeout(() => { responsive = true; abort.abort(); }, 100);
    const result = await executeToolAsync(name, {
      command: `"${process.execPath}" -e "setTimeout(() => console.log('finished'), 2000)"`, timeout: 5,
    }, undefined, abort.signal);
    clearTimeout(timer);
    expect(responsive).toBe(true);
    expect(result).toContain('kullanıcı tarafından durduruldu');
    expect(result).not.toContain('finished');
  });
});
