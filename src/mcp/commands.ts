import { execSync } from 'child_process';
import chalk from 'chalk';
import {
  readMcpConfig,
  addServer,
  removeServer,
  KNOWN_SERVERS,
  McpServerConfig,
  getMcpConfigPath,
} from './config';
import { mcpManager } from './manager';
import { logger } from '../services/logger';

export async function handleMcpCommand(args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0];

  switch (sub) {
    case 'list':   return mcpList();
    case 'status': return mcpStatus();
    case 'add':    return mcpAdd(parts.slice(1));
    case 'remove': return mcpRemove(parts[1]);
    case 'install':return mcpInstall(parts[1]);
    case 'catalog':return mcpCatalog();
    default:
      logger.write(mcpHelp());
  }
}

// ─── /mcp list ──────────────────────────────────────────────────────────────

function mcpList(): void {
  const config = readMcpConfig();
  const names = Object.keys(config.servers);

  logger.write('\n' + chalk.bold.cyan('═══ MCP Sunucuları ═══'));
  logger.write(chalk.dim(`  Config: ${getMcpConfigPath()}\n`));

  if (names.length === 0) {
    logger.write(chalk.dim('  Henüz kayıtlı sunucu yok.'));
    logger.write(chalk.dim('  /mcp catalog  → kurulabilir sunucuları gör'));
    logger.write(chalk.dim('  /mcp install filesystem  → hazır sunucu kur'));
    logger.write('');
    return;
  }

  for (const name of names) {
    const cfg = config.servers[name];
    logger.write(chalk.green('  ●') + ' ' + chalk.bold(name));
    logger.write(chalk.dim(`    ${cfg.description ?? ''}`));
    logger.write(chalk.dim(`    cmd: ${cfg.command} ${(cfg.args ?? []).join(' ')}`));
  }
  logger.write('');
}

// ─── /mcp status ────────────────────────────────────────────────────────────

function mcpStatus(): void {
  const servers = mcpManager.getServerList();
  logger.write('\n' + chalk.bold.cyan('═══ MCP Bağlantı Durumu ═══\n'));

  if (servers.length === 0) {
    logger.write(chalk.dim('  Aktif MCP bağlantısı yok.\n'));
    return;
  }

  for (const s of servers) {
    logger.write(chalk.green('  ✓ ') + chalk.bold(s.name) + chalk.dim(` (${s.toolCount} araç)`));
    for (const t of s.tools) {
      logger.write(chalk.dim(`      • ${t}`));
    }
  }
  logger.write('');
}

// ─── /mcp install <name> ────────────────────────────────────────────────────

function mcpInstall(name: string): void {
  if (!name) {
    logger.write(chalk.red('\n  Kullanım: /mcp install <sunucu-adı>'));
    logger.write(chalk.dim('  /mcp catalog → mevcut sunucuları gör\n'));
    return;
  }

  const known = KNOWN_SERVERS[name];
  if (!known) {
    logger.write(chalk.red(`\n  Bilinmeyen sunucu: ${name}`));
    logger.write(chalk.dim('  /mcp catalog → desteklenen sunucuları gör\n'));
    return;
  }

  logger.write(chalk.cyan(`\n  Kuruluyor: ${name} — ${known.description}`));

  // npm paketi global yükle
  for (const pkg of known.packages) {
    logger.raw(chalk.dim(`  npm install -g ${pkg}... `));
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'pipe' });
      logger.write(chalk.green('✓'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.write(chalk.red('✗') + chalk.dim(` (${message.split('\n')[0]})`));
    }
  }

  // Config'e ekle
  addServer(name, known.config);
  logger.write(chalk.green(`\n  ✓ '${name}' mcp.json'a eklendi.`));

  if (known.config.env && Object.keys(known.config.env).length > 0) {
    logger.write(chalk.yellow('\n  ⚠ Çevresel değişken gerekiyor:'));
    for (const [k, v] of Object.entries(known.config.env)) {
      logger.write(chalk.dim(`    ${k}=${v}`));
    }
    logger.write(chalk.dim(`    Düzenle: ${getMcpConfigPath()}\n`));
  } else {
    logger.write(chalk.dim('  Yeniden başlat veya /mcp reconnect yap.\n'));
  }
}

// ─── /mcp add <name> <command> [args...] ────────────────────────────────────

function mcpAdd(parts: string[]): void {
  if (parts.length < 2) {
    logger.write(chalk.red('\n  Kullanım: /mcp add <isim> <komut> [argümanlar...]'));
    logger.write(chalk.dim('  Örnek: /mcp add myserver npx -y my-mcp-server\n'));
    return;
  }

  const name = parts[0];
  const command = parts[1];
  const args = parts.slice(2);

  const cfg: McpServerConfig = { command, args };
  addServer(name, cfg);
  logger.write(chalk.green(`\n  ✓ '${name}' eklendi → ${getMcpConfigPath()}\n`));
}

// ─── /mcp remove <name> ─────────────────────────────────────────────────────

function mcpRemove(name: string): void {
  if (!name) {
    logger.write(chalk.red('\n  Kullanım: /mcp remove <isim>\n'));
    return;
  }
  const ok = removeServer(name);
  if (ok) {
    logger.write(chalk.green(`\n  ✓ '${name}' kaldırıldı.\n`));
  } else {
    logger.write(chalk.red(`\n  '${name}' bulunamadı.\n`));
  }
}

// ─── /mcp catalog ───────────────────────────────────────────────────────────

function mcpCatalog(): void {
  logger.write('\n' + chalk.bold.cyan('═══ Kurulabilir MCP Sunucuları ═══\n'));
  for (const [name, info] of Object.entries(KNOWN_SERVERS)) {
    logger.write(
      chalk.bold(`  ${name.padEnd(16)}`) +
      chalk.white(info.description),
    );
    logger.write(chalk.dim(`  ${''.padEnd(16)}/mcp install ${name}`));
  }
  logger.write('');
}

// ─── Yardım ─────────────────────────────────────────────────────────────────

function mcpHelp(): string {
  return `
${chalk.bold('MCP Komutları:')}
  ${chalk.cyan('/mcp list')}                     Kayıtlı sunucuları göster
  ${chalk.cyan('/mcp status')}                   Aktif bağlantıları göster
  ${chalk.cyan('/mcp catalog')}                  Kurulabilir sunucuları listele
  ${chalk.cyan('/mcp install <isim>')}           Bilinen sunucuyu kur ve ekle
  ${chalk.cyan('/mcp add <isim> <cmd> [args]')} Manuel sunucu ekle
  ${chalk.cyan('/mcp remove <isim>')}            Sunucuyu kaldır
`;
}
