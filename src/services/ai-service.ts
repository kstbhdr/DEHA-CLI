import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { DehaConfig, RoleConfig, resolveApiKey, resolveApiUrl } from '../config';
import { recordUsage, RoleLabel } from './usage-tracker';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type ToolDefinition = Anthropic.Tool;

// ─── Role-based çağrı (Pipeline için) ──────────────────────────────────────
// Her pipeline rolü (planner/coder/judge) kendi provider/model/key ile çalışır.

export async function callRole(
  role: RoleConfig,
  globalConfig: DehaConfig,
  messages: Message[],
  systemPrompt: string,
  onChunk?: (chunk: string) => void,
  roleLabel: RoleLabel = 'chat',
): Promise<string> {
  const apiKey = resolveApiKey(role, globalConfig);
  const maxTokens = role.maxTokens ?? globalConfig.maxTokens;
  const temperature = role.temperature ?? globalConfig.temperature;
  const apiUrl = resolveApiUrl(role, globalConfig);

  const track = (inp: number, out: number) =>
    recordUsage(role.provider, role.model, roleLabel, inp, out, globalConfig);

  switch (role.provider) {
    case 'claude':
      return onChunk
        ? streamClaude(messages, role.model, apiKey, maxTokens, systemPrompt, onChunk, track)
        : sendClaude(messages, role.model, apiKey, maxTokens, systemPrompt, track);

    case 'ollama':
      return onChunk
        ? streamOllama(messages, role.model, apiUrl, systemPrompt, maxTokens, temperature, onChunk)
        : sendOllama(messages, role.model, apiUrl, systemPrompt, maxTokens, temperature);

    case 'openai':
    case 'deepseek':
    case 'openrouter':
    case 'xai':
    case 'custom':
      return onChunk
        ? streamOpenAICompat(apiUrl, apiKey, role.model, messages, systemPrompt, maxTokens, temperature, onChunk, track)
        : sendOpenAICompat(apiUrl, apiKey, role.model, messages, systemPrompt, maxTokens, temperature, track);

    default:
      throw new Error(`Unknown provider: ${role.provider}`);
  }
}

// ─── DehaConfig tabanlı çağrı (interaktif mod için) ────────────────────────

function roleFromConfig(config: DehaConfig): RoleConfig {
  const modelMap: Record<string, string> = {
    claude:     config.claudeModel,
    openai:     config.openaiModel,
    deepseek:   config.deepseekModel,
    openrouter: config.openrouterModel,
    xai:        config.xaiModel,
    ollama:     config.ollamaModel,
    custom:     config.customModel,
  };
  return {
    provider: config.provider,
    model: modelMap[config.provider] ?? config.customModel,
    apiUrl: config.provider === 'custom' ? config.customApiUrl : undefined,
  };
}

export async function sendMessage(messages: Message[], config: DehaConfig): Promise<string> {
  return callRole(roleFromConfig(config), config, messages, config.systemPrompt);
}

export async function streamMessage(
  messages: Message[],
  config: DehaConfig,
  onChunk: (chunk: string) => void,
): Promise<string> {
  return callRole(roleFromConfig(config), config, messages, config.systemPrompt, onChunk);
}

// ─── Tool Calling (Claude native, pipeline içinde kullanılmaz ama agent modunda var) ──

export async function sendWithTools(
  messages: Message[],
  config: DehaConfig,
  tools: ToolDefinition[],
  onChunk?: (chunk: string) => void,
): Promise<{ text: string; toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> }> {
  if (config.provider !== 'claude') {
    const text = onChunk
      ? await streamMessage(messages, config, onChunk)
      : await sendMessage(messages, config);
    return { text, toolCalls: [] };
  }

  const apiKey = config.anthropicApiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY eksik');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: config.maxTokens,
    system: config.systemPrompt,
    tools,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  let text = '';
  const toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
      if (onChunk) onChunk(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({ name: block.name, input: block.input as Record<string, unknown>, id: block.id });
    }
  }

  return { text, toolCalls };
}

// ─── Claude implementasyonu ─────────────────────────────────────────────────

type TrackFn = (inp: number, out: number) => void;

async function sendClaude(
  messages: Message[],
  model: string,
  apiKey: string | undefined,
  maxTokens: number,
  systemPrompt: string,
  track?: TrackFn,
): Promise<string> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model, max_tokens: maxTokens, system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  track?.(response.usage.input_tokens, response.usage.output_tokens);
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}

async function streamClaude(
  messages: Message[],
  model: string,
  apiKey: string | undefined,
  maxTokens: number,
  systemPrompt: string,
  onChunk: (chunk: string) => void,
  track?: TrackFn,
): Promise<string> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  const client = new Anthropic({ apiKey });
  let full = '';
  const stream = client.messages.stream({
    model, max_tokens: maxTokens, system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onChunk(event.delta.text);
      full += event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  track?.(final.usage.input_tokens, final.usage.output_tokens);
  return full;
}

// ─── OpenAI-compatible (OpenAI, DeepSeek, OpenRouter, xAI) ─────────────────

async function sendOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  messages: Message[],
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  track?: TrackFn,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature,
    },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
  );
  const usage = response.data.usage;
  if (usage) track?.(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
  return response.data.choices[0].message.content;
}

async function streamOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  messages: Message[],
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  onChunk: (chunk: string) => void,
  track?: TrackFn,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature,
      stream: true,
      stream_options: { include_usage: true },
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      responseType: 'stream',
    },
  );
  return parseSSEStream(response.data, onChunk, track);
}

// ─── Ollama ─────────────────────────────────────────────────────────────────

async function sendOllama(
  messages: Message[],
  model: string,
  host: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const response = await axios.post(
    `${host}/api/chat`,
    {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: false,
      options: { temperature, num_predict: maxTokens },
    },
    { timeout: 120000 },
  );
  return response.data.message.content;
}

async function streamOllama(
  messages: Message[],
  model: string,
  host: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const response = await axios.post(
    `${host}/api/chat`,
    {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      options: { temperature, num_predict: maxTokens },
    },
    { responseType: 'stream', timeout: 120000 },
  );
  let full = '';
  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          const text: string = parsed.message?.content ?? '';
          if (text) { onChunk(text); full += text; }
        } catch { /* skip */ }
      }
    });
    response.data.on('end', () => resolve(full));
    response.data.on('error', reject);
  });
}

// ─── SSE parser ─────────────────────────────────────────────────────────────

function parseSSEStream(
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: string) => void,
  track?: TrackFn,
): Promise<string> {
  let full = '';
  let buf = '';
  return new Promise((resolve, reject) => {
    stream.on('data', (raw: Buffer) => {
      buf += raw.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.replace(/^data: /, '').trim();
        if (!trimmed || trimmed === '[DONE]') continue;
        try {
          const parsed = JSON.parse(trimmed);
          const delta: string = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) { onChunk(delta); full += delta; }
          // Some providers send usage in the final chunk (stream_options: include_usage)
          if (parsed.usage && track) {
            track(parsed.usage.prompt_tokens ?? 0, parsed.usage.completion_tokens ?? 0);
          }
        } catch { /* skip */ }
      }
    });
    stream.on('end', () => resolve(full));
    stream.on('error', reject);
  });
}
