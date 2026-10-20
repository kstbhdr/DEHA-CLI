// Real interactive CLI, fake local provider, real supervised shell job.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const assert = require('node:assert/strict'); const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'); const cli = path.join(root, 'dist', 'index.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-bg-agent-'));
const fixture = path.join(dir, 'copy.cjs');
fs.writeFileSync(fixture, "console.log('COPY_STARTED'); setTimeout(()=>{require('fs').writeFileSync('manifest.json',JSON.stringify({verified:true,shards:7})); console.log('COPY_COMPLETE');},2500)");
const strip = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
let requests = 0, jobId, waitStart, waitEnd, testError;
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw); requests++;
    let message;
    const call = (name, input) => ({ role: 'assistant', content: null,
      tool_calls: [{ id: `job-call-${requests}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] });
    const results = payload.messages.filter(m => m.role === 'tool');
    if (requests === 1) {
      assert(payload.tools.some(t => t.function.name === 'start_job'));
      message = call('start_job', { command: `"${process.execPath}" "${fixture}"`, cwd: dir, timeout: 15 });
    } else if (requests === 2) {
      jobId = JSON.parse(results.at(-1).content).job_id;
      assert(jobId); message = { role: 'assistant', content: 'PREMATURE_COMPLETE [STATUS: COMPLETE]' };
    } else if (requests === 3) {
      assert(JSON.stringify(payload.messages).includes('[JOB STILL RUNNING]'));
      message = call('wait_job', { job_id: jobId, wait_seconds: 5 }); waitStart = Date.now();
    } else if (requests === 4) {
      waitEnd = Date.now(); const waited = JSON.parse(results.at(-1).content);
      assert.equal(waited.status, 'completed'); assert.equal(waited.exit_code, 0); assert(waited.stdout.includes('COPY_COMPLETE'));
      message = call('read_file', { path: path.join(dir, 'manifest.json') });
    } else if (requests === 5) {
      assert(results.at(-1).content.includes('"verified":true')); assert(results.at(-1).content.includes('"shards":7'));
      message = { role: 'assistant', content: 'BACKGROUND_VERIFIED_OK [STATUS: COMPLETE]' };
    } else throw new Error('Unexpected API request ' + requests);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'bg-test', model: 'bg-test', choices: [{ index: 0, message,
      finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  } catch (error) { testError = error; res.writeHead(500); res.end(JSON.stringify({ error: { message: String(error) } })); }
});

async function launch(env, task, waitFor) {
  const child = spawn(process.execPath, [cli], { cwd: dir, windowsHide: true, env });
  let output = '', sent = false, exited = false;
  const timer = setTimeout(() => { testError = new Error('CLI timeout: ' + strip(output).slice(-1800)); child.kill(); }, 25000);
  child.stdout.on('data', chunk => {
    output += chunk.toString();
    if (!sent && strip(output).includes('DEHA ❯ ')) { sent = true; child.stdin.write(task + '\n'); }
    if (!exited && strip(output).includes(waitFor)) { exited = true; child.stdin.write('/exit\n'); }
  });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timer); if (testError) throw testError;
  assert.equal(code, 0, strip(output).slice(-1000)); return strip(output);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, DEHA_PROVIDER: 'custom', CUSTOM_API_URL: `http://127.0.0.1:${server.address().port}/v1`,
    CUSTOM_API_KEY: 'local-test-only', CUSTOM_MODEL: 'bg-test', DEHA_MAX_CONTEXT_TOKENS: '64000',
    DEHA_BACKGROUND_JOBS: '1', DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0',
    NO_COLOR: '1', FORCE_COLOR: '0' };
  const output = await launch(env, 'BACKGROUND_SMOKE: copy the fixture model once, wait and verify its manifest.', 'BACKGROUND_VERIFIED_OK');
  assert.equal(requests, 5); assert(!output.includes('PREMATURE_COMPLETE'));
  assert(waitEnd - waitStart >= 1000, 'Wait did not remain local until the job finished');
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.deha', 'session-buffer.json'), 'utf8'));
  assert.equal(state.activeTask.taskState, 'COMPLETE');
  assert.equal(fs.readdirSync(path.join(dir, '.deha', 'jobs')).filter(f => f.startsWith('job-')).length, 1);
  console.log(JSON.stringify({ passed: ['real CLI start_job + wait_job + manifest verification',
    'premature COMPLETE rejected', 'one process started', 'no model requests during local wait'], requests,
    localWaitMs: waitEnd - waitStart, artifacts: dir }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
