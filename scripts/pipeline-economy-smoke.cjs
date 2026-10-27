// Real interactive CLI, local simulated Planner and Ollama-compatible Coder. No real LLM/API spend.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-economy-'));
const testHome = path.join(dir, 'home'); fs.mkdirSync(testHome);
fs.writeFileSync(path.join(dir, 'source.cjs'), 'module.exports = "source";');
const counts = { planner: 0, coder: 0, judge: 0, chat: 0 }; let error, planId;
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), role = req.url.split('/')[1]; counts[role]++;
    let message;
    const call = (name, input, index) => ({ id: 'call-' + role + '-' + counts[role] + '-' + index, type: 'function', function: { name, arguments: JSON.stringify(input) } });
    const calls = items => ({ role: 'assistant', content: null, tool_calls: items.map(([name, input], i) => call(name, input, i)) });
    if (role === 'planner') {
      assert.equal(body.model, 'large-planner-fixture');
      assert(JSON.stringify(body.messages).includes('Create economy.cjs'));
      message = counts.planner === 1 ? calls([['read_file', { path: 'source.cjs' }]]) : { role: 'assistant', content: '## PLAN\n- [ ] Create and verify economy.cjs\nPLANNER_HANDOFF_ONLY_TOKEN: export ECONOMY and print ECONOMY_VERIFIED when executed.\n[STATUS: COMPLETE]' };
    } else if (role === 'coder') {
      assert.equal(req.url, '/coder/v1/chat/completions');
      assert.equal(body.model, 'qwen-9b-fixture'); assert.equal(body.tool_choice, undefined);
      assert.equal(body.max_tokens, 2048); assert(body.tools.some(t => t.function.name === 'write_file'));
      assert(!body.tools.some(t => t.function.name === 'generate_image'));
      if (counts.coder <= 2) {
        assert(body.tools.some(t => t.function.name === 'task_plan'));
        assert(JSON.stringify(body.messages).includes('PLANNER_HANDOFF_ONLY_TOKEN'), 'Saved Planner handoff missing from actual Coder API payload');
        assert(planId, 'Coder ran before the plan was saved');
        if (counts.coder === 1) message = calls([
          ['write_file', { path: 'economy.cjs', content: 'module.exports = "ECONOMY"; console.log("ECONOMY_VERIFIED");' }],
          ['run_shell', { command: '"' + process.execPath + '" economy.cjs', cwd: dir }],
          ['task_plan', { action: 'update_step', index: 1, status: 'done', evidence: 'Created economy.cjs and ran node economy.cjs for ECONOMY_VERIFIED.' }],
        ]);
        else { assert(JSON.stringify(body.messages).includes('ECONOMY_VERIFIED')); message = { role: 'assistant', content: 'Economy implementation done [STATUS: COMPLETE]' }; }
      } else if (counts.coder === 3) {
        assert(!body.tools.some(t => t.function.name === 'task_plan'));
        message = calls([['write_file', { path: 'direct.cjs', content: 'module.exports = "DIRECT_CODER";' }]]);
      } else message = { role: 'assistant', content: 'DIRECT_CODER_VERIFIED [STATUS: COMPLETE]' };
    } else throw new Error('Disabled or unrelated model called: ' + role);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  } catch (err) { error = err; res.writeHead(500); res.end(JSON.stringify({ error: { message: String(err) } })); }
});
const strip = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const env = { ...process.env, USERPROFILE: testHome, HOME: testHome, DEHA_PROVIDER: 'custom', CUSTOM_MODEL: 'chat-fixture', CUSTOM_API_KEY: 'local-chat', CUSTOM_API_URL: base + '/chat/v1',
    PLANNER_PROVIDER: 'custom', PLANNER_MODEL: 'large-planner-fixture', PLANNER_API_KEY: 'local-planner', PLANNER_API_URL: base + '/planner/v1',
    CODER_PROVIDER: 'ollama', CODER_MODEL: 'qwen-9b-fixture', CODER_API_KEY: '', CODER_API_URL: base + '/coder', CODER_MAX_TOKENS: '2048', CODER_MAX_CONTEXT_TOKENS: '64000', CODER_MAX_TOOL_ROUNDS: '12',
    JUDGE_PROVIDER: 'custom', JUDGE_MODEL: 'judge-fixture', JUDGE_API_KEY: 'local-judge', JUDGE_API_URL: base + '/judge/v1',
    PIPELINE_CODER_MODE: 'agent', PIPELINE_PLANNER_ENABLED: '1', PIPELINE_JUDGE_ENABLED: '0', PIPELINE_HISTORY_TOKENS: '500',
    DEHA_MAX_CONTEXT_TOKENS: '64000', DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0', NO_COLOR: '1', FORCE_COLOR: '0' };
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/index.js')], { cwd: dir, env, windowsHide: true });
  let output = '', step = 0, taskOffset = 0;
  const timer = setTimeout(() => { error = new Error('Economy CLI timeout: ' + strip(output).slice(-1600)); child.kill(); }, 45000);
  child.stdout.on('data', chunk => {
    output += chunk.toString(); const text = strip(output);
    if (step === 0 && text.includes('DEHA ❯ ')) { step = 1; child.stdin.write('/plan Create economy.cjs and verify it\n'); }
    if (step === 1 && text.includes('Pipeline: planned / Judge not run')) {
      planId = JSON.parse(fs.readFileSync(path.join(dir, '.deha/tasks/latest.json'), 'utf8')).id;
      assert.equal(counts.coder, 0); step = 2; child.stdin.write('/code\n');
    }
    if (step === 2 && text.includes('Pipeline: applied / Judge not run')) { step = 3; taskOffset = text.length; child.stdin.write('/task\n'); }
    if (step === 3 && text.slice(taskOffset).includes('Status: applied') && text.slice(taskOffset).includes('[x]')) { step = 4; child.stdin.write('/coderchat\n'); }
    if (step === 4 && text.includes('CODER ❯ ')) { step = 5; child.stdin.write('Create direct.cjs using coding tools\n'); }
    if (step === 5 && text.includes('DIRECT_CODER_VERIFIED')) { step = 6; child.stdin.write('/exit\n'); }
  });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  clearTimeout(timer); if (error) throw error;
  assert.equal(code, 0, strip(output).slice(-1600)); assert.equal(step, 6);
  assert.deepEqual(counts, { planner: 2, coder: 4, judge: 0, chat: 0 });
  const pointer = JSON.parse(fs.readFileSync(path.join(dir, '.deha/tasks/latest.json'), 'utf8'));
  assert.equal(pointer.id, planId);
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.deha/tasks', planId, 'state.json'), 'utf8'));
  assert.equal(record.status, 'applied'); assert(record.steps.every(s => s.status === 'done'));
  assert(fs.readFileSync(path.join(dir, 'economy.cjs'), 'utf8').includes('ECONOMY'));
  assert(fs.existsSync(path.join(dir, 'direct.cjs')));
  console.log(JSON.stringify({ passed: ['plan-only persists task.md', 'saved plan reaches actual Coder API', 'Coder executes file and shell tools', 'Ollama-compatible URL without API key', 'checklist saved with evidence', '/task local display', '/coderchat independent tool coding', 'no repeated Planner stage', 'zero Judge and Chat requests'], requests: counts, artifacts: dir }, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
