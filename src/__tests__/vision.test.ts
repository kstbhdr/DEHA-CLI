import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('axios');

vi.mock('../tools/browser', () => ({
  takeScreenshot: vi.fn().mockResolvedValue('/tmp/screenshot.png'),
}));

vi.mock('../services/usage-tracker', () => ({
  recordUsage: vi.fn(),
}));

vi.mock('../prompts.config', () => ({
  VISION_PROMPT: 'Analyze this image.',
}));

// Anthropic SDK mock — class constructor
const mockMessagesCreate = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
    constructor(opts: any) { /* noop */ }
  },
}));

import axios from 'axios';
import * as fs from 'fs';
import { analyzeImage, screenshotAndAnalyze, toolVisionAnalyze } from '../tools/vision';
import type { DehaConfig } from '../config';

const mockConfig: DehaConfig = {
  provider: 'claude',
  anthropicApiKey: 'sk-ant-test',
  openaiApiKey: 'sk-openai-test',
  openrouterApiKey: 'sk-or-test',
  deepseekThinking: 'disabled',
  deepseekReasoningEffort: 'high',
  claudeModel: 'claude-opus-4-6',
  openaiModel: 'gpt-4o',
  deepseekModel: 'deepseek-chat',
  deepseekApiKey: '',
  openrouterModel: '',
  xaiApiKey: '',
  xaiModel: '',
  customApiKey: '',
  customModel: '',
  customApiUrl: '',
  ollamaHost: '',
  ollamaModel: '',
  visionProvider: 'openrouter',
  visionModel: 'qwen/qwen3-vl-32b-instruct',
  chatInputPrice: 3,
  chatOutputPrice: 15,
  plannerInputPrice: 3,
  plannerOutputPrice: 15,
  coderInputPrice: 0.27,
  coderOutputPrice: 1.10,
  judgeInputPrice: 5,
  judgeOutputPrice: 15,
  visionInputPrice: 3,
  visionOutputPrice: 15,
  agentInputPrice: 3,
  agentOutputPrice: 15,
  systemPrompt: '',
  maxTokens: 4096,
  temperature: 0.7,
  maxToolRounds: 5,
  toolMaxTokens: 49152,
  maxContextTokens: 0,
  compressThreshold: 0.75,
  minHotMessages: 10,
  pipeline: {} as any,
};

describe('analyzeImage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Claude ile analiz yapar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This image shows a UI with a button.' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await analyzeImage('/tmp/test.png', mockConfig, { provider: 'claude' });
    expect(result).toContain('UI');
    expect(mockMessagesCreate).toHaveBeenCalled();
  });

  it('OpenAI ile analiz yapar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'The image contains a form.' } }],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      },
    });

    const result = await analyzeImage('/tmp/test.png', { ...mockConfig, provider: 'openai' }, { provider: 'openai' });
    expect(result).toContain('form');
    expect(axios.post).toHaveBeenCalled();
  });

  it('vision config ile OpenRouter kullanir', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'The image contains a dashboard.' } }],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      },
    });

    const result = await analyzeImage('/tmp/test.png', mockConfig);
    expect(result).toContain('dashboard');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('https://openrouter.ai/api/v1/chat/completions'),
      expect.objectContaining({
        model: 'qwen/qwen3-vl-32b-instruct',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Title': 'DEHA CLI',
        }),
      }),
    );
  });

  it('dosya yoksa hata firlatir', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(analyzeImage('/tmp/yok.png', mockConfig)).rejects.toThrow('bulunamadı');
  });

  it('MIME tipini dogru algilar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });

    await analyzeImage('/tmp/test.jpg', mockConfig, { provider: 'claude' });
    // Anthropic messages.create cagrisinda media_type kontrol edilebilir
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                source: expect.objectContaining({
                  media_type: 'image/jpeg',
                }),
              }),
            ]),
          }),
        ]),
      })
    );
  });
});

describe('screenshotAndAnalyze', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('screenshot alir ve analiz eder', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis result' }],
    });

    const result = await screenshotAndAnalyze('https://example.com', mockConfig, { provider: 'claude' });
    expect(result.screenshotPath).toBe('/tmp/screenshot.png');
    expect(result.analysis).toContain('Analysis result');
  });
});

describe('analyzeExistingImage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mevcut dosyayi analiz eder', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis' }],
    });

    const result = await analyzeImage('/tmp/test.png', mockConfig, { provider: 'claude', prompt: 'What is this?' });
    expect(result).toBe('Analysis');
  });
});

describe('toolVisionAnalyze', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('URL ile cagrilirsa screenshot+analiz yapar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis' }],
    });

    const result = await toolVisionAnalyze({ url: 'https://example.com', provider: 'claude' }, mockConfig);
    expect(result).toContain('Screenshot');
    expect(result).toContain('Analysis');
  });

  it('image_path ile cagrilirsa direkt analiz yapar', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('data'));
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Direct analysis' }],
    });

    const result = await toolVisionAnalyze({ image_path: '/tmp/test.png', provider: 'claude' }, mockConfig);
    expect(result).toBe('Direct analysis');
  });

  it('hicbiri yoksa uyari mesaji doner', async () => {
    const result = await toolVisionAnalyze({}, mockConfig);
    expect(result).toContain('required');
  });
});
