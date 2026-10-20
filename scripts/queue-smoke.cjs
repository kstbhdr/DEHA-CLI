// Exercises readline while the provider is waiting and while tools are running.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-queue-'));
const buffer = path.join(workDir, '.deha', 'session-buffer.json');
fs.writeFileSync(path.join(workDir, 'fixture.txt'), 'FIRST_TOOL_DONE');
const first = 'QUEUE_FIRST: read fixture.txt and finish.';
const second = 'QUEUE_SECOND: ikinci mesajı işle.';
const third = 'QUEUE_THIRD: üçüncü mesajı işle.\nİkinci satırı da koru.';
const drop = 'QUEUE_DROP: this must never reach the model.';
let child; let output = ''; let sentFirst = false; let requests = 0; let peak = 0; let active = 0;
let failure;
const strip = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (check()) return; await delay(20); }
  throw new Error('Timeout waiting for queue checkpoint: ' + strip(output).slice(-1200));
}
function state() { try { return JSON.parse(fs.readFileSync(buffer, 'utf8')); } catch { return {}; } }
function reply(res, message, reason = 'stop') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'queue', model: 'queue-test', choices: [{ index: 0, message, finish_reason: reason }],
    usage: { prompt_tokens: 100, completion_tokens: 20 } }));
}
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw); const context = JSON.stringify(payload.messages);
    peak = Math.max(peak, ++active); requests++;
    if (requests === 1) {
      child.stdin.write('QUEUE_CLEARED: remove this pending message\n/queue clear\n');
      child.stdin.write(second + '\n\x1b[200~' + third + '\x1b[201~\n' + drop + '\n/queue remove 3\n/queue\n');
      await until(() => state().pendingInputs?.length === 2);
      assert.deepEqual(state().pendingInputs, [second, third]);
      assert.equal(state().activeTask.originalUserRequest, first);
      assert(!context.includes('QUEUE_SECOND'));
      assert(!context.includes('QUEUE_THIRD'));
      assert.equal(requests, 1, 'A second model request started before the first task finished');
      reply(res, { role: 'assistant', content: null, tool_calls: [{ id: 'first-tool', type: 'function',
        function: { name: 'read_file', arguments: JSON.stringify({ path: path.join(workDir, 'fixture.txt') }) } }] }, 'tool_calls');
    } else {
      assert(!context.includes('QUEUE_DROP')); assert(!context.includes('QUEUE_CLEARED'));
      if (requests === 2) {
        assert(context.includes('FIRST_TOOL_DONE')); assert(!context.includes('QUEUE_SECOND')); assert(!context.includes('QUEUE_THIRD'));
      } else if (requests === 3) {
        assert.equal(state().messages.filter(m => m.role === 'user').at(-1).content, second);
        assert(!context.includes('QUEUE_THIRD'));
      } else if (requests === 4) {
        assert.equal(state().messages.filter(m => m.role === 'user').at(-1).content, third);
        assert.deepEqual(state().pendingInputs, []);
      } else throw new Error('Unexpected model request ' + requests);
      reply(res, { role: 'assistant', content: `QUEUE_DONE_${requests} [STATUS: COMPLETE]` });
    }
  } catch (error) {
    failure = error; reply(res, { role: 'assistant', content: 'Test failed [STATUS: BLOCKED]' });
    child?.kill();
  } finally { active--; }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  child = spawn(process.execPath, [path.join(root, 'dist', 'index.js')], { cwd: workDir, windowsHide: true,
    env: { ...process.env, DEHA_PROVIDER: 'custom', CUSTOM_API_URL: `http://127.0.0.1:${server.address().port}/v1`,
      CUSTOM_API_KEY: 'local-test-only', CUSTOM_MODEL: 'queue-test', DEHA_MAX_CONTEXT_TOKENS: '64000',
      DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0', NO_COLOR: '1', FORCE_COLOR: '0' } });
  let sentExit = false;
  const timer = setTimeout(() => { failure = new Error('CLI queue smoke timed out: ' + strip(output).slice(-1800)); child.kill(); }, 30000);
  child.stdout.on('data', chunk => {
    output += chunk.toString();
    if (!sentFirst && strip(output).includes('DEHA ❯ ')) { sentFirst = true; child.stdin.write(first + '\n'); }
    if (!sentExit && strip(output).includes('QUEUE_DONE_4')) { sentExit = true; child.stdin.write('/exit\n'); }
  });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  clearTimeout(timer);
  if (failure) throw failure;
  assert.equal(code, 0); assert.equal(requests, 4); assert.equal(peak, 1);
  assert(strip(output).includes('Sıraya eklendi'));
  assert(strip(output).includes('Bekleyen mesajlar temizlendi.'));
  assert(strip(output).includes('Mesaj sıradan çıkarıldı.'));
  console.log(JSON.stringify({ passed: ['live input during agent work', 'FIFO after tool results', 'no overlapping requests',
    'queue listing/removal/clear', 'UTF-8 multiline paste', 'queue persisted outside active context'], requests, artifacts: workDir }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  child?.kill(); server.closeAllConnections(); server.close();
});
