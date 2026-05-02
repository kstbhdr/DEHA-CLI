import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message, OAIMessage, sendWithTools, sendWithToolsOpenAICompat } from '../services/ai-service';
import { DEHA_TOOLS, executeTool, executeToolAsync, printToolCall } from '../tools';
import { mcpManager } from '../mcp/manager';
import { getWorkDir } from '../services/session-memory';

/** WorkDir bilgisini config'e system prompt olarak enjekte et */
function injectWorkDir(config: DehaConfig): DehaConfig {
  const workDir = getWorkDir();
  const workDirNote = workDir
    ? `\n\n[PROJECT CONTEXT]\n- ACTIVE WORKING DIRECTORY: ${workDir}\n- CRITICAL RULE: You are currently working in this project. All file operations (read, write, list, search) and shell commands MUST be performed within this directory. Do NOT look at C:\\Users\\BAHADIR or other parent directories unless the user explicitly asks for a different project.\n- FOCUS: Stay within the project context. If you need to list files, list the ones in ${workDir} first.`
    : '';
  return {
    ...config,
    systemPrompt: config.systemPrompt + workDirNote,
  };
}

export async function runAgent(
  userMessage: string,
  config: DehaConfig,
  history: Message[] = [],
  abortSignal?: AbortSignal,
): Promise<string> {
  const mcpTools = mcpManager.getAnthropicTools();
  const allTools = [...DEHA_TOOLS, ...mcpTools];

  if (mcpTools.length > 0) {
    console.log(chalk.dim(`  [${mcpTools.length} MCP aracı aktif]\n`));
  }

  // WorkDir'i system prompt'a enjekte et
  const enrichedConfig = injectWorkDir(config);

  // Claude → native tool calling
  if (config.provider === 'claude') {
    return runAgentClaude(userMessage, enrichedConfig, history, allTools, abortSignal);
  }

  // OpenAI-uyumlu providerlar (DeepSeek, OpenAI, OpenRouter, xAI, custom)
  return runAgentOpenAI(userMessage, enrichedConfig, history, allTools, abortSignal);
}

const MAX_TOOL_ROUNDS = 30; // Büyük görevlerde nefesi kesilmemesi için artırıldı
const MAX_AUTO_CONTINUE_ROUNDS = 6;

// ─── Claude agent döngüsü ────────────────────────────────────────────────────

async function runAgentClaude(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<string> {
  const messages: Message[] = [...history, { role: 'user', content: userMessage }];
  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;

  while (round < maxRounds) {
    round++;
    console.log('\n' + chalk.bold.cyan('DEHA:'));

    const { text, toolCalls } = await sendWithTools(messages, config, allTools, (chunk) => {
      process.stdout.write(chunk);
      finalText += chunk;
    }, abortSignal, forceToolUse ? 'required' : 'auto');

    if (text) process.stdout.write('\n');
    if (toolCalls.length === 0) {
      finalText = text;
      if (shouldAutoContinue(text, round, maxRounds, autoContinueRounds)) {
        autoContinueRounds++;
        forceToolUse = true;
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: AUTO_CONTINUE_PROMPT,
        });
        continue;
      }
      break;
    }

    const toolResultBlocks: string[] = [];
    autoContinueRounds = 0;
    forceToolUse = false;

    for (const tc of toolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config);
      const preview = result.length > 200 ? result.slice(0, 200) + '…' : result;
      console.log(chalk.dim('    → ') + chalk.gray(preview));
      toolResultBlocks.push(`<tool_result name="${tc.name}" id="${tc.id}">\n${result}\n</tool_result>`);
      finalText = text;
    }

    messages.push({ role: 'assistant', content: text || '(tool çağrısı)' });
    messages.push({
      role: 'user',
      content: toolResultBlocks.join('\n\n') + '\n\nBu sonuçları kullanarak devam et.',
    });
  }

  return finalText;
}

