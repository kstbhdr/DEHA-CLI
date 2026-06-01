import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { takeScreenshot } from './browser';
import { DehaConfig } from '../config';
import { VISION_PROMPT } from '../prompts.config';
import { recordUsage } from '../services/usage-tracker';

export type VisionProvider = 'claude' | 'openai' | 'openrouter' | 'custom';

export interface VisionOptions {
  provider?: VisionProvider;
  model?: string;
  prompt?: string;
  detail?: 'low' | 'high' | 'auto';
  apiKey?: string;   // override global key
  apiUrl?: string;   // custom OpenAI-compatible endpoint
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
  const prompt = opts.prompt ?? VISION_PROMPT;

  const provider = opts.provider ?? ((config.visionProvider || 'openrouter') as VisionProvider);

  if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
    return analyzeWithOpenAICompat(base64, mimeType, prompt, config, {
      ...opts,
      provider,
    });
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
  const apiKey = opts.apiKey ?? config.anthropicApiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (opts.apiUrl) clientOpts.baseURL = opts.apiUrl;
  const client = new Anthropic(clientOpts);
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

  // Track usage
  const usage = (response as any).usage;
  if (usage) {
    recordUsage('anthropic', model, 'vision', usage.input_tokens ?? 0, usage.output_tokens ?? 0, config);
  }

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Beklenmeyen yanıt');
  return block.text;
}

// ─── OpenAI vision ───────────────────────────────────────────────────────────

async function analyzeWithOpenAICompat(
  base64: string,
  mimeType: string,
  prompt: string,
  config: DehaConfig,
  opts: VisionOptions,
): Promise<string> {
  const provider = opts.provider ?? 'openai';
  const apiKey =
    opts.apiKey ??
    config.visionApiKey ??
    (provider === 'openrouter' ? config.openrouterApiKey : undefined) ??
    (provider === 'custom' ? config.customApiKey : undefined) ??
    config.openaiApiKey;
  if (!apiKey) throw new Error(`${provider.toUpperCase()} API key missing (or pass apiKey in options)`);

  const model  = opts.model ?? config.visionModel ?? 'gpt-4o';
  const detail = opts.detail ?? 'auto';
  const baseUrl =
    opts.apiUrl ??
    config.visionApiUrl ??
    (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined) ??
    (provider === 'custom' ? config.customApiUrl : undefined) ??
    'https://api.openai.com/v1';

  const response = await axios.post(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
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
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? {
          'HTTP-Referer': 'https://github.com/kstbhdr/DEHA-CLI',
          'X-Title': 'DEHA CLI',
        } : {}),
      },
    },
  );

  // Track usage
  const usage = response.data.usage;
  if (usage) {
    recordUsage(provider, model, 'vision', usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0, config);
  }

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
    provider?: VisionProvider;
    model?: string;
    api_key?: string;
    api_url?: string;
  },
  config: DehaConfig,
): Promise<string> {
  const opts: VisionOptions = {
    prompt:   input.prompt,
    provider: input.provider,
    model:    input.model,
    apiKey:   input.api_key,
    apiUrl:   input.api_url,
  };

  if (input.url) {
    const { screenshotPath, analysis } = await screenshotAndAnalyze(input.url, config, {
      ...opts,
      fullPage: input.full_page,
    });
    return `Screenshot: ${screenshotPath}\n\n${analysis}`;
  }

  if (input.image_path) {
    return analyzeImage(input.image_path, config, opts);
  }

  return 'url or image_path is required';
}
