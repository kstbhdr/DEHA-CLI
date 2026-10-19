# Yerel DEHA geliştirme kurulumu

Geliştirme klasörü: `C:\Users\Administrator\DEHA-CLI`.
Global `deha` komutu `npm link` ile bu klasöre bağlıdır.
Kaynak değiştirdikten sonra `npm run build` çalıştırın ve açık DEHA oturumunu yeniden başlatın.

```powershell
cd C:\Users\Administrator\DEHA-CLI
npm run build
npx vitest run --maxWorkers=2
npm run test:local
deha doctor
deha
```

`test:local`, ücretli API çağrısı yapmadan gerçek CLI süreçlerini yerel bir test sağlayıcısıyla çalıştırır. Dosya okuma/yazma, shell, brain, süreç kapatma ve resume, boşluklu yolda Python venv, HTTP testi ve Chromium ekran görüntüsünü kontrol eder. Test dosyalarının konumunu sonunda yazdırır. Python ve Playwright Chromium kurulu olmalıdır.

Gerçek OpenRouter bağlantısı ve dosya okuma/yazma agent akışı ayrıca denenmiştir. API anahtarları `.env` içindedir ve Git'e eklenmez.

Redis/ChromaDB isteğe bağlıdır; yerel dosya belleği bunlar olmadan çalışır. Açılış eksik servisleri varsayılan olarak kurmaz. Otomatik servis başlangıcını kapatmak için `DEHA_AUTO_START_SERVICES=0`; eksik servislerin kurulumuna izin vermek için `DEHA_AUTO_INSTALL_SERVICES=1` kullanılabilir.

Sohbeti korumak için normal şekilde çıkıp `deha resume <id>` kullanın. `/clear` ve `/new` bilerek yeni sohbet başlatır. JSON checkpointleri brain, aktif görev ve araç günlüğünü taşır; Markdown dosyaları okunabilir geçmişi sağlar.