// ─── OpenAI-uyumlu agent döngüsü ────────────────────────────────────────────

async function runAgentOpenAI(
  userMessage: string,
  config: DehaConfig,
  history: Message[],
  allTools: typeof DEHA_TOOLS,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Geçmiş mesajları OpenAI formatına dönüştür
  const messages: OAIMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const maxRounds = config.maxToolRounds || MAX_TOOL_ROUNDS;
  let round = 0;
  let finalText = '';
  let autoContinueRounds = 0;
  let forceToolUse = false;

  while (round < maxRounds) {
    round++;
    console.log('\n' + chalk.bold.cyan('DEHA:'));

    const { text, toolCalls, rawAssistantMsg } = await sendWithToolsOpenAICompat(
      messages,
      config,
      allTools,
      (chunk) => {
        process.stdout.write(chunk);
        finalText += chunk;
      },
      abortSignal,
      forceToolUse ? 'required' : 'auto',
    );

    if (text) process.stdout.write('\n');

    if (toolCalls.length === 0) {
      finalText = text;
      if (shouldAutoContinue(text, round, maxRounds, autoContinueRounds)) {
        autoContinueRounds++;
        forceToolUse = true;
        messages.push(rawAssistantMsg);
        messages.push({ role: 'user', content: AUTO_CONTINUE_PROMPT });
        continue;
      }
      break;
    }

    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
    messages.push(rawAssistantMsg);
    autoContinueRounds = 0;
    forceToolUse = false;

    // Tool'ları çalıştır ve sonuçları ekle
    for (const tc of toolCalls) {
      printToolCall(tc.name, tc.input);
      const result = await runTool(tc.name, tc.input, config);
      const preview = result.length > 200 ? result.slice(0, 200) + '…' : result;
      console.log(chalk.dim('    → ') + chalk.gray(preview));

      // OpenAI tool result format
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });

      finalText = text;
    }
  }

  return finalText;
}

const AUTO_CONTINUE_PROMPT = [
  'Bu yanıt bir ara durum güncellemesi olarak algılandı.',
  'Kullanıcıdan yeni bir mesaj bekleme ve onay isteme.',
  'Az önce söylediğin inceleme, arama, okuma veya düzenleme adımını şimdi gerçekten uygula.',
  'Gerekliyse tool kullanarak devam et ve görev tamamlanana kadar ilerle.',
  'Sadece kendi başına çözülemeyen gerçek bir blokaj varsa dur.',
].join(' ');

function shouldAutoContinue(
  text: string,
  round: number,
  maxRounds: number,
  autoContinueRounds: number,
): boolean {
  if (!text.trim()) return false;
  if (round >= maxRounds) return false;
  if (autoContinueRounds >= MAX_AUTO_CONTINUE_ROUNDS) return false;

  const normalized = text.toLowerCase().trim();
  if (normalized.length > 500) return false;

  const interimPatterns = [
    /\bgörelim\b/,
    /\bbulup\b/,
    /\bbakayım\b/,
    /\binceleyeyim\b/,
    /\binceleyelim\b/,
    /\bekleyeceğim\b/,
    /\bbelirleyelim\b/,
    /\bson satırları\b/,
    /\bfonksiyonunu\b.*\bgörelim\b/,
    /\bşimdi\b.*\b(bakayım|görelim|inceleyelim|bulayım)\b/,
    /\blet me\b.*\b(check|inspect|find|look)\b/,
    /\bi('| a)?ll\b.*\b(check|inspect|look|find)\b/,
  ];

  const containsInterimLanguage = interimPatterns.some((pattern) => pattern.test(normalized));
  const looksLikeProgressOnly =
    normalized.endsWith(':') ||
    normalized.endsWith('...') ||
    normalized.includes('ekleme yapacağım yeri') ||
    normalized.includes('ona göre') ||
    normalized.includes('then i') ||
    normalized.includes('next i');

  return containsInterimLanguage || looksLikeProgressOnly;
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
