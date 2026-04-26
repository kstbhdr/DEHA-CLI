import chalk from 'chalk';
import { DehaConfig } from '../config';
import { Message, sendWithTools } from '../services/ai-service';
import { DEHA_TOOLS, executeTool, executeToolAsync, printToolCall } from '../tools';
import { mcpManager } from '../mcp/manager';

const MAX_TOOL_ROUNDS = 10;

export async function runAgent(
  userMessage: string,
  config: DehaConfig,
  history: Message[] = [],
): Promise<string> {
  // Claude değilse araç çağırma yok
  if (config.provider !== 'claude') {
    const { streamMessage } = await import('../services/ai-service');
    console.log('\n' + chalk.bold.cyan('DEHA:'));
    let full = '';
    await streamMessage(
      [...history, { role: 'user', content: userMessage }],
      config,
      (chunk) => { process.stdout.write(chunk); full += chunk; },
    );
    process.stdout.write('\n');
    return full;
  }

  // Tüm araçlar: yerel + MCP
  const mcpTools = mcpManager.getAnthropicTools();
  const allTools = [...DEHA_TOOLS, ...mcpTools];

  if (mcpTools.length > 0) {
    console.log(chalk.dim(`  [${mcpTools.length} MCP aracı aktif]\n`));
  }

  const messages: Message[] = [...history, { role: 'user', content: userMessage }];
  let round = 0;
  let finalText = '';

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    console.log('\n' + chalk.bold.cyan('DEHA:'));

    const { text, toolCalls } = await sendWithTools(messages, config, allTools, (chunk) => {
      process.stdout.write(chunk);
      finalText += chunk;
    });

    if (text) process.stdout.write('\n');

    if (toolCalls.length === 0) break;

    const toolResultBlocks: string[] = [];

    for (const tc of toolCalls) {
      printToolCall(tc.name, tc.input);

      let result: string;

      if (mcpManager.isMcpTool(tc.name)) {
        try {
          result = await mcpManager.callTool(tc.name, tc.input);
        } catch (err: unknown) {
          result = `HATA: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        // Sync tool dene, async ise executeToolAsync kullan
        const syncResult = executeTool(tc.name, tc.input);
        if (syncResult.startsWith('__ASYNC_TOOL__:')) {
          result = await executeToolAsync(tc.name, tc.input, config);
        } else {
          result = syncResult;
        }
      }

      const preview = result.length > 200 ? result.slice(0, 200) + '…' : result;
      console.log(chalk.dim('    → ') + chalk.gray(preview));

      toolResultBlocks.push(
        `<tool_result name="${tc.name}" id="${tc.id}">\n${result}\n</tool_result>`,
      );

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
