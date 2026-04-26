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
      console.log(mcpHelp());
  }
}

// ─── /mcp list ──────────────────────────────────────────────────────────────

function mcpList(): void {
  const config = readMcpConfig();
  const names = Object.keys(config.servers);

  console.log('\n' + chalk.bold.cyan('═══ MCP Sunucuları ═══'));
  console.log(chalk.dim(`  Config: ${getMcpConfigPath()}\n`));

  if (names.length === 0) {
    console.log(chalk.dim('  Henüz kayıtlı sunucu yok.'));
    console.log(chalk.dim('  /mcp catalog  → kurulabilir sunucuları gör'));
    console.log(chalk.dim('  /mcp install filesystem  → hazır sunucu kur'));
    console.log('');
    return;
  }

  for (const name of names) {
    const cfg = config.servers[name];
    console.log(chalk.green('  ●') + ' ' + chalk.bold(name));
    console.log(chalk.dim(`    ${cfg.description ?? ''}`));
    console.log(chalk.dim(`    cmd: ${cfg.command} ${(cfg.args ?? []).join(' ')}`));
  }
  console.log('');
}

// ─── /mcp status ────────────────────────────────────────────────────────────

function mcpStatus(): void {
  const servers = mcpManager.getServerList();
  console.log('\n' + chalk.bold.cyan('═══ MCP Bağlantı Durumu ═══\n'));

  if (servers.length === 0) {
    console.log(chalk.dim('  Aktif MCP bağlantısı yok.\n'));
    return;
  }

  for (const s of servers) {
    console.log(chalk.green('  ✓ ') + chalk.bold(s.name) + chalk.dim(` (${s.toolCount} araç)`));
    for (const t of s.tools) {
      console.log(chalk.dim(`      • ${t}`));
    }
  }
  console.log('');
}

// ─── /mcp install <name> ────────────────────────────────────────────────────

function mcpInstall(name: string): void {
  if (!name) {
    console.log(chalk.red('\n  Kullanım: /mcp install <sunucu-adı>'));
    console.log(chalk.dim('  /mcp catalog → mevcut sunucuları gör\n'));
    return;
  }

  const known = KNOWN_SERVERS[name];
  if (!known) {
    console.log(chalk.red(`\n  Bilinmeyen sunucu: ${name}`));
    console.log(chalk.dim('  /mcp catalog → desteklenen sunucuları gör\n'));
    return;
  }

  console.log(chalk.cyan(`\n  Kuruluyor: ${name} — ${known.description}`));

  // npm paketi global yükle
  for (const pkg of known.packages) {
    process.stdout.write(chalk.dim(`  npm install -g ${pkg}... `));
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'pipe' });
      console.log(chalk.green('✓'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red('✗') + chalk.dim(` (${message.split('\n')[0]})`));
    }
  }

  // Config'e ekle
  addServer(name, known.config);
  console.log(chalk.green(`\n  ✓ '${name}' mcp.json'a eklendi.`));

  if (known.config.env && Object.keys(known.config.env).length > 0) {
    console.log(chalk.yellow('\n  ⚠ Çevresel değişken gerekiyor:'));
    for (const [k, v] of Object.entries(known.config.env)) {
      console.log(chalk.dim(`    ${k}=${v}`));
    }
    console.log(chalk.dim(`    Düzenle: ${getMcpConfigPath()}\n`));
  } else {
    console.log(chalk.dim('  Yeniden başlat veya /mcp reconnect yap.\n'));
  }
}

// ─── /mcp add <name> <command> [args...] ────────────────────────────────────

function mcpAdd(parts: string[]): void {
  if (parts.length < 2) {
    console.log(chalk.red('\n  Kullanım: /mcp add <isim> <komut> [argümanlar...]'));
    console.log(chalk.dim('  Örnek: /mcp add myserver npx -y my-mcp-server\n'));
    return;
  }

  const name = parts[0];
  const command = parts[1];
  const args = parts.slice(2);

  const cfg: McpServerConfig = { command, args };
  addServer(name, cfg);
  console.log(chalk.green(`\n  ✓ '${name}' eklendi → ${getMcpConfigPath()}\n`));
}

// ─── /mcp remove <name> ─────────────────────────────────────────────────────

function mcpRemove(name: string): void {
  if (!name) {
    console.log(chalk.red('\n  Kullanım: /mcp remove <isim>\n'));
    return;
  }
  const ok = removeServer(name);
  if (ok) {
    console.log(chalk.green(`\n  ✓ '${name}' kaldırıldı.\n`));
  } else {
    console.log(chalk.red(`\n  '${name}' bulunamadı.\n`));
  }
}

// ─── /mcp catalog ───────────────────────────────────────────────────────────

function mcpCatalog(): void {
  console.log('\n' + chalk.bold.cyan('═══ Kurulabilir MCP Sunucuları ═══\n'));
  for (const [name, info] of Object.entries(KNOWN_SERVERS)) {
    console.log(
      chalk.bold(`  ${name.padEnd(16)}`) +
      chalk.white(info.description),
    );
    console.log(chalk.dim(`  ${''.padEnd(16)}/mcp install ${name}`));
  }
  console.log('');
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
