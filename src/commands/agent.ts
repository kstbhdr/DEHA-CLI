import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message, OAIMessage, ToolCall, sendWithTools, sendWithToolsOpenAICompat, sanitizeHistoryForOpenAI } from '../services/ai-service';
import { DEHA_TOOLS, executeTool, executeToolAsync, printToolCall } from '../tools';
import { mcpManager } from '../mcp/manager';
import { getWorkDir } from '../services/session-memory';
import { logger } from '../services/logger';

/** WorkDir bilgisini config'e system prompt olarak enjekte et */
export function injectWorkDir(config: DehaConfig, customSystemPrompt?: string): DehaConfig {
  const workDir = getWorkDir();
  const basePrompt = customSystemPrompt ?? config.systemPrompt;
  const workDirNote = workDir
    ? `\n\n[PROJECT CONTEXT]\n- ACTIVE WORKING DIRECTORY: ${workDir}\n- CRITICAL RULE: You are currently working in this project. All file operations (read, write, list, search) and shell commands MUST be performed within this directory by default.\n- If the user explicitly asks for another absolute path or says "root dizini", "/root", "VPS root", or similar, use that requested path exactly. In that case, "/root" means the server root user's home directory, NOT the project root.\n- Do NOT look at C:\\Users\\BAHADIR or other parent directories unless the user explicitly asks for a different project/path.\n- FOCUS: Stay within the project context unless the user explicitly names another path. If you need to list files without a specific path, list ${workDir} first.`
    : '';
  return {
    ...config,
    systemPrompt: basePrompt + workDirNote,
  };
}

export interface AgentResult {
  response: string;
  messages: Message[]; // The complete turn history
}

export async function runAgent(
  userMessage: string,
  config: DehaConfig,
  history: Message[] = [],
  abortSignal?: AbortSignal,
  customSystemPrompt?: string,
): Promise<AgentResult> {
  const mcpTools = mcpManager.getAnthropicTools();
  const allTools = [...DEHA_TOOLS, ...mcpTools];

  if (mcpTools.length > 0) {
    logger.write(chalk.dim(`  [${mcpTools.length} MCP aracı aktif]\n`));
  }

  // WorkDir'i system prompt'a enjekte et
  const enrichedConfig = injectWorkDir(config, customSystemPrompt);

  // Claude → native tool calling
  if (config.provider === 'claude') {
    return runAgentClaude(userMessage, enrichedConfig, history, allTools, abortSignal);
  }

  // OpenAI-uyumlu providerlar (DeepSeek, OpenAI, OpenRouter, xAI, custom)
  return runAgentOpenAI(userMessage, enrichedConfig, history, allTools, abortSignal);
}

const MAX_TOOL_ROUNDS = 200;
const MAX_AUTO_CONTINUE_ROUNDS = 6;
const MAX_POST_TOOL_COMPLETION_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 32_000;

// ─── Claude agent döngüsü ────────────────────────────────────────────────────

