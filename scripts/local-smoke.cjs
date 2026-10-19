// Real CLI smoke checks against a local provider; no paid model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'dist', 'index.js');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha local smoke '));
const task = 'LOCAL_SMOKE: read input.txt, write result.txt, run a shell check and record SMOKE_BRAIN.';
const checks = [];
const baseEnv = { ...process.env, DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0', FORCE_COLOR: '0', NO_COLOR: '1' };
const stripAnsi = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

function launch(args, extraEnv = {}, interactiveInput) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: workDir, env: { ...baseEnv, ...extraEnv }, windowsHide: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let output = ''; let sentTask = false; let sentExit = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI smoke timeout: ' + args.join(' '))); }, 45000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (interactiveInput) {
        const prompts = (stripAnsi(output).match(/DEHA ❯ /g) || []).length;
        if (prompts >= 1 && !sentTask) { sentTask = true; child.stdin.write(interactiveInput + '\n'); }
        if (prompts >= 2 && !sentExit) { sentExit = true; child.stdin.write('/exit\n'); }
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stripAnsi(output)) : reject(new Error(`CLI exited ${code}: ${stripAnsi(output).slice(-2000)}`)); });
  });
}

let requests = 0;
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>DEHA smoke</title><h1>DEHA_BROWSER_OK</h1>'); return;
  }
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw); requests++;
    const calls = requests === 1 ? [
      ['brain', { action: 'set_plan', steps: ['Read, write and verify smoke fixture'] }],
      ['read_file', { path: path.join(workDir, 'input.txt') }],
      ['write_file', { path: path.join(workDir, 'result.txt'), content: 'DEHA_SMOKE_OK' }],
      ['run_shell', { command: 'echo DEHA_SHELL_OK', cwd: workDir }],
      ['brain', { action: 'add_finding', text: 'SMOKE_BRAIN survives restart' }],
    ] : [];
    if (requests >= 3) {
      const context = JSON.stringify(payload.messages);
      assert(context.includes('SMOKE_BRAIN survives restart'), 'Brain missing after resume');
      assert(payload.messages.some(m => m.role === 'user' && String(m.content).includes('<task>') && String(m.content).includes('LOCAL_SMOKE')), 'Original task missing after resume');
    }
    const message = calls.length ? { role: 'assistant', content: null, tool_calls: calls.map(([name, input], i) => ({ id: `smoke_${i}`, type: 'function', function: { name, arguments: JSON.stringify(input) } })) }
      : { role: 'assistant', content: `${requests >= 3 ? 'SMOKE_RESUME_OK' : 'SMOKE_AGENT_OK'} [STATUS: COMPLETE]` };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'smoke', model: 'smoke-model', choices: [{ index: 0, message, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: error.message } })); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const providerEnv = { DEHA_PROVIDER: 'custom', CUSTOM_API_URL: `${url}/v1`, CUSTOM_API_KEY: 'local-smoke-only', CUSTOM_MODEL: 'smoke-model', DEHA_SYSTEM_PROMPT: 'Execute the local smoke task using tools.', DEHA_MAX_CONTEXT_TOKENS: '64000' };
  try {
    assert((await launch(['--help'])).includes('resume')); checks.push('CLI help');
    assert((await launch(['--version'])).includes('1.0.8')); checks.push('CLI version');
    fs.writeFileSync(path.join(workDir, 'input.txt'), 'DEHA_SMOKE_OK');
    const first = await launch([], providerEnv, task);
    assert(first.includes('SMOKE_AGENT_OK'), first.slice(-1200));
    assert.equal(fs.readFileSync(path.join(workDir, 'result.txt'), 'utf8'), 'DEHA_SMOKE_OK');
    checks.push('interactive agent: read/write/shell/brain');
    const checkpoint = JSON.parse(fs.readFileSync(path.join(workDir, '.deha', 'session-buffer.json'), 'utf8'));
    assert(checkpoint.workspace.brain.findings.includes('SMOKE_BRAIN survives restart'));
    const resumed = await launch(['resume', checkpoint.conversationId], providerEnv, 'devam et araştırmayı tamamlamadın görevi bitirmeden durma');
    assert(resumed.includes('SMOKE_RESUME_OK'), resumed.slice(-1200)); checks.push('process restart + resume task/brain');
    assert((await launch(['python', '--venv', '-c', 'import sys; print("DEHA_VENV_OK", sys.prefix)'])).includes(path.join(workDir, '.venv'))); checks.push('Python venv with spaces in path');
    assert((await launch(['smoketest', url])).includes('1')); checks.push('HTTP smoke');
    const screenshot = path.join(workDir, 'browser.png');
    await launch(['screenshot', url, '-o', screenshot, '-w', '0']);
    assert(fs.statSync(screenshot).size > 1000); checks.push('Playwright screenshot');
    console.log(JSON.stringify({ passed: checks, requests, artifacts: workDir }, null, 2));
  } finally { server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
