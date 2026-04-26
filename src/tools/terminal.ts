import { spawn } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;       // ms, default 30s
  shell?: boolean;        // shell üzerinden çalıştır
  stream?: boolean;       // stdout'u canlı yaz
  label?: string;         // log etiketi
}

/**
 * Komutu çalıştırır, stdout/stderr'i yakalar, isteğe bağlı canlı yazar.
 */
export function runCommand(command: string, opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timeout = opts.timeout ?? 30_000;
    const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
    const label = opts.label ? chalk.dim(`[${opts.label}] `) : '';

    const proc = spawn(command, {
      cwd,
      shell: opts.shell ?? true,
      env: { ...process.env, ...(opts.env ?? {}) },
    } as import('child_process').SpawnOptions);

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (opts.stream) process.stdout.write(label + text);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (opts.stream) process.stderr.write(chalk.red(label) + text);
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Timeout: komut ${timeout / 1000}s içinde tamamlanamadı`));
    }, timeout);

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? -1, duration: Date.now() - start });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Birden fazla komutu sırayla çalıştırır, biri başarısız olursa durur.
 */
export async function runSequence(
  commands: string[],
  opts: RunOptions = {},
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const cmd of commands) {
    const result = await runCommand(cmd, opts);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  return results;
}

/**
 * Tool olarak çağrılabilir versiyon — agent için string döner.
 */
export async function toolRunTerminal(input: {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}): Promise<string> {
  const result = await runCommand(input.command, {
    cwd: input.cwd,
    timeout: (input.timeout ?? 30) * 1000,
    env: input.env,
    shell: true,
  });

  const lines: string[] = [];
  if (result.stdout) lines.push(`STDOUT:\n${result.stdout.trim()}`);
  if (result.stderr) lines.push(`STDERR:\n${result.stderr.trim()}`);
  lines.push(`EXIT: ${result.exitCode}  (${result.duration}ms)`);
  return lines.join('\n\n');
}
