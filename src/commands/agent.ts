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
    ? `\n\n## ACTIVE WORKING DIRECTORY\nYou are working inside: ${workDir}\nALWAYS use this directory as the base for ALL file operations (read_file, list_dir, search_in_files, write_file, run_shell). NEVER look outside this directory unless explicitly told to.`
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

const MAX_TOOL_ROUNDS = 10; // default fallback, config'den override edilir

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

  while (round < maxRounds) {
    round++;
    console.log('\n' + chalk.bold.cyan('DEHA:'));

    const { text, toolCalls } = await sendWithTools(messages, config, allTools, (chunk) => {
      process.stdout.write(chunk);
      finalText += chunk;
    }, abortSignal);

    if (text) process.stdout.write('\n');
    if (toolCalls.length === 0) break;

    const toolResultBlocks: string[] = [];

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
    );

    if (text) process.stdout.write('\n');

    if (toolCalls.length === 0) {
      finalText = text;
      break;
    }

    // Assistant mesajını (tool_calls ile birlikte) geçmişe ekle
    messages.push(rawAssistantMsg);

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
