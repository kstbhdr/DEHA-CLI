import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { DehaConfig } from '../config';
import { logger } from './logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoleLabel = 'chat' | 'planner' | 'coder' | 'judge' | 'vision' | 'agent';

export interface UsageEntry {
  timestamp: string;       // ISO 8601
  provider: string;
  model: string;
  role: RoleLabel;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageStore {
  entries: UsageEntry[];
}

// ─── File path ───────────────────────────────────────────────────────────────

const USAGE_DIR  = path.join(os.homedir(), '.deha');
const USAGE_FILE = path.join(USAGE_DIR, 'usage.json');

// ─── Read / Write ─────────────────────────────────────────────────────────────

function readStore(): UsageStore {
  try {
    if (!fs.existsSync(USAGE_FILE)) return { entries: [] };
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')) as UsageStore;
  } catch {
    return { entries: [] };
  }
}

function writeStore(store: UsageStore): void {
  if (!fs.existsSync(USAGE_DIR)) fs.mkdirSync(USAGE_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ─── Pricing helpers ─────────────────────────────────────────────────────────

export function calcCost(
  role: RoleLabel,
  inputTokens: number,
  outputTokens: number,
  config: DehaConfig,
): number {
  const priceMap: Record<RoleLabel, [number, number]> = {
    chat:    [config.chatInputPrice,    config.chatOutputPrice],
    planner: [config.plannerInputPrice, config.plannerOutputPrice],
    coder:   [config.coderInputPrice,   config.coderOutputPrice],
    judge:   [config.judgeInputPrice,   config.judgeOutputPrice],
    vision:  [config.visionInputPrice,  config.visionOutputPrice],
    agent:   [config.agentInputPrice,   config.agentOutputPrice],
  };
  const [inp, out] = priceMap[role] ?? [0, 0];
  return (inputTokens / 1_000_000) * inp + (outputTokens / 1_000_000) * out;
}

// ─── Record a usage event ─────────────────────────────────────────────────────

export function recordUsage(
  provider: string,
  model: string,
  role: RoleLabel,
  inputTokens: number,
  outputTokens: number,
  config: DehaConfig,
): void {
  if (inputTokens === 0 && outputTokens === 0) return;
  const store = readStore();
  store.entries.push({
    timestamp: new Date().toISOString(),
    provider,
    model,
    role,
    inputTokens,
    outputTokens,
    costUsd: calcCost(role, inputTokens, outputTokens, config),
  });
  // Keep only last 10 000 entries to prevent unbounded growth
  if (store.entries.length > 10_000) store.entries = store.entries.slice(-10_000);
  writeStore(store);
}

// ─── Stats calculation ────────────────────────────────────────────────────────

interface PeriodStats {
  inputTokens:  number;
  outputTokens: number;
  totalTokens:  number;
  costUsd:      number;
  calls:        number;
  byModel:      Record<string, { input: number; output: number; cost: number; calls: number }>;
  byRole:       Record<string, { input: number; output: number; cost: number; calls: number }>;
}

function emptyPeriod(): PeriodStats {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0, byModel: {}, byRole: {} };
}

function addEntry(period: PeriodStats, e: UsageEntry): void {
  period.inputTokens  += e.inputTokens;
  period.outputTokens += e.outputTokens;
  period.totalTokens  += e.inputTokens + e.outputTokens;
  period.costUsd      += e.costUsd;
  period.calls        += 1;

  const mk = `${e.provider}/${e.model}`;
  if (!period.byModel[mk]) period.byModel[mk] = { input: 0, output: 0, cost: 0, calls: 0 };
  period.byModel[mk].input  += e.inputTokens;
  period.byModel[mk].output += e.outputTokens;
  period.byModel[mk].cost   += e.costUsd;
  period.byModel[mk].calls  += 1;

  if (!period.byRole[e.role]) period.byRole[e.role] = { input: 0, output: 0, cost: 0, calls: 0 };
  period.byRole[e.role].input  += e.inputTokens;
  period.byRole[e.role].output += e.outputTokens;
  period.byRole[e.role].cost   += e.costUsd;
  period.byRole[e.role].calls  += 1;
}

export function getStats(): {
  today:   PeriodStats;
  week:    PeriodStats;
  month:   PeriodStats;
  allTime: PeriodStats;
} {
  const store = readStore();
  const now   = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart  = todayStart - 6 * 86_400_000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const today   = emptyPeriod();
  const week    = emptyPeriod();
  const month   = emptyPeriod();
  const allTime = emptyPeriod();

  for (const e of store.entries) {
    const t = new Date(e.timestamp).getTime();
    addEntry(allTime, e);
    if (t >= monthStart) addEntry(month, e);
    if (t >= weekStart)  addEntry(week, e);
    if (t >= todayStart) addEntry(today, e);
  }

  return { today, week, month, allTime };
}

// ─── Display ──────────────────────────────────────────────────────────────────

export function printStats(): void {
  const { today, week, month, allTime } = getStats();

  logger.write('\n' + chalk.bold.cyan('╔══════════════════════════════════════════════════════╗'));
  logger.write(chalk.bold.cyan('║') + chalk.bold.white('   DEHA — Token & Cost Statistics') + ' '.repeat(21) + chalk.bold.cyan('║'));
  logger.write(chalk.bold.cyan('╚══════════════════════════════════════════════════════╝'));

  printPeriod('Today',    today);
  printPeriod('This Week (last 7 days)', week);
  printPeriod('This Month', month);
  printPeriod('All Time',   allTime);

  logger.write('');
}

function printPeriod(label: string, p: PeriodStats): void {
  if (p.calls === 0) {
    logger.write('\n' + chalk.bold(`  ── ${label} ──`) + chalk.dim('  (no data)'));
    return;
  }

  logger.write('\n' + chalk.bold(`  ── ${label} ──`));
  logger.write(
    `  ${chalk.dim('Calls:')}  ${chalk.white(p.calls)}   ` +
    `${chalk.dim('Tokens:')}  ${chalk.yellow(fmt(p.totalTokens))} ` +
    `${chalk.dim('(in:')} ${chalk.dim(fmt(p.inputTokens))} ${chalk.dim('out:')} ${chalk.dim(fmt(p.outputTokens))}${chalk.dim(')')}   ` +
    `${chalk.dim('Cost:')}  ${chalk.green('$' + p.costUsd.toFixed(4))}`,
  );

  // By model
  if (Object.keys(p.byModel).length > 0) {
    logger.write('\n  ' + chalk.dim('By model:'));
    const sorted = Object.entries(p.byModel).sort((a, b) => b[1].cost - a[1].cost);
    for (const [model, s] of sorted) {
      logger.write(
        `    ${chalk.cyan(model.padEnd(40))} ` +
        `${chalk.dim('calls:')} ${String(s.calls).padStart(4)}  ` +
        `${chalk.dim('tokens:')} ${fmt(s.input + s.output).padStart(9)}  ` +
        `${chalk.green('$' + s.cost.toFixed(4))}`,
      );
    }
  }

  // By role
  if (Object.keys(p.byRole).length > 0) {
    logger.write('\n  ' + chalk.dim('By role:'));
    const roleOrder = ['chat', 'planner', 'coder', 'judge', 'vision', 'agent'];
    const roles = roleOrder.filter(r => p.byRole[r]);
    for (const role of roles) {
      const s = p.byRole[role];
      const icon: Record<string, string> = {
        chat: '💬', planner: '📐', coder: '💻', judge: '⚖️ ', vision: '👁️ ', agent: '🤖',
      };
      logger.write(
        `    ${(icon[role] ?? '•') + ' ' + chalk.yellow(role.padEnd(10))} ` +
        `${chalk.dim('calls:')} ${String(s.calls).padStart(4)}  ` +
        `${chalk.dim('tokens:')} ${fmt(s.input + s.output).padStart(9)}  ` +
        `${chalk.green('$' + s.cost.toFixed(4))}`,
      );
    }
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
