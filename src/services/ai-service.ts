import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { DehaConfig, Provider, RoleConfig, resolveApiKey, resolveApiUrl } from '../config';
import { recordUsage, RoleLabel } from './usage-tracker';
import { getCached, setCache } from './cache';

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export type ToolDefinition = Anthropic.Tool;

// ─── Role-based çağrı (Pipeline için) ──────────────────────────────────────

export async function callRole(
  role: RoleConfig,
  globalConfig: DehaConfig,
  messages: Message[],
  systemPrompt: string,
  onChunk?: (chunk: string) => void,
  roleLabel: RoleLabel = 'chat',
  onReasoning?: (chunk: string) => void,
): Promise<string> {
  const apiKey = resolveApiKey(role, globalConfig);
  const maxTokens = role.maxTokens ?? globalConfig.maxTokens;
  const temperature = role.temperature ?? globalConfig.temperature;
  const apiUrl = resolveApiUrl(role, globalConfig);

  const openrouterProvider =
    role.openrouterProvider ?? globalConfig.openrouterProvider ?? undefined;

  const track = (inp: number, out: number, reasoning = 0, cache = 0) =>
    recordUsage(role.provider, role.model, roleLabel, inp, out, globalConfig, reasoning, cache);

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
        ? streamOpenAICompat(apiUrl, apiKey, role.provider, role.model, messages, systemPrompt, maxTokens, temperature, globalConfig, onChunk, track, openrouterProvider)
        : sendOpenAICompat(apiUrl, apiKey, role.provider, role.model, messages, systemPrompt, maxTokens, temperature, globalConfig, track, openrouterProvider);

    default:
      throw new Error(`Unknown provider: ${role.provider}`);
  }
}

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
  onReasoning?: (chunk: string) => void,
): Promise<string> {
  return callRole(roleFromConfig(config), config, messages, config.systemPrompt, onChunk, 'chat', onReasoning);
}

// ─── Tool Calling ────────────────────────────────────────────────────────────

export type ToolCall = { name: string; input: Record<string, unknown>; id: string };
export type ToolResult = { id: string; content: string };

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

async function withSpinner<T>(
  _config: DehaConfig,
  _label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}

/** Anthropic specific message mapper */
function toClaudeMessages(messages: Message[]): Anthropic.MessageParam[] {
   return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
       role: m.role as 'user' | 'assistant',
       content: m.content || ''
    }));
}

export function sanitizeHistoryForOpenAI(messages: Message[]): OAIMessage[] {
  // ── Pass 1: Mutual-pairing – collect IDs from both sides ───────────────
  const assistantToolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id) assistantToolCallIds.add(tc.id);
      }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      toolResultIds.add(m.tool_call_id);
    }
  }

  // Paired = ID exists in BOTH assistant tool_calls AND tool results
  const pairedIds = new Set<string>();
  for (const id of assistantToolCallIds) {
    if (toolResultIds.has(id)) pairedIds.add(id);
  }

  // ── Pass 2: Build sanitized output ─────────────────────────────────────
  const sanitizedMessages: OAIMessage[] = [];

  for (const m of messages) {
    if (m.role === 'assistant') {
      const msg: OAIMessage = { role: 'assistant', content: m.content || '' };
      if (m.reasoning_content) msg.reasoning_content = m.reasoning_content;

      if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const validToolCalls = m.tool_calls.filter((tc: any) => tc?.id && pairedIds.has(tc.id));
        if (validToolCalls.length > 0) {
          msg.tool_calls = validToolCalls;
        }
        // If no valid tool_calls remain, omit tool_calls entirely → regular assistant message
      }

      sanitizedMessages.push(msg);
    } else if (m.role === 'tool') {
      // Only keep tool results whose call_id is paired
      if (m.tool_call_id && pairedIds.has(m.tool_call_id)) {
        sanitizedMessages.push({
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.tool_call_id,
        });
      }
      // Drop orphaned tool results silently
    } else {
      sanitizedMessages.push({ role: m.role, content: m.content || '' });
    }
  }

  return sanitizedMessages;
}

