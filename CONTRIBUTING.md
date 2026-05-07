# Katkıda Bulunma Rehberi

DEHA-CLI'ya katkıda bulunduğun için teşekkürler! 🎉

## İçindekiler

- [Geliştirme Ortamı](#geliştirme-ortamı)
- [Proje Yapısı](#proje-yapısı)
- [Commit Kuralları](#commit-kuralları)
- [Test](#test)
- [Pull Request Süreci](#pull-request-süreci)
- [Kod Standartları](#kod-standartları)
- [Hata Raporlama](#hata-raporlama)

## Geliştirme Ortamı

```bash
# 1. Fork'la ve clone'la
git clone https://github.com/<senin-kullanıcın>/DEHA-CLI.git
cd DEHA-CLI

# 2. Bağımlılıkları yükle
npm install

# 3. .env dosyasını oluştur
cp .env.example .env
# API key'lerini ekle (en az 1 tane yeterli)

# 4. Build al
npm run build

# 5. Global link (isteğe bağlı)
npm link

# 6. Test et
npm test
```

**Not:** Playwright bağımlılığı için `npx playwright install chromium` gerekebilir.

## Proje Yapısı

```
src/
├── cli.ts                 # CLI giriş noktası (Commander)
├── config.ts              # Config okuma (env + override)
├── index.ts               # Ana modül export'ları
├── version.ts             # Versiyon yönetimi
├── prompts.config.ts      # System prompt'ları
├── commands/              # CLI komutları
│   ├── agent.ts           # Agent modu (tool calling)
│   ├── chat.ts            # Tek seferlik chat
│   ├── diff.ts            # Diff görüntüleme
│   ├── doctor.ts          # Sistem durumu
│   ├── init.ts            # Proje başlatma
│   ├── interactive.ts     # İnteraktif terminal
│   ├── model-setup.ts     # Model yapılandırma
│   ├── setup.ts           # Kurulum
│   ├── test-runner.ts     # Test koşucu
│   └── update.ts          # Güncelleme
├── services/              # Servis katmanı
│   ├── ai-service.ts      # AI API çağrıları
│   ├── cache.ts           # Önbellek
│   ├── context.ts         # Proje context yönetimi
│   ├── error-handler.ts   # Global hata yakalama
│   ├── intent.ts          # Niyet analizi
│   ├── logger.ts          # Loglama
│   ├── memory.ts          # Redis/ChromaDB long-term memory
│   ├── process-manager.ts # ChromaDB süreç yönetimi
│   ├── session-memory.ts  # Session bellek (context compression)
│   ├── token-counter.ts   # Token sayma
│   └── usage-tracker.ts   # Kullanım takibi
├── tools/                 # AI tool tanımları
│   ├── index.ts           # Tool tanımları + güvenlik filtresi
│   ├── browser.ts         # Browser automation
│   ├── edit.ts            # Dosya düzenleme (edit_file, insert_lines, delete_lines)
│   ├── python.ts          # Python çalıştırma
│   ├── search.ts          # Web arama + URL crawl
│   ├── smoke.ts           # HTTP smoke test
│   ├── terminal.ts        # Terminal komutu
│   └── vision.ts          # Vision analiz
├── mcp/                   # MCP (Model Context Protocol) yönetimi
├── pipeline/              # Plan → Code → Judge pipeline
│   ├── orchestrator.ts
│   ├── planner.ts
│   ├── coder.ts
│   └── judge.ts
└── conversations/         # Konuşma geçmişi yönetimi
```

## Commit Kuralları

Conventional Commits formatı kullanıyoruz:

```
<tip>: <kısa açıklama>

<opsiyonel: detaylı açıklama>
```

**Tipler:**
| Tip | Ne zaman kullanılır |
|-----|-------------------|
| `feat` | Yeni özellik |
| `fix` | Hata düzeltmesi |
| `docs` | Dokümantasyon değişikliği |
| `test` | Test ekleme/düzeltme |
| `refactor` | Kod yeniden düzenleme (bug fix veya feature değil) |
| `perf` | Performans iyileştirmesi |
| `ci` | CI/CD değişikliği |
| `chore` | Altyapı, bağımlılık, build süreci |

**Örnekler:**
```
feat: add ESC key abort for agent mode
fix(agent): handle empty tool response gracefully
test: add security filter tests (16 test)
docs: add CONTRIBUTING.md
refactor: extract token estimation to separate module
```

## Test

Testler **vitest** ile yazılır.

```bash
# Tüm testleri çalıştır
npm test

# İzleme modu (geliştirme sırasında)
npm run test:watch

# Coverage raporu
npm run test:coverage

# Belirli test dosyası
npx vitest run src/__tests__/security.test.ts
```

**Test yazma kuralları:**

1. Her `services/*.ts` ve `tools/*.ts` dosyası için test yazılmalıdır
2. Test dosyası `src/__tests__/<modül-adı>.test.ts` şeklinde adlandırılır
3. Harici bağımlılıklar (Redis, ChromaDB, API) `vi.mock()` ile mock'lanır
4. Her test fonksiyonu tek bir davranışı test eder
5. Test isimleri Türkçe veya İngilizce olabilir, tutarlı olmalıdır
6. `describe` blokları ile testler gruplanır
7. False positive'leri önlemek için güvenlik testleri özellikle önemlidir

**Mevcut test dosyaları:**
| Dosya | Test sayısı | Kapsam |
|-------|:-----------:|--------|
| `token-counter.test.ts` | 20 | Token tahmini, context window |
| `config.test.ts` | 15 | Config okuma, env, provider |
| `security.test.ts` | 16 | Güvenlik filtresi (isSafeCommand) |
| `context.test.ts` | 10 | Proje context, dosya tarama |
| `error-handler.test.ts` | 6 | Hata formatlama |
| `memory.test.ts` | 5 | Redis/in-memory bellek |
| `session-memory.test.ts` | 11 | Session yönetimi, compression |
| **Toplam** | **83** | |

## Pull Request Süreci

1. **Branch:** `feature/<kısa-açıklama>` veya `fix/<kısa-açıklama>`
2. **Commit:** Conventional Commits formatında, anlamlı mesajlar
3. **Test:** Tüm testler geçmeli (`npm test`)
4. **TypeScript:** `npx tsc --noEmit` hatasız çalışmalı
5. **Build:** `npm run build` başarılı olmalı
6. **PR başlığı:** Commit mesajı formatında (örn. `feat: add new feature`)
7. **PR açıklaması:** Ne değişti, neden değişti, nasıl test edildi

## Kod Standartları

- **TypeScript strict mode** kullanılır
- `any` tipinden kaçının, mümkünse somut tipler kullanın
- `console.log` yerine `structured logger` yakında eklenecek
- Hata mesajları Türkçe olabilir (kullanıcıya dönük)
- Import sırası: Node built-in → npm paketleri → yerel modüller
- Fonksiyon isimleri camelCase, tipler PascalCase, sabitler UPPER_CASE

## Hata Raporlama

Issue açarken:
1. DEHA versiyonu (`deha --version`)
2. Node.js versiyonu
3. İşletim sistemi
4. Provider ve model adı
5. Tam hata mesajı (stack trace)
6. Adım adım tekrarlama talimatı