async function runAgentClaude(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<AgentResult> {
  const messages: Message[] = [...history];
  const startIdx = history.length;
  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;
  let consecutiveToolFailures = 0;

  while (round < maxRounds) {
    round++;
    let roundText = '';

    const { text, toolCalls } = await sendWithTools(messages, config, allTools, (chunk) => {
      roundText += chunk;
    }, abortSignal, forceToolUse ? 'required' : 'auto');
    const effectiveToolCalls = toolCalls.length > 0
      ? toolCalls
      : parseInlineXmlToolCalls(text, allTools);

    if (effectiveToolCalls.length === 0) {
      finalText = text;
      const shouldContinue = hadToolActivity
        ? await shouldContinueAfterToolPhase(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            postToolCompletionRounds,
          )
        : await shouldContinueAfterNoToolResponse(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            autoContinueRounds,
            aggressiveAutoContinue,
          );

      if (shouldContinue) {
        autoContinueRounds++;
        forceToolUse = true;
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }
      if (text && !isSilentInterimOutput(text)) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(roundText);
        logger.raw('\n');
      } else if (hadToolActivity) {
        // Tool aktivitesi vardı ama son yanıt silent/boş çıktı — özet iste
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.dim('[Agent araştırmayı tamamladı. Yukarıdaki tool çıktılarına bakabilirsin.]\n'));
      }
      break;
    }

    const toolResultBlocks: string[] = [];
    hadToolActivity = true;
    postToolCompletionRounds = 0;
    autoContinueRounds = 0;
    forceToolUse = false;

    if (text && !isSilentInterimOutput(text)) {
      logger.write('\n' + chalk.bold.cyan('DEHA:'));
      logger.raw(roundText);
      logger.raw('\n');
    }

    for (const tc of effectiveToolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const previewText = compactedResult.trim();
      const preview = previewText.length === 0
        ? chalk.red('(boş sonuç — timeout veya bağlantı hatası olabilir)')
        : chalk.gray(previewText.length > 200 ? previewText.slice(0, 200) + '…' : previewText);
      logger.write(chalk.dim('    → ') + preview);
      toolResultBlocks.push(`<tool_result name="${tc.name}" id="${tc.id}">\n${compactedResult}\n</tool_result>`);
      finalText = text;

      // Error tracking
      if (isToolError(compactedResult)) {
        consecutiveToolFailures++;
      } else {
        consecutiveToolFailures = 0;
      }
    }

    // Round budget awareness
    let budgetWarning = '';
    if (round > 0 && round % 15 === 0) {
      logger.write(chalk.dim(`  ⚠ ${round} tool rounds used\n`));
    }
    if (round === 50) {
      budgetWarning = '\n[SYSTEM WARNING] 50 tool rounds used. Is the task still incomplete? Work efficiently, avoid unnecessary repetition.';
    }

    // Error recovery
    let errorRecovery = '';
    if (consecutiveToolFailures >= 3) {
      errorRecovery = '\n' + ERROR_RECOVERY_PROMPT;
      consecutiveToolFailures = 0;
    }

    messages.push({ role: 'assistant', content: text || '[tool calls]' });
    messages.push({
      role: 'user',
      content: toolResultBlocks.join('\n\n') + '\n\nUse these results to continue.' + budgetWarning + errorRecovery,
    });
  }

  return { response: finalText, messages: messages.slice(startIdx) };
}

// ─── OpenAI-uyumlu agent döngüsü ────────────────────────────────────────────

