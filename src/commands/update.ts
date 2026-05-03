import { execSync } from 'child_process';
import axios from 'axios';
import chalk from 'chalk';
import { DEHA_SEMVER, DEHA_VERSION } from '../version';

const CURRENT_VERSION = DEHA_SEMVER;
const NPM_PACKAGE     = 'deha-cli';
const GITHUB_REPO     = process.env.DEHA_GITHUB_REPO ?? 'kstbhdr/DEHA-CLI';

interface VersionInfo {
  latest: string;
  source: 'npm' | 'github' | 'unknown';
  updateUrl?: string;
}

export async function checkForUpdates(silent = false): Promise<void> {
  try {
    const info = await fetchLatestVersion();
    if (!info) return;

    if (isNewer(info.latest, CURRENT_VERSION)) {
      console.log(
        '\n' + chalk.bgYellow.black(' GÜNCELLEME MEVCUT ') +
        chalk.yellow(` v${DEHA_VERSION} → v${info.latest}`) +
        chalk.dim(` (${info.source})`),
      );
      console.log(chalk.dim('  deha update  →  güncellemek için\n'));
    } else if (!silent) {
      console.log(chalk.green(`\n✓ En güncel sürümü kullanıyorsun (v${DEHA_VERSION})\n`));
    }
  } catch {
    if (!silent) console.log(chalk.dim('\nGüncelleme kontrolü başarısız.\n'));
  }
}

export async function runUpdate(): Promise<void> {
  console.log('\n' + chalk.bold.cyan('═══ DEHA Güncelleme ═══'));
  console.log(chalk.dim(`  Mevcut sürüm: v${DEHA_VERSION}\n`));

  process.stdout.write(chalk.dim('  Son sürüm kontrol ediliyor... '));

  let info: VersionInfo | null = null;
  try {
    info = await fetchLatestVersion();
  } catch {
    console.log(chalk.red('✗ Bağlantı hatası'));
  }

  if (!info) {
    console.log(chalk.red('\n  Sürüm bilgisi alınamadı.\n'));
    printManualUpdate();
    return;
  }

  console.log(chalk.green(`v${info.latest}`) + chalk.dim(` (${info.source})`));

  if (!isNewer(info.latest, CURRENT_VERSION)) {
    console.log(chalk.green('\n  ✓ Zaten en güncel sürümdesin!\n'));
    return;
  }

  console.log(chalk.yellow(`\n  Yeni sürüm bulundu: v${DEHA_VERSION} → v${info.latest}`));
  console.log(chalk.dim('  Güncelleniyor...\n'));

  // npm ile kurulduysa npm üzerinden güncelle
  if (isGlobalNpmInstall()) {
    runNpmUpdate();
  } else if (GITHUB_REPO) {
    runGitUpdate();
  } else {
    printManualUpdate();
  }
}

// ─── Sürüm kontrolü ─────────────────────────────────────────────────────────

async function fetchLatestVersion(): Promise<VersionInfo | null> {
  // 1. Önce npm registry dene
  try {
    const res = await axios.get(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      timeout: 5000,
    });
    return { latest: res.data.version, source: 'npm' };
  } catch { /* npm'de yok, GitHub'a geç */ }

  // 2. GitHub releases dene
  if (GITHUB_REPO) {
    try {
      const res = await axios.get(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { timeout: 5000, headers: { 'User-Agent': 'deha-cli' } },
      );
      const tag: string = res.data.tag_name ?? '';
      const version = tag.replace(/^v/, '');
      return {
        latest: version,
        source: 'github',
        updateUrl: res.data.html_url,
      };
    } catch { /* GitHub da olmayabilir */ }
  }

  return null;
}

// ─── Güncelleme yöntemleri ───────────────────────────────────────────────────

function runNpmUpdate(): void {
  process.stdout.write(chalk.dim(`  npm install -g ${NPM_PACKAGE}@latest... `));
  try {
    execSync(`npm install -g ${NPM_PACKAGE}@latest`, { stdio: 'pipe' });
    console.log(chalk.green('✓'));
    console.log(chalk.green('\n  ✓ DEHA güncellendi! Terminali yeniden başlat.\n'));
  } catch (err: unknown) {
    console.log(chalk.red('✗'));
    console.log(chalk.red('  Hata: ') + (err instanceof Error ? err.message : String(err)));
    printManualUpdate();
  }
}

function runGitUpdate(): void {
  console.log(chalk.dim('  git pull + npm build yöntemi kullanılıyor...\n'));
  const steps: Array<{ label: string; cmd: string }> = [
    { label: 'git pull',       cmd: 'git pull origin main' },
    { label: 'npm install',    cmd: 'npm install' },
    { label: 'npm run build',  cmd: 'npm run build' },
    { label: 'npm link',       cmd: 'npm link' },
  ];

  for (const step of steps) {
    process.stdout.write(chalk.dim(`  ${step.label}... `));
    try {
      execSync(step.cmd, { stdio: 'pipe' });
      console.log(chalk.green('✓'));
    } catch (err: unknown) {
      console.log(chalk.red('✗'));
      console.log(chalk.red('  Hata: ') + (err instanceof Error ? err.message : String(err)));
      return;
    }
  }

  console.log(chalk.green('\n  ✓ DEHA güncellendi!\n'));
}

function printManualUpdate(): void {
  console.log(chalk.bold('\n  Manuel güncelleme:'));
  if (GITHUB_REPO) {
    console.log(chalk.dim(`  1. cd <deha-cli klasörü>`));
    console.log(chalk.dim('  2. git pull'));
    console.log(chalk.dim('  3. npm install && npm run build && npm link'));
  } else {
    console.log(chalk.dim(`  npm install -g ${NPM_PACKAGE}@latest`));
  }
  console.log('');
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function isGlobalNpmInstall(): boolean {
  try {
    const result = execSync(`npm list -g ${NPM_PACKAGE} --depth=0 2>/dev/null`, {
      encoding: 'utf-8', stdio: 'pipe',
    });
    return result.includes(NPM_PACKAGE);
  } catch {
    return false;
  }
}

/** Semantic version karşılaştırma: a > b ise true */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}
