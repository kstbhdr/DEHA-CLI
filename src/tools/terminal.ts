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
  signal?: AbortSignal;
  maxBuffer?: number;
}

/**
 * Komutu çalıştırır, stdout/stderr'i yakalar, isteğe bağlı canlı yazar.
 */
export function runCommand(command: string, opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new Error('Komut kullanıcı tarafından durduruldu')); return; }
    const start = Date.now();
    const timeout = opts.timeout ?? 30_000;
    const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
    const label = opts.label ? chalk.dim(`[${opts.label}] `) : '';

    const proc = spawn(command, {
      cwd,
      shell: opts.shell ?? true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, ...(opts.env ?? {}) },
    } as import('child_process').SpawnOptions);

    let stdout = '';
    let stderr = '';
    let capturedBytes = 0;
    let stopped = false;
    const capture = (chunk: Buffer): boolean => {
      if (stopped) return false;
      capturedBytes += chunk.length;
      if (capturedBytes <= (opts.maxBuffer ?? 10 * 1024 * 1024)) return true;
      clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort);
      stop(); reject(new Error('Komut çıktısı maxBuffer sınırını aştı')); return false;
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (!capture(chunk)) return;
      const text = chunk.toString();
      stdout += text;
      if (opts.stream) process.stdout.write(label + text);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      if (!capture(chunk)) return;
      const text = chunk.toString();
      stderr += text;
      if (opts.stream) process.stderr.write(chalk.red(label) + text);
    });

    const stop = () => {
      stopped = true;
      try {
        if (process.platform !== 'win32' && proc.pid) process.kill(-proc.pid, 'SIGTERM');
        else if (process.platform === 'win32' && proc.pid) {
          const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          killer.on('error', () => proc.kill('SIGTERM'));
        }
        else proc.kill('SIGTERM');
      } catch { proc.kill('SIGTERM'); }
    };
    const onAbort = () => {
      clearTimeout(timer);
      stop();
      reject(new Error('Komut kullanıcı tarafından durduruldu'));
    };
    const timer = setTimeout(() => {
      opts.signal?.removeEventListener('abort', onAbort);
      stop();
      reject(new Error(`Timeout: komut ${timeout / 1000}s içinde tamamlanamadı`));
    }, timeout);
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, exitCode: exitCode ?? -1, duration: Date.now() - start });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
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
}, signal?: AbortSignal): Promise<string> {
  const result = await runCommand(input.command, {
    cwd: input.cwd,
    timeout: (input.timeout ?? 30) * 1000,
    env: input.env,
    shell: true,
    signal,
  });

  const lines: string[] = [];
  if (result.stdout) lines.push(`STDOUT:\n${result.stdout.trim()}`);
  if (result.stderr) lines.push(`STDERR:\n${result.stderr.trim()}`);
  lines.push(`EXIT: ${result.exitCode}  (${result.duration}ms)`);
  return lines.join('\n\n');
}
