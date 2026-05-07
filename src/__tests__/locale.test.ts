import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('locale', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEHA_LANG;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('varsayılan dil Türkçedir', async () => {
    const { getLanguage, t } = await import('../services/locale');
    expect(getLanguage()).toBe('tr');
    expect(t('done')).toBe('Tamamlandı ✅');
  });

  it('DEHA_LANG=en ile İngilizce aktif olur', async () => {
    process.env.DEHA_LANG = 'en';
    const { getLanguage, t } = await import('../services/locale');
    expect(getLanguage()).toBe('en');
    expect(t('done')).toBe('Done ✅');
  });

  it('setLanguage ile dil değiştirilebilir', async () => {
    const { setLanguage, getLanguage, t } = await import('../services/locale');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(t('welcome')).toBe('Welcome to DEHA!');
    setLanguage('tr');
    expect(t('welcome')).toBe('DEHA\'ya hoş geldin!');
  });

  it('değişken içeren mesajlar doğru formatlanır', async () => {
    const { t } = await import('../services/locale');
    const msg = t('context_loaded', { count: '5' });
    expect(msg).toContain('5');
    expect(msg).toContain('mesaj');
  });

  it('birden çok değişken içeren mesajlar', async () => {
    const { t } = await import('../services/locale');
    const msg = t('doctor_results', {
      emoji: '🎉',
      passed: '10',
      failed: '2',
      warnings: '1',
      total: '13',
    });
    expect(msg).toContain('🎉');
    expect(msg).toContain('10 passed');
    expect(msg).toContain('13 total');
  });

  it('karmaşık mesaj cmd_help_text Türkçe döner', async () => {
    const { t } = await import('../services/locale');
    const help = t('cmd_help_text');
    expect(help).toContain('/exit');
    expect(help).toContain('Otonom ajan modu');
  });

  it('geçersiz anahtar anahtarın kendisini döndürür', async () => {
    const { t } = await import('../services/locale');
    expect(t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz');
  });
});
