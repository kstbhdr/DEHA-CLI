const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const assert = require('node:assert/strict'); const { fork } = require('node:child_process');
const home = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'deha-bg-smoke-'));
os.homedir = () => home;
process.env.REDIS_URL = 'redis://127.0.0.1:1';
const memory = require('../dist/services/session-memory');
const jobs = require('../dist/tools/background-jobs');
const workDir = path.join(home, 'project'); fs.mkdirSync(workDir, { recursive: true });
const fixture = path.join(workDir, 'fixture.cjs');
const command = mode => `"${process.execPath}" "${fixture}" ${mode}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const parse = JSON.parse;
const checks = [];

async function child() {
  await memory.loadSession(workDir);
  const started = parse(await jobs.startBackgroundJob({ command: command('survive'), timeout: 15 }));
  process.send({ job_id: started.job_id }); setInterval(() => {}, 1000);
}

async function parent() {
  fs.writeFileSync(fixture, `
const fs = require('fs');
const mode = process.argv[2];
if (mode === 'fail') { console.error('EXPECTED_FAILURE'); process.exit(7); }
if (mode === 'flood') { process.stdout.write('x'.repeat(12 * 1024 * 1024)); }
else if (mode === 'tree') {
  require('child_process').spawn(process.execPath, ['-e', "setTimeout(()=>require('fs').writeFileSync('late.txt','UNEXPECTED'),2200)"], {stdio:'ignore', windowsHide:true});
  console.log('TREE_STARTED'); setInterval(()=>{},1000);
} else {
  console.log('JOB_STARTED');
  setTimeout(() => { console.log('JOB_DONE_çığ'); }, mode === 'survive' ? 2000 : 750);
}
`);
  await memory.resetSession(workDir); memory.setActiveTask('Run background job smoke');
  let id;
  try {
    const started = parse(await jobs.startBackgroundJob({ command: command('normal'), timeout: 15 })); id = started.job_id;
    const early = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 0 }));
    assert(['running', 'completed'].includes(early.status));
    const done = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }));
    assert.equal(done.status, 'completed'); assert.equal(done.exit_code, 0);
    assert((early.stdout + done.stdout).includes('JOB_STARTED')); assert((early.stdout + done.stdout).includes('JOB_DONE_çığ'));
    assert.equal(parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 0 })).no_new_output, true);
    checks.push('start once, wait locally, incremental UTF-8 output, exit code');

    id = parse(await jobs.startBackgroundJob({ command: command('fail'), timeout: 15 })).job_id;
    const failed = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }));
    assert.equal(failed.status, 'failed'); assert.equal(failed.exit_code, 7); assert(failed.stderr.includes('EXPECTED_FAILURE'));
    checks.push('nonzero exit preserved');

    id = parse(await jobs.startBackgroundJob({ command: command('tree'), timeout: 15 })).job_id;
    await pause(300);
    const cancelled = parse(await jobs.cancelBackgroundJob({ job_id: id }));
    assert.equal(cancelled.status, 'cancelled'); await pause(2400);
    assert(!fs.existsSync(path.join(workDir, 'late.txt')), 'Grandchild survived cancellation');
    checks.push('cancel terminates child process tree');

    id = parse(await jobs.startBackgroundJob({ command: command('tree'), timeout: 0.15 })).job_id;
    const expired = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }));
    assert.equal(expired.status, 'timed_out'); checks.push('timeout recorded separately from success');

    id = parse(await jobs.startBackgroundJob({ command: command('survive'), timeout: 15 })).job_id;
    const controller = new AbortController(); const waiting = jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }, controller.signal);
    setTimeout(() => controller.abort(), 50); await assert.rejects(waiting, /çalışmaya devam/);
    assert.equal(jobs.listBackgroundJobs().find(j => j.id === id).status, 'running');
    await jobs.cancelBackgroundJob({ job_id: id }); checks.push('interrupt wait keeps job alive; explicit cancel stops it');

    id = parse(await jobs.startBackgroundJob({ command: command('flood'), timeout: 15 })).job_id;
    const flood = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }));
    assert.equal(flood.status, 'completed'); assert.equal(flood.output_truncated, true); assert(flood.stdout.length <= 16000);
    assert(fs.statSync(path.join(workDir, '.deha', 'jobs', id, 'stdout.log')).size <= 10 * 1024 * 1024);
    checks.push('output bounded in memory, API response and disk');

    const proc = fork(__filename, ['--child', home], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    id = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Child start timeout')); }, 10000);
      proc.once('message', message => { clearTimeout(timer); resolve(message.job_id); });
      proc.once('error', error => { clearTimeout(timer); reject(error); });
      proc.stderr.on('data', chunk => process.stderr.write(chunk));
    });
    await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGKILL'); });
    await memory.loadSession(workDir);
    const survived = parse(await jobs.waitBackgroundJob({ job_id: id, wait_seconds: 5 }));
    assert.equal(survived.status, 'completed'); assert(survived.stdout.includes('JOB_DONE_çığ'));
    checks.push('supervisor survives forced CLI process kill and can be recovered');
    console.log(JSON.stringify({ passed: checks, artifacts: home }, null, 2));
  } finally {
    for (const job of jobs.listBackgroundJobs().filter(j => ['running', 'starting'].includes(j.status))) {
      await jobs.cancelBackgroundJob({ job_id: job.id }).catch(() => {});
    }
  }
}
(process.argv[2] === '--child' ? child() : parent()).catch(error => { console.error(error); process.exitCode = 1; });
