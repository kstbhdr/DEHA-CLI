import chalk from 'chalk';
import { DehaConfig } from '../config';
import { callRole, Message } from '../services/ai-service';

const PLANNER_SYSTEM = `Sen bir yazılım mimarısın. Kullanıcıdan gelen görevi analiz edip yapılandırılmış bir uygulama planı çıkarırsın.

Çıktın MUTLAKA şu formatta olsun:

## GÖREV ANALİZİ
[Görevin ne olduğunu 2-3 cümleyle özetle]

## GEREKSINIMLER
[Fonksiyonel ve teknik gereksinimler maddeler halinde]

## MİMARİ KARAR
[Hangi teknoloji/dil/yapı kullanılacak ve neden]

## UYGULAMA ADIMLARI
1. [İlk adım]
2. [İkinci adım]
...

## KOD YAPISI
[Hangi dosyalar/fonksiyonlar/sınıflar olacak]

## EDGE CASE'LER
[Dikkat edilmesi gereken özel durumlar]

## CODER'A TALİMAT
[Coder'ın birebir uygulayacağı net talimat. Çok spesifik ol.]`;

export async function runPlanner(
  task: string,
  config: DehaConfig,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { pipeline } = config;
  const messages: Message[] = [{ role: 'user', content: `Görev: ${task}` }];

  return callRole(pipeline.planner, config, messages, PLANNER_SYSTEM, onChunk);
}
