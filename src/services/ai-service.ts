import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { DehaConfig, RoleConfig, resolveApiKey, resolveApiUrl } from '../config';
import { recordUsage, RoleLabel } from './usage-tracker';
import { getCached, setCache } from './cache';

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

  // OpenRouter sub-provider: role-level > global > undefined
  const openrouterProvider =
    role.openrouterProvider ?? globalConfig.openrouterProvider ?? undefined;

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
        ? streamOpenAICompat(apiUrl, apiKey, role.model, messages, systemPrompt, maxTokens, temperature, onChunk, track, openrouterProvider)
        : sendOpenAICompat(apiUrl, apiKey, role.model, messages, systemPrompt, maxTokens, temperature, track, openrouterProvider);

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

export async function sendMessage(messages: Message[], config: DehaConfig, useCache = false): Promise<string> {
  const model = roleFromConfig(config).model;
  if (useCache) {
    const cached = getCached(config.systemPrompt, messages, model);
    if (cached !== null) return cached;
  }
  const result = await callRole(roleFromConfig(config), config, messages, config.systemPrompt);
  if (useCache) setCache(config.systemPrompt, messages, model, result);
  return result;
}

export async function streamMessage(
  messages: Message[],
  config: DehaConfig,
  onChunk: (chunk: string) => void,
): Promise<string> {
  return callRole(roleFromConfig(config), config, messages, config.systemPrompt, onChunk);
}

// ─── Tool Calling ────────────────────────────────────────────────────────────

export type ToolCall = { name: string; input: Record<string, unknown>; id: string };
export type ToolResult = { id: string; content: string };

/** Anthropic (input_schema) → OpenAI (parameters) format dönüşümü */
function toOpenAITools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: (t as unknown as { input_schema: Record<string, unknown> }).input_schema,
    },
  }));
}

/** Claude native tool calling */
export async function sendWithTools(
  messages: Message[],
  config: DehaConfig,
  tools: ToolDefinition[],
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  toolChoice: 'auto' | 'required' = 'auto',
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  if (config.provider !== 'claude') {
    const oaiMessages: OAIMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const r = await sendWithToolsOpenAICompat(oaiMessages, config, tools, onChunk, abortSignal, toolChoice);
    return { text: r.text, toolCalls: r.toolCalls };
  }

  const apiKey = config.anthropicApiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY eksik');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: config.maxTokens,
    system: config.systemPrompt,
    tools,
    tool_choice: toolChoice === 'required' ? { type: 'any' } : { type: 'auto' },
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  }, { signal: abortSignal });

  let text = '';
  const toolCalls: ToolCall[] = [];

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

// OpenAI raw mesaj tipi — tool call/result için genişletilmiş
export type OAIMessage = Record<string, unknown>;

