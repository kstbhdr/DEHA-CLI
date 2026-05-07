/**
 * locale — Çoklu Dil Desteği (i18n)
 *
 * Kullanım:
 *   import { t, setLanguage, getLanguage } from './services/locale';
 *   console.log(t('welcome'));
 *   setLanguage('en');
 *
 * Ortam değişkeni:
 *   DEHA_LANG=tr    # Türkçe (varsayılan)
 *   DEHA_LANG=en    # English
 */

export type Language = 'tr' | 'en';

// ─── Dil Tanımları ──────────────────────────────────────────────────────────

type LocaleMessages = Record<string, string | ((...args: string[]) => string)>;

const TR: LocaleMessages = {
  // Genel
  welcome: 'DEHA\'ya hoş geldin!',
  goodbye: 'Görüşürüz! 👋',
  loading: 'Yükleniyor...',
  error_occurred: 'Bir hata oluştu',
  warning: 'Uyarı',
  success: 'Başarılı',
  failed: 'Başarısız',
  processing: 'İşleniyor...',
  done: 'Tamamlandı ✅',
  skip: 'Atlandı',
  confirm: 'Onayla',
  cancel: 'İptal',
  yes: 'Evet',
  no: 'Hayır',

  // Komutlar
  cmd_not_found: 'Komut bulunamadı: {cmd}',
  cmd_help: 'Yardım',
  cmd_exit: 'Çıkış',
  cmd_agent: 'Ajan modu',
  cmd_judge: 'Değerlendir',
  cmd_help_text: `Mevcut komutlar:
  /exit   — Çıkış
  /help   — Bu yardım mesajı
  /agent <görev>  — Otonom ajan modu
  /judge <dosya> <görev>  — Kod değerlendirme
  /model  — Model ayarları
  /oldconversations  — Geçmiş sohbetler`,

  // Agent
  agent_start: '🧠 Ajan modu başlatılıyor...',
  agent_mcp_active: '{count} MCP aracı aktif',
  agent_thinking: 'DEHA düşünüyor...',
  agent_done: '✅ Görev tamamlandı',
  agent_interrupted: '🛑 İptal edildi - ESC',

  // Hata mesajları
  err_network: 'İnternet bağlantını kontrol et. Servis çalışıyor mu? Proxy/firewall var mı?',
  err_auth: 'API anahtarını kontrol et. `.env` dosyanda doğru tanımlandığından emin ol. `deha doctor` ile test edebilirsin.',
  err_api: 'API sağlayıcında geçici bir sorun olabilir. Birkaç saniye sonra tekrar dene.',
  err_validation: 'Girdiğin değerleri kontrol et. Eksik veya hatalı parametre olabilir.',
  err_system: 'Dosya/dizin izinlerini kontrol et. Gerekli bağımlılıklar kurulu mu?',
  err_unknown: 'Beklenmeyen bir hata oluştu. `deha doctor` ile sistemini kontrol et.',

  // Doctor
  doctor_title: '🔍 DEHA Diagnostic Report',
  doctor_system: 'System Checks',
  doctor_config: 'Configuration Checks',
  doctor_env: 'Environment Checks',
  doctor_results: '{emoji} Results: {passed} passed, {failed} failed, {warnings} warnings ({total} total)',
  doctor_tip: 'Tip: Fix the failed checks first, then re-run deha doctor',

  // Judge
  judge_running: '⚖️  JUDGE çalışıyor... [Dosya: {file}]',
  judge_pass: '✓ PASS',
  judge_fail: '✗ FAIL',
  judge_score: 'Skor: {score}',

  // Context
  context_loaded: '↩ Önceki oturumdan {count} mesaj yüklendi.',
  context_compressed: '📦 Context compressed — {count} mesaj korundu, ~{pct}% kullanım',
  context_last: '─── Son Konuşmalar ─────────────────────────────────',

  // Setup
  setup_title: '═══ DEHA Kurulum & Bağlantı Testi ═══',
  setup_active: 'Aktif Provider: {provider}',
  setup_connected: '✓ Bağlantı başarılı! DEHA kullanıma hazır.',
  setup_failed: '✗ Bağlantı kurulamadı.',
  setup_suggestions: 'Çözüm önerileri:',

  // Init
  init_title: '⚡ DEHA Project Initialization',
  init_skip_env: 'Skipped .env',
  init_api_keys: 'API Keys (leave blank to skip)',
  init_env_updated: '.env updated',
  init_mcp_exists: 'mcp.json already exists',
  init_mcp_created: 'mcp.json created',
  init_dependencies: 'Dependencies',
  init_complete: '✅ DEHA initialization complete!',
  init_doctor_hint: 'Run deha doctor to verify setup',

  // Update
  update_title: '═══ DEHA Güncelleme ═══',
  update_current: 'Mevcut sürüm: v{version}',
  update_latest: '✓ En güncel sürümü kullanıyorsun (v{version})',
  update_new: 'Yeni sürüm bulundu: v{old} → v{new}',
  update_downloading: 'Güncelleniyor...',
  update_done: '✓ DEHA güncellendi! Terminali yeniden başlat.',
  update_manual: 'Manuel güncelleme:',
};

