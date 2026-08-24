import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { DehaConfig } from '../config';

export type ImageProvider = 'xai' | 'openai' | 'openrouter' | 'custom';

export interface ImageGenOptions {
  provider?: ImageProvider;
  model?: string;
  apiKey?: string;
  apiUrl?: string;
  n?: number;
  size?: string;           // e.g. "1024x1024" (OpenAI) or a tier/shorthand (OpenRouter)
  aspectRatio?: string;    // OpenRouter only, e.g. "16:9"
  quality?: 'auto' | 'low' | 'medium' | 'high';  // OpenRouter only
  outputFormat?: 'png' | 'jpeg' | 'webp' | 'svg'; // OpenRouter only
  openrouterProvider?: string; // OpenRouter sub-provider routing override
  outputPath?: string;     // explicit save path (single image only)
}

const PROVIDER_BASE_URL: Record<ImageProvider, string> = {
  xai: 'https://api.x.ai/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: '',
};

// ─── Ana fonksiyon: görsel üretimi ──────────────────────────────────────────

export async function generateImage(
  prompt: string,
  config: DehaConfig,
  opts: ImageGenOptions = {},
): Promise<{ paths: string[]; text: string }> {
  const provider = opts.provider ?? ((config.imageProvider || 'xai') as ImageProvider);

  // NOT: `??` yerine `||` — `/model` komutu boş bırakılan alanları da .env'e boş
  // string ("KEY=") olarak yazıyor, ve boş string `??` için "tanımlı" sayılır,
  // bu yüzden gerçek default'a (xAI/OpenAI URL'i vb.) hiç düşmez.
  //
  // `config.imageApiKey`, `/model`'in en son seçilen provider için doldurduğu
  // key'dir — sadece o provider hâlâ etkin provider ise güvenilir; başka bir
  // provider'a override edildiğinde (örn. generate_image(provider:"openrouter")
  // ama /model'de imageProvider="xai" kayıtlı) yanlış key gönderilmesin diye
  // en son fallback olarak, ve sadece provider eşleşiyorsa kullanılıyor.
  const apiKey =
    opts.apiKey ||
    (provider === 'xai' ? config.xaiApiKey : undefined) ||
    (provider === 'openai' ? config.openaiApiKey : undefined) ||
    (provider === 'openrouter' ? config.openrouterApiKey : undefined) ||
    (provider === 'custom' ? config.customApiKey : undefined) ||
    (provider === config.imageProvider ? config.imageApiKey : undefined);
  if (!apiKey) throw new Error(`${provider.toUpperCase()} API key eksik (görsel üretimi için)`);

  const model =
    opts.model ||
    (provider === config.imageProvider ? config.imageModel : undefined) ||
    (provider === 'xai' ? 'grok-imagine-image'
      : provider === 'openrouter' ? 'google/gemini-2.5-flash-image'
      : 'gpt-image-1');

  const baseUrl = (
    opts.apiUrl ||
    (provider === config.imageProvider ? config.imageApiUrl : undefined) ||
    (provider === 'custom' ? config.customApiUrl : PROVIDER_BASE_URL[provider])
  ).replace(/\/$/, '');

  let url: string;
  const body: Record<string, unknown> = { model, prompt, n: opts.n ?? 1 };

  if (provider === 'openrouter') {
    // OpenRouter has a dedicated /v1/images endpoint — separate from OpenAI/xAI's
    // /images/generations shape. Always returns base64 (no response_format field).
    url = `${baseUrl}/images`;
    if (opts.size) body.size = opts.size;
    if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
    if (opts.quality) body.quality = opts.quality;
    if (opts.outputFormat) body.output_format = opts.outputFormat;
    const subProvider = opts.openrouterProvider ?? config.openrouterProvider;
    const providerOpts: Record<string, unknown> = {};
    if (subProvider) { providerOpts.only = [subProvider]; providerOpts.allow_fallbacks = false; }
    if (config.openrouterIgnoreProviders) {
      providerOpts.ignore = config.openrouterIgnoreProviders.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (config.openrouterZdr) providerOpts.zdr = true;
    if (Object.keys(providerOpts).length > 0) body.provider = providerOpts;
  } else {
    url = `${baseUrl}/images/generations`;
    // gpt-image-1 always returns base64 and rejects response_format; dall-e-3/2 and xAI accept it.
    if (!model.startsWith('gpt-image')) {
      body.response_format = 'b64_json';
    }
    // xAI's /images/generations rejects an unrecognized `size` field outright
    // (400 "Argument not supported: size") — it has no documented size/resolution
    // override yet, so just omit it there. OpenAI (dall-e-3/2, gpt-image-1) accepts it.
    if (opts.size && provider !== 'xai') body.size = opts.size;
  }

  let response;
  try {
    response = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 120_000,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const detail = typeof err.response.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response.data);
      throw new Error(`${provider.toUpperCase()} görsel API hatası (${err.response.status}): ${detail}`);
    }
    throw err;
  }

  const data = response.data?.data as Array<Record<string, unknown>> | undefined;
  if (!data || data.length === 0) throw new Error('Görsel üretimi boş cevap döndürdü');

  const outDir = path.join(os.homedir(), '.deha', 'images');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    let bytes: Buffer;
    if (typeof item.b64_json === 'string') {
      bytes = Buffer.from(item.b64_json, 'base64');
    } else if (typeof item.base64 === 'string') {
      bytes = Buffer.from(item.base64, 'base64');
    } else if (typeof item.url === 'string') {
      const imgResp = await axios.get(item.url, { responseType: 'arraybuffer' });
      bytes = Buffer.from(imgResp.data);
    } else {
      throw new Error('Cevapta ne b64_json/base64 ne de url alanı vardı');
    }

    // Providers don't reliably declare the actual format (xAI/OpenAI send no
    // media_type at all and can return JPEG even when the model name suggests
    // otherwise) — sniff the real magic bytes instead of trusting a guess.
    const ext = sniffImageExt(bytes) || extFromMediaType(item.media_type) || path.extname(opts.outputPath || '') || '.png';
    const defaultPath = path.join(outDir, `image_${Date.now()}${ext}`);
    const fileName = data.length > 1
      ? suffixPath(opts.outputPath ?? defaultPath, i)
      : (opts.outputPath ?? defaultPath);

    fs.writeFileSync(fileName, bytes);
    paths.push(fileName);
  }

  return {
    paths,
    text: paths.length === 1
      ? `Görsel üretildi: ${paths[0]}`
      : `${paths.length} görsel üretildi:\n${paths.join('\n')}`,
  };
}