/** OpenAI-uyumlu tool calling (DeepSeek, OpenAI, OpenRouter, xAI) */
export async function sendWithToolsOpenAICompat(
  messages: OAIMessage[],
  config: DehaConfig,
  tools: ToolDefinition[],
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  toolChoice: 'auto' | 'required' = 'auto',
): Promise<{ text: string; toolCalls: ToolCall[]; rawAssistantMsg: OAIMessage; malformedToolCalls: number }> {
  const role = roleFromConfig(config);
  const apiKey = resolveApiKey(role, config);
  const apiUrl = resolveApiUrl(role, config);
  if (!apiKey) throw new Error(`API key missing (${apiUrl})`);
  const toolMaxTokens = Math.max(config.maxTokens, config.toolMaxTokens);

  const body: Record<string, unknown> = {
    model: role.model,
    messages,
    tools: toOpenAITools(tools),
    tool_choice: toolChoice === 'required' ? 'required' : 'auto',
    max_tokens: toolMaxTokens,
    temperature: config.temperature,
  };

  if (config.openrouterProvider) {
    body.provider = { only: [config.openrouterProvider], allow_fallbacks: false };
  }

  let response;
  try {
    response = await axios.post(`${apiUrl}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 120000,
      signal: abortSignal,
    });
  } catch (err: unknown) {
    writeOpenAICompatDebugFile('last-openai-tool-error.json', {
      phase: 'initial_request',
      url: `${apiUrl}/chat/completions`,
      body,
      error: extractAxiosErrorPayload(err),
    });
    if (shouldRetryWithAutoToolChoice(err, toolChoice)) {
      const fallbackBody = { ...body, tool_choice: 'auto' };
      response = await axios.post(`${apiUrl}/chat/completions`, fallbackBody, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 120000,
        signal: abortSignal,
      });
    } else {
      throw normalizeAxiosError(err);
    }
  }

  const msg = response.data.choices[0].message as OAIMessage;
  writeOpenAICompatDebugFile('last-openai-tool-message.json', msg);
  const sanitizedAssistantMsg = sanitizeOpenAICompatAssistantMessage(msg);
  writeOpenAICompatDebugFile('last-openai-tool-message-sanitized.json', sanitizedAssistantMsg);

  const text: string = (sanitizedAssistantMsg.content as string) ?? '';
  if (text && onChunk) onChunk(text);

  const rawToolCalls = ((sanitizedAssistantMsg.tool_calls as Record<string, unknown>[]) ?? []);
  const toolCalls: ToolCall[] = rawToolCalls
    .map((tc) => {
      const fn = tc.function as { name?: string; arguments?: string } | undefined;
      const name = fn?.name?.trim();
      const rawArguments = typeof fn?.arguments === 'string' ? fn.arguments.trim() : '';
      if (!name || !rawArguments) {
        return null;
      }

      try {
        const input = JSON.parse(rawArguments) as Record<string, unknown>;
        return { name, input, id: tc.id as string };
      } catch {
        return null;
      }
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null);

  return {
    text,
    toolCalls,
    rawAssistantMsg: sanitizedAssistantMsg,
    malformedToolCalls: Math.max(0, rawToolCalls.length - toolCalls.length),
  };
}

function sanitizeOpenAICompatAssistantMessage(msg: OAIMessage): OAIMessage {
  const sanitized: OAIMessage = {
    role: 'assistant',
    content: typeof msg.content === 'string' ? msg.content : '',
  };

  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    sanitized.reasoning_content = msg.reasoning_content;
  }

  if (Array.isArray(msg.tool_calls)) {
    sanitized.tool_calls = msg.tool_calls
      .map((tc) => {
        const id = typeof tc?.id === 'string' ? tc.id : '';
        const fn = tc?.function as { name?: unknown; arguments?: unknown } | undefined;
        const name = typeof fn?.name === 'string' ? fn.name : '';
        const rawArguments = typeof fn?.arguments === 'string' ? fn.arguments : '';
        if (!id || !name || !rawArguments) {
          return null;
        }

        return {
          id,
          type: 'function',
          function: {
            name,
            arguments: rawArguments,
          },
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
  }

  return sanitized;
}

function shouldRetryWithAutoToolChoice(err: unknown, toolChoice: 'auto' | 'required'): boolean {
  if (toolChoice !== 'required' || !axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status !== 400) return false;

  const payload = typeof err.response?.data === 'string'
    ? err.response.data
    : JSON.stringify(err.response?.data ?? {});

  const normalized = payload.toLowerCase();
  return normalized.includes('tool_choice')
    || normalized.includes('required')
    || normalized.includes('tool use')
    || normalized.includes('tool_calls');
}

function normalizeAxiosError(err: unknown): Error {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err : new Error(String(err));
  }

  const status = err.response?.status;
  const payload = typeof err.response?.data === 'string'
    ? err.response.data
    : JSON.stringify(err.response?.data ?? {});

  const detail = payload && payload !== '{}' ? ` - ${payload}` : '';
  return new Error(`API request failed${status ? ` (${status})` : ''}${detail}`);
}

function extractAxiosErrorPayload(err: unknown): unknown {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  }

  return {
    message: err.message,
    status: err.response?.status ?? null,
    data: err.response?.data ?? null,
  };
}

function writeOpenAICompatDebugFile(fileName: string, payload: unknown): void {
  if (!process.env.DEHA_DEBUG_TOOL_CALLS) return;

  try {
    const debugDir = path.join(process.cwd(), '.deha');
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(
      path.join(debugDir, fileName),
      JSON.stringify(payload, null, 2),
      'utf-8',
    );
  } catch {
    // debug yardımcıları hiçbir zaman ana akışı bozmamalı
  }
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
  openrouterProvider?: string,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: maxTokens,
    temperature,
  };
  if (openrouterProvider) {
    body.provider = { only: [openrouterProvider], allow_fallbacks: false };
  }
  const response = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
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
  openrouterProvider?: string,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (openrouterProvider) {
    body.provider = { only: [openrouterProvider], allow_fallbacks: false };
  }
  const response = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    responseType: 'stream',
  });
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
