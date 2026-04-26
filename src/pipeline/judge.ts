import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const JUDGE_SYSTEM = `Sen kıdemli bir code reviewer ve yazılım kalite mühendisisin. Sana bir görev, plan ve yazılan kod verilecek.

Kodu şu kriterlere göre değerlendir:
1. Görev gereksinimlerini tam karşılıyor mu?
2. Syntax ve mantık hataları var mı?
3. Edge case'ler ele alınmış mı?
4. Hata yönetimi yeterli mi?
5. Kod okunabilir ve sürdürülebilir mi?
6. Güvenlik açığı var mı?

Yanıtını MUTLAKA şu formatta ver:

VERDICT: PASS
(veya)
VERDICT: FAIL

SCORE: 8/10

## GÜÇLÜ YÖNLER
- [iyi olan şeyler]

## EKSİKLİKLER
- [sorunlar, varsa]

## GEREKLİ DÜZELTİMLER
- [FAIL ise coder'ın yapması gereken spesifik değişiklikler]
- [PASS ise boş bırak]

## GENEL YORUM
[Tek paragraflık özet]

ÖNEMLI: İlk satır kesinlikle "VERDICT: PASS" veya "VERDICT: FAIL" olsun.`;

export interface JudgeVerdict {
  pass: boolean;
  score: string;
  feedback: string;
  raw: string;
}

export async function runJudge(
  task: string,
  plan: string,
  code: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
): Promise<JudgeVerdict> {
  const { pipeline } = config;

  const userContent =
    `## ORİJİNAL GÖREV\n${task}\n\n` +
    `## PLANNER'IN PLANI\n${plan}\n\n` +
    `## CODER'IN YAZDIĞI KOD\n\`\`\`\n${code}\n\`\`\``;

  const messages: Message[] = [{ role: 'user', content: userContent }];

  const raw = await callRole(pipeline.judge, config, messages, JUDGE_SYSTEM, onChunk);

  return parseVerdict(raw);
}

function parseVerdict(raw: string): JudgeVerdict {
  const passMatch  = /VERDICT:\s*(PASS|FAIL)/i.exec(raw);
  const scoreMatch = /SCORE:\s*([\d.]+\/10)/i.exec(raw);

  const pass = passMatch ? passMatch[1].toUpperCase() === 'PASS' : false;
  const score = scoreMatch ? scoreMatch[1] : '?/10';

  // "GEREKLİ DÜZELTİMLER" bölümünü çıkar
  const fixSection = raw.match(/## GEREKLİ DÜZELTİMLER\n([\s\S]*?)(?=##|$)/i);
  const feedback = fixSection ? fixSection[1].trim() : raw;

  return { pass, score, feedback, raw };
}
