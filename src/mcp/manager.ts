import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import chalk from 'chalk';
import { readMcpConfig, McpServerConfig } from './config';
import type { ToolDefinition } from '../services/ai-service';
import { DEHA_SEMVER } from '../version';

interface ConnectedServer {
  name: string;
  client: Client;
  tools: Tool[];
}

class McpManager {
  private servers: ConnectedServer[] = [];
  private connected = false;

  /** Tüm konfigüre edilmiş sunuculara bağlanır */
  async connectAll(silent = false): Promise<void> {
    const config = readMcpConfig();
    const names = Object.keys(config.servers);
    if (names.length === 0) return;

    if (!silent) process.stdout.write(chalk.dim(`MCP: ${names.length} sunucu bağlanıyor...`));

    const results = await Promise.allSettled(
      names.map((name) => this.connectServer(name, config.servers[name])),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.filter((r) => r.status === 'rejected').length;

    if (!silent) {
      process.stdout.write(
        chalk.green(` ✓ ${ok}`) +
        (fail > 0 ? chalk.red(` ✗ ${fail}`) : '') +
        '\n',
      );
    }

    this.connected = true;
  }

  private async connectServer(name: string, cfg: McpServerConfig): Promise<void> {
    const client = new Client({ name: `deha-${name}`, version: DEHA_SEMVER });

    let transport;
    if (cfg.transport === 'sse' && cfg.url) {
      transport = new SSEClientTransport(new URL(cfg.url));
    } else {
      transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: { ...process.env, ...(cfg.env ?? {}) } as Record<string, string>,
      });
    }

    await client.connect(transport);
    const { tools } = await client.listTools();

    this.servers.push({ name, client, tools });
  }

  /** Tüm sunucuların toollarını Anthropic formatında döner */
  getAnthropicTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const server of this.servers) {
      for (const tool of server.tools) {
        tools.push({
          name: `mcp__${server.name}__${tool.name}`,
          description: `[MCP:${server.name}] ${tool.description ?? tool.name}`,
          input_schema: (tool.inputSchema as ToolDefinition['input_schema']) ?? {
            type: 'object',
            properties: {},
          },
        });
      }
    }

    return tools;
  }

  /** MCP tool çağrısı — tool adından server ve tool ismini çıkarır */
  async callTool(fullName: string, input: Record<string, unknown>): Promise<string> {
    // fullName: mcp__<serverName>__<toolName>
    const parts = fullName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      throw new Error(`Geçersiz MCP tool adı: ${fullName}`);
    }

    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');

    const server = this.servers.find((s) => s.name === serverName);
    if (!server) throw new Error(`MCP sunucusu bulunamadı: ${serverName}`);

    const result = await server.client.callTool({ name: toolName, arguments: input });

    // Sonucu string'e çevir
    if (typeof result.content === 'string') return result.content;
    if (Array.isArray(result.content)) {
      return result.content
        .map((block: { type: string; text?: string }) =>
          block.type === 'text' ? (block.text ?? '') : JSON.stringify(block),
        )
        .join('\n');
    }
    return JSON.stringify(result.content);
  }

  isMcpTool(name: string): boolean {
    return name.startsWith('mcp__');
  }

  getServerList(): Array<{ name: string; toolCount: number; tools: string[] }> {
    return this.servers.map((s) => ({
      name: s.name,
      toolCount: s.tools.length,
      tools: s.tools.map((t) => t.name),
    }));
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(this.servers.map((s) => s.client.close()));
    this.servers = [];
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton
export const mcpManager = new McpManager();