function suffixPath(filePath: string, index: number): string {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);
  return `${base}_${index}${ext || '.png'}`;
}

/** Detects the real image format from magic bytes — providers don't reliably declare it. */
function sniffImageExt(buf: Buffer): string | undefined {
  if (buf.length < 12) return undefined;
  if (buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return '.png';
  if (buf.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return '.jpg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return '.gif';
  return undefined;
}

/** OpenRouter's /v1/images response carries a `media_type` (e.g. "image/png") per item. */
function extFromMediaType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const subtype = value.split('/')[1];
  if (!subtype) return undefined;
  return `.${subtype === 'svg+xml' ? 'svg' : subtype}`;
}

// ─── Tool versiyonu ─────────────────────────────────────────────────────────

export async function toolGenerateImage(
  input: {
    prompt?: string;
    n?: number;
    size?: string;
    aspect_ratio?: string;
    quality?: 'auto' | 'low' | 'medium' | 'high';
    output_format?: 'png' | 'jpeg' | 'webp' | 'svg';
    output_path?: string;
    provider?: ImageProvider;
    model?: string;
    api_key?: string;
    api_url?: string;
  },
  config: DehaConfig,
): Promise<string> {
  if (!input.prompt) return 'prompt gerekli';
  const { text } = await generateImage(input.prompt, config, {
    n: input.n,
    size: input.size,
    aspectRatio: input.aspect_ratio,
    quality: input.quality,
    outputFormat: input.output_format,
    outputPath: input.output_path,
    provider: input.provider,
    model: input.model,
    apiKey: input.api_key,
    apiUrl: input.api_url,
  });
  return text;
}