async function runAgentOpenAI(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<AgentResult> {
  // Geçmiş mesajları OpenAI formatına dönüştür + mutual-pairing ile orphan tool mesajlarını temizle
  const startIdx = history.length;
  const sanitizedHistory = sanitizeHistoryForOpenAI(history);
  const messages: OAIMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...sanitizedHistory,
  ];

  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  const aggressiveAutoContinue = wantsUninterruptedExecution(userMessage);
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;
  let hadToolActivity = false;
  let postToolCompletionRounds = 0;
  let consecutiveToolFailures = 0;

  while (round < maxRounds) {
    round++;
    let roundText = '';

    const { text, toolCalls, rawAssistantMsg, malformedToolCalls } = await sendWithToolsOpenAICompat(
      messages,
      config,
      allTools,
      (chunk) => {
        roundText += chunk;
      },
      abortSignal,
      forceToolUse ? 'required' : 'auto',
    );
    const inlineToolCalls = toolCalls.length > 0 ? [] : parseInlineXmlToolCalls(text, allTools);
    const effectiveToolCalls = toolCalls.length > 0 ? toolCalls : inlineToolCalls;
    let effectiveAssistantMsg = inlineToolCalls.length > 0
      ? withSyntheticOpenAIToolCalls(rawAssistantMsg, inlineToolCalls)
      : rawAssistantMsg;

    if (effectiveToolCalls.length > 0 && effectiveAssistantMsg.tool_calls && Array.isArray(effectiveAssistantMsg.tool_calls)) {
      const validIds = new Set(effectiveToolCalls.map(tc => tc.id));
      effectiveAssistantMsg = {
        ...effectiveAssistantMsg,
        tool_calls: effectiveAssistantMsg.tool_calls.filter((tc: any) => validIds.has(tc.id))
      };
    }

    if (malformedToolCalls > 0 && effectiveToolCalls.length === 0) {
      forceToolUse = true;
      messages.push({
        role: 'user',
        content: MALFORMED_TOOL_CALL_PROMPT,
      });
      continue;
    }

    if (effectiveToolCalls.length === 0) {
      finalText = text;
      const shouldContinue = hadToolActivity
        ? await shouldContinueAfterToolPhase(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            postToolCompletionRounds,
          )
        : await shouldContinueAfterNoToolResponse(
            userMessage,
            text,
            config,
            round,
            maxRounds,
            autoContinueRounds,
            aggressiveAutoContinue,
          );

      if (shouldContinue) {
        autoContinueRounds++;
        forceToolUse = true;
        messages.push(effectiveAssistantMsg);
        messages.push({
          role: 'user',
          content: hadToolActivity ? POST_TOOL_CONTINUE_PROMPT : AUTO_CONTINUE_PROMPT,
        });
        if (hadToolActivity) {
          postToolCompletionRounds++;
        }
        continue;
      }
      const reasoningText = rawAssistantMsg.reasoning_content 
        ? chalk.dim(chalk.gray(`\n<think>\n${rawAssistantMsg.reasoning_content}\n</think>\n`))
        : '';
        
      const hasVisibleOutput = (text && !isSilentInterimOutput(text)) || reasoningText;

      if (hasVisibleOutput) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        if (reasoningText) logger.raw(reasoningText);
        if (text && !isSilentInterimOutput(text)) logger.raw(roundText);
        logger.raw('\n');
      } else if (hadToolActivity) {
        logger.write('\n' + chalk.bold.cyan('DEHA:'));
        logger.raw(chalk.dim('[Agent araştırmayı tamamladı. Yukarıdaki tool çıktılarına bakabilirsin.]\n'));
      }
      break;
    }

    const reasoningText = rawAssistantMsg.reasoning_content 
      ? chalk.dim(chalk.gray(`\n<think>\n${rawAssistantMsg.reasoning_content}\n</think>\n`))
      : '';
      
    const hasVisibleOutput = (text && !isSilentInterimOutput(text)) || reasoningText;

    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
    messages.push(effectiveAssistantMsg);
    hadToolActivity = true;
    postToolCompletionRounds = 0;
    autoContinueRounds = 0;
    forceToolUse = false;

    if (hasVisibleOutput) {
      logger.write('\n' + chalk.bold.cyan('DEHA:'));
      if (reasoningText) logger.raw(reasoningText);
      if (text && !isSilentInterimOutput(text)) logger.raw(roundText);
      logger.raw('\n');
    }

    // Tool'ları çalıştır ve sonuçları ekle
    for (const tc of effectiveToolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config);
      const compactedResult = compactToolResultForModel(tc.name, result);
      const previewText = compactedResult.trim();
      const preview = previewText.length === 0
        ? chalk.red('(boş sonuç — timeout veya bağlantı hatası olabilir)')
        : chalk.gray(previewText.length > 200 ? previewText.slice(0, 200) + '…' : previewText);
      logger.write(chalk.dim('    → ') + preview);

      // Error tracking
      if (isToolError(compactedResult)) {
        consecutiveToolFailures++;
      } else {
        consecutiveToolFailures = 0;
      }

      // OpenAI tool result format
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: compactedResult,
      });

      finalText = text;
    }

    // Round budget awareness
    if (round > 0 && round % 15 === 0) {
      logger.write(chalk.dim(`  ⚠ ${round} tool rounds used\n`));
    }
    if (round === 50) {
      messages.push({ role: 'user', content: '[SYSTEM WARNING] 50 tool rounds used. Is the task still incomplete? Work efficiently, avoid unnecessary repetition.' });
    }

    // Error recovery injection
    if (consecutiveToolFailures >= 3) {
      messages.push({ role: 'user', content: ERROR_RECOVERY_PROMPT });
      consecutiveToolFailures = 0;
    }
  }

  // Convert internal OAIMessage back to Message[] for history
  const resultHistory: Message[] = messages
    .filter(m => m.role !== 'system')
    .slice(startIdx) // Take only the new messages from this turn
    .map(m => ({
      role: m.role as any,
      content: typeof m.content === 'string' ? m.content : (m.content === null ? '' : String(m.content)),
      tool_calls: m.tool_calls as any[],
      tool_call_id: m.tool_call_id as string,
      reasoning_content: m.reasoning_content as string
    }));

  return { response: finalText, messages: resultHistory };
}

