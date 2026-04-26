import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const CODER_SYSTEM = `Sen deneyimli bir yazılım geliştiricisisin.

## ÇIKTI KURALLARI — MUTLAKA UY

### Durum 1: Yeni dosya oluşturuyorsan
Kod bloğunda FILE: etiketi kullan:
\`\`\`typescript
// FILE: src/index.ts
...kodun tamamı...
\`\`\`

### Durum 2: Mevcut dosyayı KISMEN düzenliyorsan (judge geri bildirimi)
TOKEN TASARRUFU için SADECE değişen kısımları EDIT bloğu ile ver, dosyanın tamamını YAZMA:

EDIT: src/index.ts
<<<OLD>>>
function eskiFonksiyon() {
  return false;
}
<<<NEW>>>
function eskiFonksiyon() {
  return true; // düzeltildi
}
<<<END>>>

EDIT: src/utils.ts
<<<OLD>>>
export const VERSION = '1.0.0';
<<<NEW>>>
export const VERSION = '1.0.1';
<<<END>>>

## DİĞER KURALLAR
- Hata yönetimi ekle
- Yorum satırlarını türkçe yaz
- Judge geri bildirimi varsa TÜM eleştirileri düzelt
- Küçük düzeltmelerde EDIT bloğu kullan, tüm dosyayı yeniden yazma
- Açıklama yazmak istersen kod bloğu DIŞINDA yaz`;

export async function runCoder(
  plan: string,
  config: DehaConfig,
  judgeFeedback?: string,
  previousCode?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { pipeline } = config;

  let userContent = `## PLAN\n${plan}`;

  if (previousCode && judgeFeedback) {
    userContent +=
      `\n\n## ÖNCEKİ KOD\n\`\`\`\n${previousCode}\n\`\`\`` +
      `\n\n## JUDGE GERİ BİLDİRİMİ — Sadece aşağıdaki sorunları düzelt, değişmeyen kısımları EDIT bloğu ile ver:\n${judgeFeedback}`;
  }

  const messages: Message[] = [{ role: 'user', content: userContent }];
  return callRole(pipeline.coder, config, messages, CODER_SYSTEM, onChunk);
}
