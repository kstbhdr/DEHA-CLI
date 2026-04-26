import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { takeScreenshot } from './browser';
import { DehaConfig } from '../config';

export type VisionProvider = 'claude' | 'openai';

export interface VisionOptions {
  provider?: VisionProvider;
  model?: string;
  prompt?: string;
  detail?: 'low' | 'high' | 'auto'; // OpenAI için
}

// ─── Ana fonksiyon: görüntü analizi ─────────────────────────────────────────

export async function analyzeImage(
  imagePath: string,
  config: DehaConfig,
  opts: VisionOptions = {},
): Promise<string> {
  if (!fs.existsSync(imagePath)) throw new Error(`Görüntü bulunamadı: ${imagePath}`);

  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const mimeType = getMimeType(imagePath);
  const prompt = opts.prompt ?? 'Bu görüntüyü detaylıca analiz et. UI/UX sorunları, hatalar, dikkat çeken unsurlar ve iyileştirme önerileri ver.';

  const provider = opts.provider ?? (config.provider === 'openai' ? 'openai' : 'claude');

  if (provider === 'openai') {
    return analyzeWithOpenAI(base64, mimeType, prompt, config, opts);
  }
  return analyzeWithClaude(base64, mimeType, prompt, config, opts);
}

// ─── URL'den screenshot al, analiz et ───────────────────────────────────────

export async function screenshotAndAnalyze(
  url: string,
  config: DehaConfig,
  opts: VisionOptions & { fullPage?: boolean; waitMs?: number } = {},
): Promise<{ screenshotPath: string; analysis: string }> {
  const screenshotPath = await takeScreenshot(url, {
    fullPage: opts.fullPage,
    waitMs: opts.waitMs ?? 1000,
  });

  const analysis = await analyzeImage(screenshotPath, config, {
    ...opts,
    prompt: opts.prompt ?? `Bu URL'nin ekran görüntüsünü analiz et: ${url}\n\nUI sorunları, performans ipuçları, erişilebilirlik sorunları ve iyileştirme önerileri ver.`,
  });

  return { screenshotPath, analysis };
}

// ─── Mevcut görüntü dosyasını analiz et ─────────────────────────────────────

export async function analyzeExistingImage(
  imagePath: string,
  config: DehaConfig,
  prompt?: string,
): Promise<string> {
  return analyzeImage(imagePath, config, { prompt });
}

// ─── Claude vision ───────────────────────────────────────────────────────────

async function analyzeWithClaude(
  base64: string,
  mimeType: string,
  prompt: string,
  config: DehaConfig,
  opts: VisionOptions,
): Promise<string> {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY eksik');

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = opts.model ?? config.claudeModel;

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Beklenmeyen yanıt');
  return block.text;
}

// ─── OpenAI vision ───────────────────────────────────────────────────────────

async function analyzeWithOpenAI(
  base64: string,
  mimeType: string,
  prompt: string,
  config: DehaConfig,
  opts: VisionOptions,
): Promise<string> {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY eksik');

  const model = opts.model ?? 'gpt-4o';
  const detail = opts.detail ?? 'auto';

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    { headers: { Authorization: `Bearer ${config.openaiApiKey}` } },
  );

  return response.data.choices[0].message.content;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return types[ext] ?? 'image/png';
}

// ─── Tool versiyonu ─────────────────────────────────────────────────────────

export async function toolVisionAnalyze(
  input: {
    url?: string;
    image_path?: string;
    prompt?: string;
    full_page?: boolean;
  },
  config: DehaConfig,
): Promise<string> {
  if (input.url) {
    const { screenshotPath, analysis } = await screenshotAndAnalyze(input.url, config, {
      prompt: input.prompt,
      fullPage: input.full_page,
    });
    return `Screenshot: ${screenshotPath}\n\n${analysis}`;
  }

  if (input.image_path) {
    return analyzeImage(input.image_path, config, { prompt: input.prompt });
  }

  return 'url veya image_path gerekli';
}