function compactToolResultForModel(toolName: string, result: string): string {
  const maxChars = readPositiveInt(process.env.DEHA_MAX_TOOL_RESULT_CHARS, MAX_TOOL_RESULT_CHARS);
  if (!result || result.length <= maxChars) return result;

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.max(0, maxChars - headChars - 260);
  const omitted = result.length - headChars - tailChars;

  return [
    result.slice(0, headChars),
    '',
    `[DEHA TOOL OUTPUT TRUNCATED: ${toolName} sonucu ${result.length} karakterdi; ${omitted} karakter modele gönderilmedi. Daha spesifik path/pattern ile tekrar çağır.]`,
    '',
    tailChars > 0 ? result.slice(-tailChars) : '',
  ].join('\n');
}

/** 
 * Geçmişteki devasa tool çıktılarını özetler.
 * Mesaj geçmişinde 5 turdan eski olan tool sonuçlarını 
 * "[TOOL: name -> OKUNDU/ÇALIŞTIRILDI]" formatına indirger.
 */
export function summarizeOldToolResults(history: Message[], keepCount = 10): Message[] {
  if (history.length <= keepCount) return history;
  
  const result: Message[] = [];
  const keepThreshold = history.length - keepCount;

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (i < keepThreshold && msg.role === 'tool') {
       const content = (msg.content || '').trim();
       
       // Kısa sonuçları olduğu gibi bırak
       if (content.length <= 500) {
         result.push(msg);
         continue;
       }
       
       // Hata mesajlarını asla kırpma
       const lower = content.toLowerCase();
       if (lower.includes('error') || lower.includes('hata') || lower.includes('failed') || lower.includes('exception')) {
         const summary = content.length <= 1500 
           ? content 
           : content.slice(0, 800) + `\n[... ${content.length - 1100} karakter kırpıldı ...]\n` + content.slice(-300);
         result.push({ ...msg, content: summary });
         continue;
       }
       
       // Büyük sonuçlar: head + tail koru
       const summary = content.slice(0, 300) + `\n[... tool sonucu kırpıldı: ${content.length} karakter → 450 karakter ...]\n` + content.slice(-150);
       result.push({ ...msg, content: summary });
    } else {
       result.push(msg);
    }
  }
  return result;
}


/**
 * DeepSeek DSML format parser.
 * DeepSeek sometimes emits tool calls as text in its internal DSML format:
 *   <｜｜DSML｜｜invoke name="tool_name">
 *     <｜｜DSML｜｜parameter name="param" string="true">value</｜｜DSML｜｜parameter>
 *   </｜｜DSML｜｜invoke>
 * instead of proper JSON tool_calls. This parser catches and executes them.
 */
