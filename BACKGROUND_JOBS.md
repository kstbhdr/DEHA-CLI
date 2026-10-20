# Uzun süren işler ve hızlı geri dönüş

DEHA, uzun komutları bir kez başlatıp bir görev kimliğiyle izleyebilir. Model dosyası kopyalama/indirme, eğitim, build ve test için `start_job` kullanılır. Normal `run_shell` ve `run_terminal` araçları çalışmaya devam eder.

`start_job` içine verilen komut kendi içinde `nohup ... &` ile tekrar arka plana atılmamalıdır; supervisor arka plana alma işini zaten yapar. Gerçek komut bitene kadar ön planda kalmalıdır ki çıkış kodu doğru takip edilsin.

| Araç | İşlev |
|---|---|
| `start_job({command, cwd?, timeout?, wait_for_completion?})` | Komutu başlatır ve `job_id` döndürür. Zaman aşımı varsayılan 3600, en fazla 86400 saniyedir. |
| `wait_job({job_id, wait_seconds?})` | Varsayılan 30, en fazla 60 saniye yerelde bekler; durum, çıkış kodu ve yalnızca yeni çıktıyı döndürür. `0` anlık kontrol yapar. |
| `list_jobs({})` | Aktif projenin çalışan ve bitmiş işlerini listeler. |
| `cancel_job({job_id})` | İşi ve alt süreç ağacını durdurur. |

Bekleme sırasında model API'sine periyodik istek gönderilmez. Süreç durumu yerelde takip edilir; model araç döndükten sonra tekrar çağrılır. Modelin araç seçimi hâlâ modele bağlıdır; bu özellik toplam tur sayısına garanti vermez. Gereksiz `ls/cat/grep` kontrolleri yerine aynı işi `wait_job` ile beklemesi için talimat eklenir.

Görevin bitmesi için gereken işler çalışıyorken modelin `COMPLETE` diyerek turu bitirmesi kabul edilmez. Üç hatırlatmadan sonra da beklemiyorsa görev tamamlandı sayılmadan `INTERRUPTED` olarak bırakılır. `wait_for_completion=false`, yalnızca kullanıcının açıkça çalışır bırakılmasını istediği sunucu gibi servisler içindir.

Çıkış kodu `0` tek başına kopyalanan modelin eksiksiz olduğunu kanıtlamaz; shard manifesti, dosya sayısı ve beklenen boyutlar ayrıca doğrulanmalıdır. Önceden başka şekilde başlatılmış bir kopyalamayı tekrar başlatmak yerine, bilinen PID/tamamlanma işaretini bekleyen bir izleyici komut takip edilen iş olarak başlatılabilir. İzleyicinin başarılı bitmesi asıl kopyalamanın çıkış kodu yerine geçmez.

## Kullanıcı komutları

CLI içinde `/jobs`, `/jobs wait <id> [saniye]`, `/jobs cancel <id>` kullanılabilir. Bunlar model/API çağrısı yapmaz. `/jobs` komutları agent çalışırken de kullanılabilir. Beklemeyi ESC ile kesmek arka plan işini durdurmaz; durdurmak için `/jobs cancel <id>` gerekir.

Terminalden aynı komutlar `deha jobs`, `deha jobs wait <id> 30`, `deha jobs cancel <id>` olarak çalışır. İşin başlatıldığı proje dizininden çalıştırın.

Durum ve çıktılar `<aktif proje>/.deha/jobs/<job_id>/` altında tutulur. Ayrı supervisor süreci, CLI kapansa veya zorla sonlandırılsa da işi takip eder. İş, bitene/iptal edilene/zaman aşımına kadar çalışır. Supervisor bulunamazsa durum `lost` olarak raporlanır, başarılı sayılmaz. Makine veya Colab çalışma zamanı tamamen silinirse süreçler korunamaz.

Her çıktı akışı diskte 10 MiB ile sınırlıdır; fazlası atılır ve `output_truncated` işaretlenir. Araç cevabına akış başına en fazla 16000 yeni byte alınır; taşmada son kısım ve `truncated` bilgisi döner. Aynı projede en fazla 8 aktif iş başlatılabilir.

## Yeni araçları hemen kapatmak

Linux/Colab:

```bash
DEHA_BACKGROUND_JOBS=0 deha
```

PowerShell:

```powershell
$env:DEHA_BACKGROUND_JOBS='0'
deha
```

Bu ayar yeni araçları modelden gizler ve yeni iş talimatlarını/erken tamamlandı korumasını kapatır. Önceden başlatılmış işleri iptal etmez; `deha jobs` ile yönetebilirsiniz. Kalıcı yapmak için `.env` dosyasına `DEHA_BACKGROUND_JOBS=0` ekleyin. Yeniden açmak için `1` kullanın veya ayarı kaldırın.

## Önceki kod sürümüne dönmek

Eski kaynak kodu Git etiketiyle korunur: `backup/pre-background-jobs-20261020-161904` (`52c7cdd`). Yerel değişiklik varsa önce saklayın; `git switch` bunları ezmeye zorlanmaz.

```bash
cd /content/DEHA-CLI
git fetch origin --tags
git switch --detach backup/pre-background-jobs-20261020-161904
npm run build && npm link --ignore-scripts
deha
```

Yeni sürüme dönmek: `git switch main && git pull --ff-only origin main && npm run build && npm link --ignore-scripts`.

Windows geliştirme makinesindeki tam yedek ayrıca `C:\Users\Administrator\deha-backups\before-background-jobs-20261020-161904` içindedir. `restore.ps1` bağımlılık indirmeden global `deha` komutunu bu yedeğe bağlar. Projenin güncel sohbet/ayar dosyaları otomatik olarak eski kopyayla değiştirilmez.

## Doğrulama

`npm run build`, `npm test`, `node scripts/background-jobs-smoke.cjs` ve `node scripts/background-agent-smoke.cjs`. Testler yerel sahte sağlayıcı kullanır, ücretli API çağırmaz.
