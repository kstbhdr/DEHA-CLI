# Yerel DEHA geliştirme kurulumu

Her sohbetin brain, tampon ve özeti ilgili proje içinde ayrı saklanır:
`.deha/sessions/<sohbet-id>/brain.md`, `session-buffer.json` ve `summary.md`.
Aynı projede açılan iki agent da farklı sohbet kimlikleri ve farklı dosyalar kullanır.
Başlangıçta brain dosyasının tam yolu gösterilir. Proje yolu sohbet sırasında değişirse
sonraki kayıtlar o proje içindeki aynı sohbet klasörüne yazılır.

Düz `deha`, `/new` ve `/clear` temiz sohbet başlatır. `deha resume <id>` sohbetin
kendi proje dizinini ve hafızasını geri yükler. Aktif sohbeti başka bir süreçte tekrar
açmak veya aynı `DEHA_SESSION_SCOPE` ile eşzamanlı yazmak engellenir.
Redis/vektör hafızası da sohbet ve projeye göre ayrılır; global eski brain/özet
dosyaları yeni sohbetlere otomatik aktarılmaz. Eski kayıtlar silinmez; eski JSON'da
workspace eksikse, açıkça devam ettirilen eski oturum için eski brain dosyası kurtarılabilir.
Önceden birbirine karışmış bir kaydın içeriği otomatik ayrıştırılmaz.

`/oldconversations` ve araması aktif projeyle sınırlıdır. Diğer projelerin ve proje
etiketi olmayan eski sohbetlerin listesi açıkça `/oldconversations all` ile görülebilir.
Sohbet ID'leri UUID içerir; aynı saniyede başlatılan agentlar aynı kayda yazmaz.

`npm run build` ardından `node scripts/isolation-smoke.cjs`, gerçek paralel süreçlerle
brain/tampon ayrımını, proje değişimini, aktif sohbete ikinci erişimin reddini ve
zorla kapatılan sohbetin kendi projesinde kurtarılmasını test eder.

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

Çalışma sırasında her mesaj ve workspace güncellemesi, proje tamponuna ek olarak `~/.deha/conversations/<id>.session.json` dosyasına yazılır. Agent turu tamamlanmasa bile `/oldconversations` bu kaydı listeler; `resume` tam araç çağrılarını ve brain bilgisini yükler. Yerel tampon ve yedeği okunamazsa aynı proje dizinine ait en son global checkpoint denenir. Global checkpointin de `.bak` yedeği vardır. Bu kayıtlar makinenin diskindedir; Colab çalışma zamanı sıfırlanmasına karşı ayrıca Drive yedeği gerekir.

`npm run build` ardından `node scripts/recovery-smoke.cjs`, izole geçici dizinde gerçek süreci zorla kapatıp yeniden açar; görev/brain/araç kayıtlarını ve bozuk yerel tampondan kurtarmayı doğrular.

DEHA çalışırken yeni mesajı yazıp Enter'a basabilirsiniz. Mesajlar mevcut turu değiştirmeden sıraya alınır ve tur tamamlandıktan sonra tek tek işlenir. `/queue` bekleyenleri gösterir; `/queue remove 2` ikinci bekleyeni kaldırır; `/queue clear` bekleyenleri temizler. ESC mevcut agent turunu iptal eder; bekleyen mesajların işlenmesi devam eder. Diğer komutlar da sırayla çalışır. Bekleyen metinler çalıştırılana kadar model geçmişine eklenmez ve checkpointlerde saklanır; yeniden açılışta sırayla işlenir.

`node scripts/queue-smoke.cjs`, ücretli API kullanmadan gerçek CLI'de iş sürerken mesaj gönderme, sıra yönetimi, UTF-8 çok satırlı yapıştırma ve araç sonuçları sonrasında mesaj sırasını doğrular.
