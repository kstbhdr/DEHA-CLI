// Real CLI + local HTTP provider + real project files. No paid model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const http = require('node:http'); const { spawn } = require('node:child_process');
const cli = path.resolve(__dirname, '../dist/index.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-pipeline-smoke-'));
fs.writeFileSync(path.join(dir, 'existing.cjs'), 'module.exports = 1;\n');
const counts = {}; let mode = 'pass', serverError;
const create = (file, code) => '```js\n// FILE: ' + file + '\n' + code + '\n```';
const edit = (old, code) => `EDIT: existing.cjs\n<<<OLD>>>\n${old}\n<<<NEW>>>\n${code}\n<<<END>>>`;
const strip = s => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); const role = req.url.split('/')[1];
    const key = mode + ':' + role; const count = counts[key] = (counts[key] || 0) + 1;
    assert.equal(body.model, role + '-model');
    assert.equal(req.headers.authorization, 'Bearer ' + role + '-key');
    if (role === 'cancel') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'started' } }] }) + '\n\n');
      return; // Held open until the caller aborts.
    }
    let message;
    const call = (name, input) => ({ role: 'assistant', content: null, tool_calls: [{ id: key + count, type: 'function', function: { name, arguments: JSON.stringify(input) } }] });
    const text = content => ({ role: 'assistant', content });
    if (role === 'planner') {
      assert(Array.isArray(body.tools));
      message = count === 1 ? call('read_file', { path: 'existing.cjs' })
        : text('Change existing.cjs from `module.exports = 1;` to 2 and create first.cjs plus second.cjs. Exact old snippet: module.exports = 1;\n[STATUS: COMPLETE]');
      if (count === 2) assert(JSON.stringify(body.messages).includes('module.exports = ' + (mode === 'pass' ? '1' : '2') + ';'));
    } else if (role === 'coder') {
      assert(!body.tools, 'Block-based Coder should use its role transport');
      if (mode === 'fail') message = text('I approve the plan.');
      else if (count === 1) message = text(create('first.cjs', 'module.exports = "first";') + '\n' + edit('missing exact snippet', 'module.exports = 2;'));
      else {
        const prompt = body.messages.at(-1).content;
        assert(prompt.includes('HATA:')); assert(prompt.includes('module.exports = 1;'));
        message = text(edit('module.exports = 1;', 'module.exports = 2;') + '\n' + create('second.cjs', 'module.exports = "second";'));
      }
    } else if (role === 'judge') {
      const prompt = body.messages.at(-1).content;
      assert(prompt.includes('APPLICATION RESULTS AND CURRENT FILES'));
      if (mode === 'pass' && count === 1) assert(prompt.includes('HATA:'));
      if (mode === 'pass' && count === 2) { assert(prompt.includes('first.cjs')); assert(prompt.includes('second.cjs')); }
      // An incorrect PASS after the first failed edit must be rejected by the orchestrator.
      message = text('VERDICT: PASS\nSCORE: 9/10\n## REQUIRED FIXES\nNone');
    } else if (role === 'chat') {
      message = count === 1 ? call('write_file', { path: 'chat-still-works.cjs', content: 'module.exports = "chat";' })
        : text('CHAT_CODING_VERIFIED [STATUS: COMPLETE]');
    } else throw new Error('Unexpected role: ' + role);
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: message.content } }] }) + '\n\ndata: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 25 } }));
    }
  } catch (err) {
    serverError = err; res.writeHead(500); res.end(JSON.stringify({ error: { message: String(err) } }));
  }
});

function launch(args, env, interactive = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: dir, windowsHide: true, env });
    let output = '', sent = false, exited = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI timeout: ' + strip(output).slice(-1400))); }, 45000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (interactive && !sent && strip(output).includes('DEHA ❯ ')) {
        sent = true; child.stdin.write('Create chat-still-works.cjs using the coding tools\n');
      }
      if (interactive && !exited && strip(output).includes('CHAT_CODING_VERIFIED')) { exited = true; child.stdin.write('/exit\n'); }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output: strip(output) }); });
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, DEHA_PROVIDER: 'custom', CUSTOM_MODEL: 'chat-model', CUSTOM_API_KEY: 'chat-key', CUSTOM_API_URL: base + '/chat/v1',
    DEHA_MAX_CONTEXT_TOKENS: '64000', DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0', NO_COLOR: '1', FORCE_COLOR: '0', PIPELINE_MAX_ITERATIONS: '2' };
  for (const role of ['planner', 'coder', 'judge']) {
    const upper = role.toUpperCase();
    env[upper + '_PROVIDER'] = 'custom'; env[upper + '_MODEL'] = role + '-model';
    env[upper + '_API_KEY'] = role + '-key'; env[upper + '_API_URL'] = base + '/' + role + '/v1';
  }
  const result = await launch(['build', 'Implement full fixture change', '--planner-model', 'planner-model', '--judge-model', 'judge-model'], env);
  if (serverError) throw serverError;
  assert.equal(result.code, 0, result.output.slice(-1400));
  assert.equal(counts['pass:coder'], 2); assert.equal(counts['pass:judge'], 2); assert.equal(counts['pass:planner'], 2);
  assert.equal(fs.readFileSync(path.join(dir, 'existing.cjs'), 'utf8'), 'module.exports = 2;\n');
  assert(fs.existsSync(path.join(dir, 'first.cjs'))); assert(fs.existsSync(path.join(dir, 'second.cjs')));
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.deha/session-buffer.json'), 'utf8'));
  assert.equal(state.activeTask.taskState, 'COMPLETE'); assert.equal(state.activeTask.originalUserRequest, 'Implement full fixture change');

  const chat = await launch([], env, true);
  assert.equal(chat.code, 0, chat.output.slice(-1400));
  assert.equal(fs.readFileSync(path.join(dir, 'chat-still-works.cjs'), 'utf8'), 'module.exports = "chat";');
  assert.equal(counts['pass:chat'], 2);

  mode = 'fail';
  const failed = await launch(['build', 'Demonstrate rejected empty implementation'], { ...env, PIPELINE_MAX_ITERATIONS: '1' });
  assert.equal(failed.code, 1, failed.output.slice(-1400));
  const failedState = JSON.parse(fs.readFileSync(path.join(dir, '.deha/session-buffer.json'), 'utf8'));
  assert.equal(failedState.activeTask.taskState, 'INTERRUPTED');

  const { callRole } = require('../dist/services/ai-service'); const { getConfig } = require('../dist/config');
  const controller = new AbortController();
  const held = callRole({ provider: 'custom', model: 'cancel-model', apiKey: 'cancel-key', apiUrl: base + '/cancel/v1' }, getConfig(), [{ role: 'user', content: 'cancel this local stream' }], 'local cancellation test', () => {}, 'coder', undefined, controller.signal);
  const rejection = assert.rejects(held, /cancel|abort/i);
  const timer = setTimeout(() => controller.abort(), 300);
  await rejection; clearTimeout(timer);
  if (serverError) throw serverError;
  console.log(JSON.stringify({ passed: ['three distinct role models/endpoints/keys', 'Planner real file read', 'failed edit cannot PASS', 'Coder retry with real disk evidence', 'full task review across iterations', 'normal interactive chat still writes files', 'failed CLI build exits 1', 'in-flight streaming request cancellation'], requests: counts, artifacts: dir }, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