function parseInlineDsmlToolCalls(text: string, tools: typeof DEHA_TOOLS): ToolCall[] {
  if (!text || !text.includes('DSML')) return [];

  const toolNames = new Set(tools.map((t) => t.name));
  const calls: ToolCall[] = [];

  // Match <*DSML*invoke name="tool_name">...</*DSML*invoke>
  const invokePattern = /<[^>]*DSML[^>]*invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[^>]*DSML[^>]*invoke>/gi;
  let invokeMatch: RegExpExecArray | null;

  while ((invokeMatch = invokePattern.exec(text)) !== null) {
    const name = invokeMatch[1].trim();
    if (!toolNames.has(name)) continue;

    const body = invokeMatch[2];
    const input: Record<string, unknown> = {};

    // 1. Standard DSML parameter: <*DSML*parameter name="key" ...>value</*DSML*parameter>
    const paramPattern = /<[^>]*DSML[^>]*parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[^>]*DSML[^>]*parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramPattern.exec(body)) !== null) {
      const key = paramMatch[1].trim();
      const val = decodeXmlEntities(paramMatch[2].trim());
      input[key] = coerceInlineXmlValue(val);
    }

    // 2. Short parameter format: <parameter=key>value</parameter>
    const shortParamPattern = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/gi;
    let shortParamMatch: RegExpExecArray | null;
    while ((shortParamMatch = shortParamPattern.exec(body)) !== null) {
      const key = shortParamMatch[1].trim();
      const val = decodeXmlEntities(shortParamMatch[2].trim());
      input[key] = coerceInlineXmlValue(val);
    }

    if (Object.keys(input).length > 0) {
      calls.push({ name, input, id: `dsml_${name}_${calls.length}_${Date.now()}` });
    }
  }

  return calls.slice(0, 8);
}