export async function sendWithTools(
  messages: Message[],
  config: DehaConfig,
  tools: ToolDefinition[],
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  toolChoice: 'auto' | 'required' = 'auto',
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  if (config.provider !== 'claude') {
    const sanitizedMessages = sanitizeHistoryForOpenAI(messages);
    const r = await sendWithToolsOpenAICompat(sanitizedMessages, config, tools, onChunk, abortSignal, toolChoice);
    return { text: r.text, toolCalls: r.toolCalls };
  }

  const apiKey = config.anthropicApiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY eksik');

  const client = new Anthropic({ apiKey });
  const response = await withSpinner(config, 'düşünüyor', () => client.messages.create({
    model: config.claudeModel,
    max_tokens: config.toolMaxTokens ?? config.maxTokens,
    system: config.systemPrompt,
    tools,
    tool_choice: toolChoice === 'required' ? { type: 'any' } : { type: 'auto' },
    messages: toClaudeMessages(messages),
  }, { signal: abortSignal }));

  recordUsage(
    'anthropic',
    config.claudeModel,
    'agent',
    response.usage.input_tokens,
    response.usage.output_tokens,
    config,
  );

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

export type OAIMessage = Record<string, unknown>;

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
  const toolMaxTokens = role.maxTokens ?? config.toolMaxTokens ?? config.maxTokens;

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
  applyOpenAICompatProviderOptions(body, role.provider, config);

  // DeepSeek non-reasoning models hard-cap at 8192 output tokens
  // Sending more causes 400 Bad Request from the API
  if (role.provider === 'deepseek' && !modelSupportsThinking(role.model as string)) {
    body.max_tokens = Math.min((body.max_tokens as number), 8192);
  }

  let response;
  try {
    response = await withSpinner(config, 'düşünüyor', () => axios.post(`${apiUrl}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 300000,
      signal: abortSignal,
    }));
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
  const agentUsage = extractUsageTokens(response.data.usage, msg);
  if (agentUsage.input > 0 || agentUsage.output > 0) {
    recordUsage(role.provider, role.model, 'agent', agentUsage.input, agentUsage.output, config, agentUsage.reasoning);
  }
  writeOpenAICompatDebugFile('last-openai-tool-message.json', msg);
  const sanitizedAssistantMsg = sanitizeOpenAICompatAssistantMessage(
    msg,
    true
  );
  writeOpenAICompatDebugFile('last-openai-tool-message-sanitized.json', sanitizedAssistantMsg);

  const text: string = (sanitizedAssistantMsg.content as string) ?? '';
  if (text && onChunk) onChunk(text);

  const rawToolCalls = ((sanitizedAssistantMsg.tool_calls as Record<string, unknown>[]) ?? []);
  const toolCalls: ToolCall[] = rawToolCalls
    .map((tc) => {
      const fn = tc.function as { name?: string; arguments?: string } | undefined;
      const name = fn?.name?.trim();
      const rawArguments = normalizeToolArguments(fn?.arguments);
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

function sanitizeOpenAICompatAssistantMessage(
  msg: OAIMessage,
  preserveReasoningForToolCalls = false,
): OAIMessage {
  const msgToolCalls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls as Record<string, unknown>[]
    : [];
  const hasToolCalls = msgToolCalls.length > 0;
  const sanitized: OAIMessage = {
    role: 'assistant',
    content: hasToolCalls ? null : (typeof msg.content === 'string' ? msg.content : ''),
  };

  if (
    typeof msg.reasoning_content === 'string' &&
    msg.reasoning_content.trim() &&
    (!hasToolCalls || preserveReasoningForToolCalls)
  ) {
    sanitized.reasoning_content = msg.reasoning_content;
  }

  if (hasToolCalls) {
    sanitized.tool_calls = msgToolCalls
      .map((tc) => {
        const id = typeof tc?.id === 'string' ? tc.id : '';
        const fn = tc?.function as { name?: unknown; arguments?: unknown } | undefined;
        const name = typeof fn?.name === 'string' ? fn.name : '';
        const rawArguments = normalizeToolArguments(fn?.arguments);
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

function normalizeToolArguments(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

const DEEPSEEK_REASONING_MODELS = new Set([
  'deepseek-reasoner',
  'deepseek-r1',
  'deepseek-r1-zero',
]);

function modelSupportsThinking(model: string): boolean {
  const lower = model.toLowerCase();
  return DEEPSEEK_REASONING_MODELS.has(lower)
    || lower.includes('reasoner')
    || lower.includes('-r1');
}

function applyOpenAICompatProviderOptions(
  body: Record<string, unknown>,
  provider: Provider,
  config: DehaConfig,
): void {
  if (provider !== 'deepseek') return;

  const model = (body.model as string) ?? '';

  if (config.deepseekThinking === 'enabled' && modelSupportsThinking(model)) {
    // Reasoning models: enable thinking, drop temperature
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = config.deepseekReasoningEffort;
    delete body.temperature;
  } else {
    // Non-reasoning models (deepseek-chat, deepseek-v4-flash, etc.):
    // Do NOT send thinking param — unsupported models return errors or behave oddly
    delete body.thinking;
    delete body.reasoning_effort;
  }
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
  const axiosMsg = err.message ? `: ${err.message}` : '';
  return new Error(`API request failed${status ? ` (${status})` : ''}${axiosMsg}${detail}`);
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
  }
}

type TrackFn = (inp: number, out: number, reasoning?: number, cache?: number) => void;

interface UsageTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: number;
}

function extractUsageTokens(usage: unknown, assistantMessage?: OAIMessage): UsageTokens {
  const u = (usage && typeof usage === 'object') ? usage as Record<string, unknown> : {};
  const input = readNumber(u.prompt_tokens) ?? readNumber(u.input_tokens) ?? 0;
  const baseOutput = readNumber(u.completion_tokens) ?? readNumber(u.output_tokens) ?? 0;
  
  const explicitReasoning = extractReasoningTokens(u);
  const explicitCache = extractCacheTokens(u);
  
  const visibleText = typeof assistantMessage?.content === 'string' ? assistantMessage.content : '';
  const reasoningText = typeof assistantMessage?.reasoning_content === 'string' ? assistantMessage.reasoning_content : '';
  const visibleEstimate = estimateTextTokens(visibleText);
  const reasoningEstimate = explicitReasoning > 0 ? explicitReasoning : estimateTextTokens(reasoningText);
  const fallbackOutput = visibleEstimate + reasoningEstimate;

  return {
    input,
    output: Math.max(baseOutput, fallbackOutput),
    reasoning: reasoningEstimate,
    cache: explicitCache,
  };
}

function extractCacheTokens(usage: Record<string, unknown>): number {
  const details =
    asRecord(usage.prompt_tokens_details) ??
    asRecord(usage.input_tokens_details) ??
    asRecord(usage.usage_details);

  return readNumber(details?.cached_tokens) ??
    readNumber(details?.cache_read_tokens) ??
    readNumber(details?.cache_hit_tokens) ??
    readNumber(usage.prompt_cache_hit_tokens) ??
    0;
}

function extractReasoningTokens(usage: Record<string, unknown>): number {
  const details =
    asRecord(usage.completion_tokens_details) ??
    asRecord(usage.output_tokens_details) ??
    asRecord(usage.usage_details);

  return readNumber(details?.reasoning_tokens) ??
    readNumber(details?.reasoning) ??
    readNumber(usage.reasoning_tokens) ??
    0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function estimateTextTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 4);
}

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
    messages: toClaudeMessages(messages),
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
    messages: toClaudeMessages(messages),
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

async function sendOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  provider: Provider,
  model: string,
  messages: Message[],
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  config: DehaConfig,
  track?: TrackFn,
  openrouterProvider?: string,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const body: Record<string, unknown> = {
    model,
    messages: [
        { role: 'system', content: systemPrompt }, 
        ...sanitizeHistoryForOpenAI(messages)
    ],
    max_tokens: maxTokens,
    temperature,
  };
  if (openrouterProvider) {
    body.provider = { only: [openrouterProvider], allow_fallbacks: false };
  }
  applyOpenAICompatProviderOptions(body, provider, config);
  const response = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  const msg = response.data.choices[0].message as OAIMessage;
  const usage = extractUsageTokens(response.data.usage, msg);
  if (usage.input > 0 || usage.output > 0) track?.(usage.input, usage.output, usage.reasoning, usage.cache);
  return typeof msg.content === 'string' ? msg.content : '';
}

async function streamOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  provider: Provider,
  model: string,
  messages: Message[],
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  config: DehaConfig,
  onChunk: (chunk: string) => void,
  track?: TrackFn,
  openrouterProvider?: string,
  onReasoning?: (chunk: string) => void,
): Promise<string> {
  if (!apiKey) throw new Error(`API key missing (${baseUrl})`);
  const body: Record<string, unknown> = {
    model,
    messages: [
        { role: 'system', content: systemPrompt }, 
        ...sanitizeHistoryForOpenAI(messages)
    ],
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (openrouterProvider) {
    body.provider = { only: [openrouterProvider], allow_fallbacks: false };
  }
  applyOpenAICompatProviderOptions(body, provider, config);
  const response = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    responseType: 'stream',
  });
  return parseSSEStream(response.data, onChunk, track, onReasoning);
}

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
      messages: [
          { role: 'system', content: systemPrompt }, 
          ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
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
      messages: [
          { role: 'system', content: systemPrompt }, 
          ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
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

function parseSSEStream(
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: string) => void,
  track?: TrackFn,
  onReasoning?: (chunk: string) => void,
): Promise<string> {
  let full = '';
  let reasoningContent = '';
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
          const reasoningDelta: string = parsed.choices?.[0]?.delta?.reasoning_content ?? '';
          if (delta) { onChunk(delta); full += delta; }
          if (reasoningDelta) {
            if (onReasoning) onReasoning(reasoningDelta);
            reasoningContent += reasoningDelta;
          }
          if (parsed.usage && track) {
            const usage = extractUsageTokens(parsed.usage, {
              role: 'assistant',
              content: full,
              reasoning_content: reasoningContent,
            });
            track(usage.input, usage.output, usage.reasoning, usage.cache);
          }
        } catch { /* skip */ }
      }
    });
    stream.on('end', () => resolve(full));
    stream.on('error', reject);
  });
}
