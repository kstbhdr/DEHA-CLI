import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { resetSession, setActiveTask, getActiveTask, getSessionId } from '../services/session-memory';
import { listBackgroundJobs, blockingJobsForActiveTask, waitBackgroundJob, backgroundJobsEnabled } from '../tools/background-jobs';
import { writeJobState, type BackgroundJob } from '../tools/job-state';
import { summarizeToolResult } from '../services/sectioned-context/tool-log';
import { runAgent } from '../commands/agent';
import * as ai from '../services/ai-service';
import { getConfig } from '../config';

vi.mock('ioredis', () => ({ default: class {
  on() {} async connect() {} async get() { return null; } async set() {} async del() {} async quit() {}
} }));
let project: string;
beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-job-unit-'));
  await resetSession(project); setActiveTask('Verify the copied model');
});
function seed(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  const id = `job-${randomUUID()}`;
  const dir = path.join(project, '.deha', 'jobs', id); fs.mkdirSync(dir, { recursive: true });
  const job: BackgroundJob = { id, command: 'copy fixture', cwd: project, taskId: getActiveTask()?.id,
    sessionId: getSessionId(), status: 'running', workerPid: process.pid, waitForCompletion: true,
    createdAt: new Date().toISOString(), timeoutSeconds: 60, ...overrides };
  writeJobState(dir, job); return job;
}

describe('Background job state and completion rules', () => {
  it('blocks only required jobs owned by the active task and session', () => {
    const current = seed(); seed({ taskId: 'other-task' }); seed({ sessionId: 'other-session' });
    seed({ waitForCompletion: false }); seed({ status: 'completed', exitCode: 0 });
    expect(blockingJobsForActiveTask().map(j => j.id)).toEqual([current.id]);
  });
  it('does not turn a missing supervisor into successful completion', () => {
    const lost = seed({ status: 'starting', workerPid: undefined, createdAt: new Date(Date.now() - 30000).toISOString() });
    expect(listBackgroundJobs()[0].status).toBe('lost');
    expect(blockingJobsForActiveTask()[0].id).toBe(lost.id);
  });
  it('rejects directory traversal and invalid wait durations', async () => {
    await expect(waitBackgroundJob({ job_id: '../../.env', wait_seconds: 0 })).rejects.toThrow('job_id');
    const job = seed();
    await expect(waitBackgroundJob({ job_id: job.id, wait_seconds: NaN })).rejects.toThrow('Geçersiz');
    await expect(waitBackgroundJob({ job_id: job.id, wait_seconds: -1 })).rejects.toThrow('Geçersiz');
  });
  it('sends new output once and preserves nonzero exit status', async () => {
    const job = seed({ status: 'failed', exitCode: 7 }); const dir = path.join(project, '.deha', 'jobs', job.id);
    fs.writeFileSync(path.join(dir, 'stdout.log'), 'first output'); fs.writeFileSync(path.join(dir, 'stderr.log'), 'bad shard');
    const first = JSON.parse(await waitBackgroundJob({ job_id: job.id, wait_seconds: 0 }));
    expect(first.stdout).toBe('first output'); expect(first.exit_code).toBe(7);
    expect(JSON.parse(await waitBackgroundJob({ job_id: job.id, wait_seconds: 0 })).no_new_output).toBe(true);
    fs.appendFileSync(path.join(dir, 'stdout.log'), '\nnew output');
    expect(JSON.parse(await waitBackgroundJob({ job_id: job.id, wait_seconds: 0 })).stdout).toBe('\nnew output');
  });
  it('keeps job IDs/status in compressed tool history', () => {
    expect(summarizeToolResult('start_job', JSON.stringify({ job_id: 'job-example', status: 'running' })).summary).toContain('job-example running');
    expect(summarizeToolResult('wait_job', JSON.stringify({ job_id: 'job-example', status: 'failed', exit_code: 7 })).ok).toBe(false);
  });
  it('legacy switch hides new tools and removes their system instructions', async () => {
    vi.stubEnv('DEHA_BACKGROUND_JOBS', '0'); expect(backgroundJobsEnabled()).toBe(false);
    const send = vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue({ text: 'Done [STATUS: COMPLETE]', toolCalls: [],
      rawAssistantMsg: { role: 'assistant', content: 'Done [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop' });
    await runAgent('Check fixture', getConfig({ provider: 'deepseek' }));
    expect(send.mock.calls[0][2].map(t => t.name)).not.toContain('start_job');
    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain('[LONG-RUNNING COMMANDS]');
    expect(send.mock.calls[0][2].map(t => t.name)).toContain('run_shell');
  });
  for (const provider of ['deepseek', 'claude'] as const) {
    it(`${provider}: does not accept COMPLETE while a required job is still running`, async () => {
      const job = seed();
      const response = { text: 'Model copy done [STATUS: COMPLETE]', toolCalls: [],
        rawAssistantMsg: { role: 'assistant', content: 'Model copy done [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop' as const, stopReason: 'end_turn' as const };
      const send = provider === 'claude' ? vi.spyOn(ai, 'sendWithTools').mockResolvedValue(response)
        : vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue(response);
      const result = await runAgent('devam et', getConfig({ provider, maxToolRounds: 5 }));
      expect(getActiveTask()?.taskState).toBe('INTERRUPTED');
      expect(result.response).toContain('henüz tamamlanmadı');
      expect(send).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(send.mock.calls[1][0])).toContain(job.id);
      expect(JSON.stringify(send.mock.calls[1][0])).toContain('wait_job');
    });
  }
});