function parseInlineXmlToolCalls(text: string, tools: typeof DEHA_TOOLS): ToolCall[] {
  if (!text) return [];

  const toolNames = new Set(tools.map((tool) => tool.name));

  // 1. Markdown-style: [Tool Call: **read_file**({...})]  — xAI Grok, etc.
  const mdCalls = parseInlineMarkdownToolCalls(text, toolNames);
  if (mdCalls.length > 0) return mdCalls;

  // 2. DeepSeek DSML format
  if (text.includes('DSML')) {
    const dsmlCalls = parseInlineDsmlToolCalls(text, tools);
    if (dsmlCalls.length > 0) return dsmlCalls;
  }

  // 3. XML-style: <tool_name>...</tool_name>
  if (!text.includes('<')) return [];

  const calls: ToolCall[] = [];

  for (const name of toolNames) {
    const pattern = new RegExp(`<${escapeRegExp(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(name)}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const input = parseInlineXmlToolInput(name, match[1]);
      if (input) {
        calls.push({
          name,
          input,
          id: `inline_${name}_${calls.length}_${Date.now()}`,
        });
      }
    }
  }

  return calls.slice(0, 8);
}

/**
 * Parse markdown-style inline tool calls emitted by xAI Grok and similar models.
 * Matches patterns like:
 *   [Tool Call: **read_file**({"path":"/root/file.ts","start_line":1,"end_line":50})]
 *   [Tool Call: read_file({"path":"/root/file.ts"})]
 *   **read_file**({"path":"/root/file.ts"})
 */
function parseInlineMarkdownToolCalls(text: string, toolNames: Set<string>): ToolCall[] {
  const calls: ToolCall[] = [];

  // Pattern 1: [Tool Call: **name**({...})] or [Tool Call: name({...})]
  const toolCallPattern = /\[Tool\s*Call:\s*\*{0,2}(\w+)\*{0,2}\s*\((\{[\s\S]*?\})\)\s*\]/gi;
  let match: RegExpExecArray | null;
  while ((match = toolCallPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!toolNames.has(name)) continue;
    try {
      const input = JSON.parse(match[2]) as Record<string, unknown>;
      calls.push({ name, input, id: `md_${name}_${calls.length}_${Date.now()}` });
    } catch { /* JSON parse failed, skip */ }
  }

  if (calls.length > 0) return calls.slice(0, 8);

  // Pattern 2: Standalone **name**({...}) without [Tool Call:] wrapper
  const standalonePattern = /\*{2}(\w+)\*{2}\s*\((\{[\s\S]*?\})\)/gi;
  while ((match = standalonePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!toolNames.has(name)) continue;
    try {
      const input = JSON.parse(match[2]) as Record<string, unknown>;
      calls.push({ name, input, id: `md_${name}_${calls.length}_${Date.now()}` });
    } catch { /* JSON parse failed, skip */ }
  }

  return calls.slice(0, 8);
}

function parseInlineXmlToolInput(toolName: string, body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const jsonCandidate = extractJsonObject(trimmed);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // XML child tag parsing fallback.
    }
  }

  const input: Record<string, unknown> = {};
  const childPattern = /<([A-Za-z_][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let child: RegExpExecArray | null;
  while ((child = childPattern.exec(trimmed)) !== null) {
    input[child[1]] = coerceInlineXmlValue(decodeXmlEntities(child[2].trim()));
  }

  if (Object.keys(input).length > 0) return normalizeInlineToolInput(toolName, input);

  if (toolName === 'run_shell' || toolName === 'run_terminal') {
    return { command: decodeXmlEntities(trimmed) };
  }
  if (toolName === 'read_file' || toolName === 'cat' || toolName === 'list_dir' || toolName === 'ls') {
    return { path: decodeXmlEntities(trimmed) };
  }

  return null;
}

function normalizeInlineToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  if ((toolName === 'run_shell' || toolName === 'run_terminal') && input.command === undefined && typeof input.cmd === 'string') {
    input.command = input.cmd;
  }
  if ((toolName === 'read_file' || toolName === 'cat') && input.path === undefined && typeof input.file === 'string') {
    input.path = input.file;
  }
  return input;
}

function withSyntheticOpenAIToolCalls(message: OAIMessage, toolCalls: ToolCall[]): OAIMessage {
  return {
    ...message,
    role: 'assistant',
    content: typeof message.content === 'string' ? stripInlineXmlToolCalls(message.content, toolCalls) : '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.input),
      },
    })),
  };
}

function stripInlineXmlToolCalls(text: string, toolCalls: ToolCall[]): string {
  let stripped = text;
  for (const tc of toolCalls) {
    stripped = stripped.replace(new RegExp(`<${escapeRegExp(tc.name)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tc.name)}>`, 'gi'), '').trim();
  }
  return stripped;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function coerceInlineXmlValue(value: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  const jsonCandidate = extractJsonObject(value) ?? (value.startsWith('[') && value.endsWith(']') ? value : null);
  if (jsonCandidate) {
    try {
      return JSON.parse(jsonCandidate);
    } catch {
      return value;
    }
  }
  return value;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1000 ? parsed : fallback;
}

const AUTO_CONTINUE_PROMPT = [
  'This response was detected as an interim status update.',
  'Do not wait for user input or ask for permission.',
  'Actually execute the inspection, search, read, or edit step you just mentioned.',
  'Use tools as needed and continue until the task is complete.',
  'Only stop if there is a genuine blocker you cannot resolve on your own.',
].join(' ');

const POST_TOOL_CONTINUE_PROMPT = [
  'Tool results were just produced but the final user-facing response is not yet complete.',
  'If you made a code change, VERIFY FIRST: re-read the file (did the edit land correctly?), if you changed an API endpoint test it with curl and READ THE RESPONSE BODY.',
  'Getting HTTP 200 is NOT enough — prove that the response content is correct.',
  'If the information the user requested is already in the tool results, write the final concrete answer and stop.',
  'Only make the next tool call if it is directly required to answer the user\'s request.',
  'Do not expand scope or start inspecting unrelated code or config files.',
  '"I fixed it / Done" without testing is FORBIDDEN. You MUST test before claiming completion.',
].join(' ');

const MALFORMED_TOOL_CALL_PROMPT = [
  'The previous tool call was truncated or had malformed JSON.',
  'Retry the same step but produce only valid and complete tool calls.',
  'If you are writing a large file, break the content into smaller chunks or use a shorter tool call.',
  'Do not write interim status messages.',
].join(' ');

const ERROR_RECOVERY_PROMPT = [
  '[ERROR RECOVERY] The last 3 tool calls returned errors.',
  'Do NOT retry the same command — try a different approach.',
  'Analyze the root cause: file not found? wrong path? syntax error?',
  'Try a different file path, different command, or different parameters.',
  'If 3 different approaches all fail, explain the situation to the user and ask for help.',
].join(' ');

function isToolError(result: string): boolean {
  if (!result) return true;
  const lower = result.toLowerCase();
  return lower.startsWith('hata:') || lower.startsWith('error:') ||
    lower.includes('command failed') || lower.includes('enoent') ||
    lower.includes('permission denied') || lower.includes('not found') ||
    lower.includes('timeout') || lower.includes('connection refused') ||
    (lower.startsWith('{') && lower.includes('"error"'));
}

/** Check if the model's response contains a [STATUS: COMPLETE/CONTINUE/BLOCKED] tag */
function parseStatusTag(text: string): 'COMPLETE' | 'CONTINUE' | 'BLOCKED' | null {
  const match = text.match(/\[STATUS:\s*(COMPLETE|CONTINUE|BLOCKED)\]/i);
  return match ? match[1].toUpperCase() as any : null;
}

function shouldAutoContinue(
  text: string,
  round: number,
  maxRounds: number,
  autoContinueRounds: number,
  aggressiveAutoContinue = false,
): boolean {
  if (!text.trim()) return false;
  if (round >= maxRounds) return false;
  if (autoContinueRounds >= MAX_AUTO_CONTINUE_ROUNDS) return false;

  const normalized = text.toLowerCase().trim();
  if (normalized.length > 900) return false;

  if (aggressiveAutoContinue && !looksLikeFinalAnswer(normalized)) {
    return true;
  }

  return containsInterimLanguage(normalized);
}

const INTERIM_PATTERNS: RegExp[] = [
  /\bgörelim\b/,
  /\bbulup\b/,
  /\bbakayım\b/,
  /\bbakıyorum\b/,
  /\binceleyeyim\b/,
  /\binceleyelim\b/,
  /\binceleyeceğim\b/,
  /\binceleyecegim\b/,
  /\bkontrol edeyim\b/,
  /\bkontrol ediyorum\b/,
  /\bkontrol edeceğim\b/,
  /\bkontrol edecegim\b/,
  /\bgöreyim\b/,
  /\bgoreyim\b/,
  /\bekleyeceğim\b/,
  /\bbelirleyelim\b/,
  /\bson satırları\b/,
  /\bdurmuyorum\b/,
  /\byazıyorum\b/,
  /\byazacağım\b/,
  /\byazacagim\b/,
  /\bekliyorum\b/,
  /\bdüzelteceğim\b/,
  /\bdüzeltiyorum\b/,
  /\bduzeltiyorum\b/,
  /\bdüzenliyorum\b/,
  /\bduzenliyorum\b/,
  /\bgüncelliyorum\b/,
  /\bguncelliyorum\b/,
  /\bilerliyorum\b/,
  /\bbitireceğim\b/,
  /\beklemeden\b/,
  /\bfonksiyonunu\b.*\bgörelim\b/,
  /\bşimdi\b.*\b(bakayım|görelim|inceleyelim|bulayım)\b/,
  /\bşimdi\b.*\b(yazıyorum|ekliyorum|düzeltiyorum|okuyorum|bakıyorum)\b/,
  /\bhemen\b.*\b(yazıyorum|bakıyorum|ekliyorum|okuyorum)\b/,
  /\bönce\b.*\b(oku|okuyayım|bakayım|görelim|bulayım)\b/,
  /\b(yapacağım|edeceğim|ekleyeceğim|yazacağım|bakacağım|okuyacağım|bulacağım)\b/,
  /\blet me\b.*\b(check|inspect|find|look)\b/,
  /\bi('| a)?ll\b.*\b(check|inspect|look|find)\b/,
];

function containsInterimLanguage(normalized: string): boolean {
  if (looksLikePlanningJson(normalized)) return true;

  if (INTERIM_PATTERNS.some((p) => p.test(normalized))) return true;

  return (
    normalized.endsWith(':') ||
    normalized.endsWith('...') ||
    normalized.includes('ekleme yapacağım yeri') ||
    normalized.includes('ona göre') ||
    normalized.includes('then i') ||
    normalized.includes('next i')
  );
}

function isSilentInterimOutput(text: string): boolean {
  return looksLikePlanningJson(text.toLowerCase().trim());
}

function looksLikePlanningJson(normalized: string): boolean {
  if (!normalized) return false;
  if (!normalized.includes('execution_plan') && !normalized.includes('"steps"')) return false;
  return normalized.includes('"ready"') || normalized.includes('"files_to_check"') || normalized.includes('"action"');
}

async function shouldContinueAfterNoToolResponse(
  userMessage: string,
  assistantText: string,
  _config: DehaConfig,
  round: number,
  maxRounds: number,
  autoContinueRounds: number,
  aggressiveAutoContinue: boolean,
): Promise<boolean> {
  // Önce structured STATUS tag kontrolü
  const status = parseStatusTag(assistantText);
  if (status === 'COMPLETE') return false;
  if (status === 'BLOCKED') return false;
  if (status === 'CONTINUE') return autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS;

  // Fallback: regex heuristics
  if (shouldAutoContinue(assistantText, round, maxRounds, autoContinueRounds, aggressiveAutoContinue)) {
    return true;
  }

  if (!assistantText.trim()) {
    return aggressiveAutoContinue || autoContinueRounds < MAX_AUTO_CONTINUE_ROUNDS;
  }

  const normalized = assistantText.toLowerCase().trim();
  if (containsInterimLanguage(normalized)) return true;

  return false;
}

async function shouldContinueAfterToolPhase(
  userMessage: string,
  assistantText: string,
  _config: DehaConfig,
  round: number,
  maxRounds: number,
  postToolCompletionRounds: number,
): Promise<boolean> {
  if (round >= maxRounds) return false;
  if (postToolCompletionRounds >= MAX_POST_TOOL_COMPLETION_ROUNDS) return false;

  // Önce structured STATUS tag kontrolü
  const status = parseStatusTag(assistantText);
  if (status === 'COMPLETE') return false;
  if (status === 'BLOCKED') return false;
  if (status === 'CONTINUE') return true;

  const normalized = assistantText.toLowerCase().trim();

  // Boş cevap → devam et
  if (!normalized) return true;

  // Interim dil varsa devam
  if (containsInterimLanguage(normalized)) return true;

  return false;
}

function wantsUninterruptedExecution(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return normalized.includes('devam et')
    || normalized.includes('durma')
    || normalized.includes('bitene kadar')
    || normalized.includes('bitiresiye kadar')
    || normalized.includes('tamam devam et')
    || normalized.includes('sürekli devam');
}

function looksLikeFinalAnswer(text: string): boolean {
  // Sadece net bitiş ifadeleri final sayılır.
  // "tamamlandı", "sonuç" gibi kelimeler tek başına yeterli değil —
  // rapor sunarken de kullanılabilirler.
  const finalPatterns = [
    /\bgörev tamamlandı\b/,
    /\btask completed\b/,
    /\biş bitti\b/,
    /\ball done\b/,
    /\bsorun çözüldü\b/,
    /\bproblem solved\b/,
    /\btüm (adımlar|işlemler) (tamamlandı|bitti)\b/,
    /\bdone here\b/,
    /\bno further (action|changes) (needed|required)\b/,
  ];

  // Kod bloğu TEK BAŞINA final cevap sayılmaz — raporlamada kod olabilir.
  // Sadece metin ÇOK kısaysa ve kod bloğundan ibaretse final say.
  if (text.includes('```')) {
    const textWithoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
    if (textWithoutCode.length < 30) return true;
  }

  return finalPatterns.some((pattern) => pattern.test(text));
}


// ─── Tool yürütücü (ortak) ───────────────────────────────────────────────────

async function runTool(
  name: string,
  input: Record<string, unknown>,
  config: DehaConfig,
): Promise<string> {
  if (mcpManager.isMcpTool(name)) {
    try {
      return await mcpManager.callTool(name, input);
    } catch (err: unknown) {
      return `HATA: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const syncResult = executeTool(name, input);
  if (syncResult.startsWith('__ASYNC_TOOL__:')) {
    return await executeToolAsync(name, input, config);
  }
  return syncResult;
}
