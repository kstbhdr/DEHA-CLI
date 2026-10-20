import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { getWorkDir, getActiveTask, getSessionId } from '../services/session-memory';
import { BackgroundJob, readJobState, writeJobState, isJobRunning, atomicWriteJson } from './job-state';

export const BACKGROUND_JOB_NAMES = new Set(['start_job', 'wait_job', 'list_jobs', 'cancel_job']);
export const BACKGROUND_JOBS_PROMPT = `
[LONG-RUNNING COMMANDS]
For model downloads/copies, training, builds or tests that may take a long time, use start_job ONCE, then wait_job with the returned job_id. wait_job waits locally (default 30 seconds, max 60) and returns only new output plus process status; the local wait does not make model API requests. Do not replace it with rapid ls/cat/grep or shell sleep loops.
Keep the command inside start_job in the foreground: do not add nohup, a trailing &, or an inner daemon launcher. The supervisor already backgrounds it and needs the real command's exit code.
Use list_jobs after restart to recover existing jobs. Do not restart a running copy. If a job was already started outside DEHA, run a tracked watcher for its known PID/completion marker rather than re-running the original command. A watcher exiting successfully alone does not prove the original copy succeeded.
Do independent work while a job runs. When you need its result, wait with 30-60 second intervals. Never claim completion until required jobs exited with code 0 AND relevant results (e.g. model shard manifest and sizes) were verified. wait_for_completion=false is ONLY for a service the user explicitly wants left running. cancel_job stops a job's process tree. Interrupting a wait leaves the job running; cancelling is explicit.
Reuse facts already in context; batch independent inspections. Do not repeatedly re-read unchanged directory listings, documents or logs. Re-check when evidence may have changed or verification requires it.`;

export function backgroundJobsEnabled(): boolean { return process.env.DEHA_BACKGROUND_JOBS !== '0'; }
function jobsRoot(): string { return path.join(path.resolve(getWorkDir() || process.cwd()), '.deha', 'jobs'); }
function jobDir(id: string): string {
  if (!/^job-[a-f0-9-]{36}$/.test(id)) throw new Error('Geçersiz job_id');
  return path.join(jobsRoot(), id);
}
function seconds(value: unknown, fallback: number, max: number, min = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error('Geçersiz bekleme/zaman aşımı süresi');
  return Math.min(value, max);
}
function abortError(): Error { return new Error('Bekleme iptal edildi; arka plan işi çalışmaya devam eder. Durdurmak için cancel_job kullan.'); }
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function checkedJob(dir: string): BackgroundJob {
  const job = readJobState(dir);
  if (job.status === 'starting' && !job.workerPid && Date.now() - Date.parse(job.createdAt) > 10_000) {
    return { ...job, status: 'lost', error: 'Supervisor başlamadı; komutun durumu doğrulanamadı.' };
  }
  if (isJobRunning(job) && job.workerPid) {
    try { process.kill(job.workerPid, 0); }
    catch (error: any) {
      if (error.code === 'ESRCH') return { ...job, status: 'lost', error: 'Supervisor bulunamadı; komutun tamamlandığı doğrulanamadı. Yeniden başlatmadan önce mevcut süreci kontrol et.' };
    }
  }
  return job;
}
export function listBackgroundJobs(): BackgroundJob[] {
  if (!fs.existsSync(jobsRoot())) return [];
  return fs.readdirSync(jobsRoot()).filter(id => /^job-[a-f0-9-]{36}$/.test(id)).flatMap(id => {
    try { return [checkedJob(jobDir(id))]; } catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function blockingJobsForActiveTask(): BackgroundJob[] {
  const task = getActiveTask();
  if (!task?.id || !backgroundJobsEnabled()) return [];
  return listBackgroundJobs().filter(j => j.taskId === task.id && j.sessionId === getSessionId() && j.waitForCompletion && (isJobRunning(j) || j.status === 'lost'));
}

export async function startBackgroundJob(input: {
  command: string; cwd?: string; env?: Record<string, string>; timeout?: number; wait_for_completion?: boolean;
}, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError();
  if (typeof input.command !== 'string' || !input.command.trim()) throw new Error('command gerekli');
  if (listBackgroundJobs().filter(isJobRunning).length >= 8) throw new Error('En fazla 8 aktif iş desteklenir; mevcut işleri bekle veya iptal et.');
  const cwd = path.resolve(input.cwd || getWorkDir() || process.cwd());
  if (!fs.statSync(cwd).isDirectory()) throw new Error('cwd bir dizin olmalı');
  const id = `job-${randomUUID()}`; const dir = jobDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const job: BackgroundJob = { id, command: input.command, cwd, taskId: getActiveTask()?.id,
    sessionId: getSessionId(), status: 'starting', waitForCompletion: input.wait_for_completion !== false,
    createdAt: new Date().toISOString(), timeoutSeconds: seconds(input.timeout, 3600, 86400, 0.1) };
  writeJobState(dir, job);
  const worker = path.join(__dirname, 'job-worker.js');
  if (!fs.existsSync(worker)) {
    writeJobState(dir, { ...job, status: 'failed', error: 'Job worker derlenmemiş. npm run build çalıştır.' });
    throw new Error('Job worker bulunamadı; npm run build çalıştır.');
  }
  const proc = spawn(process.execPath, [worker, dir], { detached: true, windowsHide: true,
    stdio: 'ignore', env: { ...process.env, ...(input.env ?? {}) } });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', resolve);
    proc.once('error', error => {
      writeJobState(dir, { ...job, status: 'failed', error: error.message }); reject(error);
    });
  });
  proc.unref();
  // Short readiness handshake, without consuming any process output.
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline && readJobState(dir).status === 'starting') await delay(25);
  return JSON.stringify({ ...checkedJob(dir), job_id: id, next: `wait_job({"job_id":"${id}","wait_seconds":30})` });
}

