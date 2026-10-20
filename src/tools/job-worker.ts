// Detached supervisor: survives the interactive CLI, owns the child process tree,
// stores bounded output, and writes a terminal state even on failure/cancellation.
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { readJobState, writeJobState, JobStatus } from './job-state';

function supervise(dir: string): void {
  const job = readJobState(dir);
  const outputLimit = 10 * 1024 * 1024;
  const sizes = { stdout: 0, stderr: 0 };
  const output = { stdout: fs.openSync(path.join(dir, 'stdout.log'), 'a'), stderr: fs.openSync(path.join(dir, 'stderr.log'), 'a') };
  let finished = false;
  let stopping: JobStatus | undefined;
  let hardKill: NodeJS.Timeout | undefined;
  const child = spawn(job.command, { cwd: job.cwd, shell: true, windowsHide: true,
    detached: process.platform !== 'win32', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  job.workerPid = process.pid; job.pid = child.pid;
  job.status = 'running'; job.startedAt = new Date().toISOString();

  const capture = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    const remaining = Math.max(0, outputLimit - sizes[stream]);
    if (remaining) fs.writeSync(output[stream], chunk.subarray(0, remaining));
    sizes[stream] += chunk.length;
    if (sizes[stream] > outputLimit && !job.outputTruncated) {
      job.outputTruncated = true; writeJobState(dir, job);
    }
  };
  child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk));
  child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk));

  const killTree = (force: boolean) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
      } else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch { /* The process may have already exited. */ }
  };
  const stop = (status: JobStatus) => {
    if (finished || stopping) return;
    stopping = status; killTree(false);
    if (process.platform !== 'win32') hardKill = setTimeout(() => killTree(true), 1500);
  };
  const timeout = setTimeout(() => stop('timed_out'), job.timeoutSeconds * 1000);
  const cancellation = setInterval(() => {
    if (fs.existsSync(path.join(dir, 'cancel.request'))) stop('cancelled');
  }, 200);
  const finish = (code: number | null, signal: string | null, error?: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout); clearInterval(cancellation);
    // Leave the POSIX hard-kill timer alive: descendants may ignore SIGTERM
    // even after their shell leader exits and closes its output streams.
    fs.closeSync(output.stdout); fs.closeSync(output.stderr);
    job.status = stopping ?? (code === 0 && !error ? 'completed' : 'failed');
    job.exitCode = code; job.signal = signal; job.error = error;
    job.finishedAt = new Date().toISOString();
    try { writeJobState(dir, job); }
    catch { process.exitCode = 1; /* Parent reports lost, never completed. */ }
  };
  child.once('error', error => finish(null, null, error.message));
  child.once('close', (code, signal) => finish(code, signal));
  process.once('SIGTERM', () => stop('cancelled'));
  process.once('SIGINT', () => stop('cancelled'));
  try { writeJobState(dir, job); }
  catch (error) { job.error = String(error); stop('failed'); }
}

if (require.main === module) {
  try { supervise(path.resolve(process.argv[2])); }
  catch (error) {
    try {
      const dir = path.resolve(process.argv[2]); const job = readJobState(dir);
      writeJobState(dir, { ...job, status: 'failed', error: String(error), finishedAt: new Date().toISOString() });
    } catch { /* Missing/corrupt initial state cannot be recovered. */ }
    process.exitCode = 1;
  }
}
