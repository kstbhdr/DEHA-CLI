import * as fs from 'fs';
import * as path from 'path';

export type JobStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'lost';
export interface BackgroundJob {
  id: string;
  command: string;
  cwd: string;
  taskId?: string;
  sessionId: string;
  status: JobStatus;
  waitForCompletion: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  workerPid?: number;
  pid?: number;
  exitCode?: number | null;
  signal?: string | null;
  error?: string;
  timeoutSeconds: number;
  outputTruncated?: boolean;
}

export function isJobRunning(job: BackgroundJob): boolean {
  return job.status === 'starting' || job.status === 'running';
}

export function writeJobState(dir: string, job: BackgroundJob): void {
  atomicWriteJson(path.join(dir, 'status.json'), job);
}

/** Windows readers/antivirus can briefly hold a file open during replacement. */
export function atomicWriteJson(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), 'utf8');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temporary, file); return; }
    catch (error: any) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

export function readJobState(dir: string): BackgroundJob {
  const job = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));
  if (!job || !/^job-[a-f0-9-]{36}$/.test(job.id) || typeof job.command !== 'string' ||
    !['starting', 'running', 'completed', 'failed', 'cancelled', 'timed_out', 'lost'].includes(job.status)) {
    throw new Error('Invalid job checkpoint');
  }
  return job;
}