function newOutput(dir: string): { stdout: string; stderr: string; truncated: boolean } {
  let cursor: Record<string, number> = {};
  const cursorFile = path.join(dir, 'read-cursor.json');
  try { cursor = JSON.parse(fs.readFileSync(cursorFile, 'utf8')); } catch { /* First read. */ }
  let truncated = false;
  const read = (name: 'stdout' | 'stderr') => {
    const file = path.join(dir, `${name}.log`);
    if (!fs.existsSync(file)) return '';
    const size = fs.statSync(file).size;
    const offset = Number.isSafeInteger(cursor[name]) ? Math.max(0, Math.min(cursor[name], size)) : 0;
    const length = Math.min(size - offset, 16_000);
    const fd = fs.openSync(file, 'r'); const buffer = Buffer.alloc(length);
    try { fs.readSync(fd, buffer, 0, length, size - offset > length ? size - length : offset); }
    finally { fs.closeSync(fd); }
    truncated ||= size - offset > length;
    cursor[name] = size;
    return buffer.toString('utf8');
  };
  const stdout = read('stdout'); const stderr = read('stderr');
  atomicWriteJson(cursorFile, cursor);
  return { stdout, stderr, truncated };
}

export async function waitBackgroundJob(input: { job_id: string; wait_seconds?: number }, signal?: AbortSignal): Promise<string> {
  const dir = jobDir(input.job_id);
  const started = Date.now(); const until = started + seconds(input.wait_seconds, 30, 60) * 1000;
  let job = checkedJob(dir);
  while (isJobRunning(job) && Date.now() < until) {
    await delay(Math.min(250, Math.max(1, until - Date.now())), signal);
    job = checkedJob(dir);
  }
  if (signal?.aborted) throw abortError();
  const output = newOutput(dir);
  return JSON.stringify({ job_id: job.id, status: job.status, pid: job.pid, exit_code: job.exitCode,
    signal: job.signal, error: job.error, waited_seconds: Math.round((Date.now() - started) / 100) / 10,
    ...output, output_truncated: job.outputTruncated, no_new_output: !output.stdout && !output.stderr,
    next: isJobRunning(job) ? 'İş sürüyor. Yeni bir komut başlatmadan wait_job ile 30-60 saniye bekle.' : 'İş sona erdi. Sonucu değerlendir ve gerekiyorsa üretilen dosyaları doğrula.' });
}

export async function cancelBackgroundJob(input: { job_id: string }, signal?: AbortSignal): Promise<string> {
  const dir = jobDir(input.job_id); const job = checkedJob(dir);
  if (isJobRunning(job)) fs.writeFileSync(path.join(dir, 'cancel.request'), new Date().toISOString(), 'utf8');
  return waitBackgroundJob({ job_id: input.job_id, wait_seconds: 5 }, signal);
}