const EN: LocaleMessages = {
  // General
  welcome: 'Welcome to DEHA!',
  goodbye: 'Goodbye! 👋',
  loading: 'Loading...',
  error_occurred: 'An error occurred',
  warning: 'Warning',
  success: 'Success',
  failed: 'Failed',
  processing: 'Processing...',
  done: 'Done ✅',
  skip: 'Skipped',
  confirm: 'Confirm',
  cancel: 'Cancel',
  yes: 'Yes',
  no: 'No',

  // Commands
  cmd_not_found: 'Command not found: {cmd}',
  cmd_help: 'Help',
  cmd_exit: 'Exit',
  cmd_agent: 'Agent mode',
  cmd_judge: 'Judge',
  cmd_help_text: `Available commands:
  /exit   — Exit
  /help   — Show this help
  /agent <task>  — Autonomous agent mode
  /judge <file> <task>  — Code evaluation
  /model  — Model settings
  /oldconversations  — Past conversations`,

  // Agent
  agent_start: '🧠 Starting agent mode...',
  agent_mcp_active: '{count} MCP tools active',
  agent_thinking: 'DEHA thinking...',
  agent_done: '✅ Task completed',
  agent_interrupted: '🛑 Canceled - ESC',

  // Error messages
  err_network: 'Check your internet connection. Is the service running? Any proxy/firewall?',
  err_auth: 'Check your API key. Make sure it is correctly defined in `.env`. Run `deha doctor` to test.',
  err_api: 'There might be a temporary issue with the API provider. Try again in a few seconds.',
  err_validation: 'Check your input values. There may be missing or invalid parameters.',
  err_system: 'Check file/directory permissions. Are required dependencies installed?',
  err_unknown: 'An unexpected error occurred. Run `deha doctor` to check your system.',

  // Doctor
  doctor_title: '🔍 DEHA Diagnostic Report',
  doctor_system: 'System Checks',
  doctor_config: 'Configuration Checks',
  doctor_env: 'Environment Checks',
  doctor_results: '{emoji} Results: {passed} passed, {failed} failed, {warnings} warnings ({total} total)',
  doctor_tip: 'Tip: Fix the failed checks first, then re-run deha doctor',

  // Judge
  judge_running: '⚖️  JUDGE running... [File: {file}]',
  judge_pass: '✓ PASS',
  judge_fail: '✗ FAIL',
  judge_score: 'Score: {score}',

  // Context
  context_loaded: '↩ Loaded {count} messages from previous session.',
  context_compressed: '📦 Context compressed — {count} messages kept, ~{pct}% usage',
  context_last: '─── Last Conversations ─────────────────────────────',

  // Setup
  setup_title: '═══ DEHA Setup & Connection Test ═══',
  setup_active: 'Active Provider: {provider}',
  setup_connected: '✓ Connection successful! DEHA is ready.',
  setup_failed: '✗ Connection failed.',
  setup_suggestions: 'Suggestions:',

  // Init
  init_title: '⚡ DEHA Project Initialization',
  init_skip_env: 'Skipped .env',
  init_api_keys: 'API Keys (leave blank to skip)',
  init_env_updated: '.env updated',
  init_mcp_exists: 'mcp.json already exists',
  init_mcp_created: 'mcp.json created',
  init_dependencies: 'Dependencies',
  init_complete: '✅ DEHA initialization complete!',
  init_doctor_hint: 'Run deha doctor to verify setup',

  // Update
  update_title: '═══ DEHA Update ═══',
  update_current: 'Current version: v{version}',
  update_latest: '✓ You are using the latest version (v{version})',
  update_new: 'New version found: v{old} → v{new}',
  update_downloading: 'Updating...',
  update_done: '✓ DEHA updated! Restart your terminal.',
  update_manual: 'Manual update:',
};

// ─── Aktif Dil ──────────────────────────────────────────────────────────────

let _currentLang: Language = 'tr';

const LOCALES: Record<Language, LocaleMessages> = { tr: TR, en: EN };

export function getLanguage(): Language {
  return _currentLang;
}

export function setLanguage(lang: Language): void {
  if (LOCALES[lang]) {
    _currentLang = lang;
  }
}

// Ortam değişkeninden dil ayarla
const envLang = (process.env.DEHA_LANG || 'tr').toLowerCase();
if (envLang === 'en' || envLang === 'tr') {
  _currentLang = envLang;
}

// ─── Çeviri Fonksiyonu ──────────────────────────────────────────────────────

/**
 * Bir anahtarın çevirisini döndürür.
 * Değişkenler: t('welcome', { name: 'Ali' }) → "{name}" → "Ali"
 * Basit:       t('done') → "Tamamlandı ✅"
 */
export function t(key: string, vars?: Record<string, string>): string {
  const locale = LOCALES[_currentLang];
  let msg = locale[key];
  if (msg === undefined) {
    // Fallback: önce İngilizce'ye, yoksa anahtarın kendisine
    msg = EN[key];
    if (msg === undefined) return key;
  }
  if (typeof msg === 'function') {
    return (msg as (...args: string[]) => string)();
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = (msg as string).replace(`{${k}}`, v);
    }
  }
  return msg as string;
}
