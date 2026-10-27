// Actual CLI, real file/shell tools, local simulated providers. No paid API calls.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http'), assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-checkpoint-'));
const testHome = path.join(dir, 'home'); fs.mkdirSync(testHome);
fs.writeFileSync(path.join(dir, 'source.cjs'), 'module.exports = "baseline";');
const counts = { planner: 0, coder: 0, judge: 0, chat: 0 };
const events = []; let serverError, implementing = 0;
const command = file => '"' + process.execPath + '" ' + file;
const state = () => {
  const pointer = JSON.parse(fs.readFileSync(path.join(dir, '.deha/tasks/latest.json'), 'utf8'));
  return JSON.parse(fs.readFileSync(path.join(dir, '.deha/tasks', pointer.id, 'state.json'), 'utf8'));
};
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), role = req.url.split('/')[1]; counts[role]++;
    let message;
    const text = content => ({ role: 'assistant', content });
    const calls = items => ({ role: 'assistant', content: null, tool_calls: items.map(([name, input], i) => ({ id: 'call-' + counts.coder + '-' + i, type: 'function', function: { name, arguments: JSON.stringify(input) } })) });
    if (role === 'planner') {
      assert.equal(body.model, 'large-planner'); assert(!body.tools, 'Planner must not execute tools');
      if (counts.planner === 1) {
        events.push('plan'); assert(JSON.stringify(body.messages).includes('baseline'));
        message = text(JSON.stringify({ overview: 'Implement two verified modules sequentially.', checkpoints: ['first.cjs', 'second.cjs'].map(file => ({ title: file, instructions: 'Create ' + file + ' exporting FIXED and printing VERIFIED.', files: [file], commands: [command(file)], acceptance: ['Exports FIXED, prints VERIFIED and passes the declared Node check.'] })) }));
      } else {
        const record = state(), phase = record.checkpoints.findIndex(c => c.status !== 'approved');
        assert.equal(record.steps[phase].status, 'doing');
        if (counts.planner === 2) {
          assert.equal(phase, 0); assert(!fs.existsSync(path.join(dir, 'second.cjs')));
          assert(JSON.stringify(body.messages).includes('WRONG')); events.push('reject1');
          message = text(JSON.stringify({ decision: 'revise', feedback: 'The module exports WRONG. Replace it with FIXED and rerun the Node check.' }));
        } else if (counts.planner === 4) {
          assert.equal(phase, 1); events.push('invalid2'); message = text('Looks good, continue!');
        } else {
          assert(JSON.stringify(body.messages).includes('VERIFIED'));
          events.push('approve' + (phase + 1)); message = text(JSON.stringify({ decision: 'approve', feedback: 'Actual module exports FIXED and the Node check printed VERIFIED.' }));
        }
      }
    } else if (role === 'coder') {
      assert.equal(body.model, 'small-coder');
      if (counts.coder === 1) {
        assert(!body.tools.some(t => t.function.name === 'write_file'));
        events.push('discovery'); message = calls([['read_file', { path: 'source.cjs' }]]);
      } else if (counts.coder === 2) message = text('source.cjs exports baseline; use Node to check the new modules. [STATUS: COMPLETE]');
      else if (counts.coder % 2 === 1) {
        const record = state(), phase = record.checkpoints.findIndex(c => c.status !== 'approved');
        const file = record.checkpoints[phase].files[0]; implementing++;
        events.push('coder' + (phase + 1));
        if (phase === 1) assert.equal(record.checkpoints[0].status, 'approved');
        const items = [['write_file', { path: file, content: 'module.exports = "' + (implementing === 1 ? 'WRONG' : 'FIXED') + '"; console.log("VERIFIED");' }]];
        if (implementing === 1) items.push(['write_file', { path: 'second.cjs', content: 'premature' }], ['task_plan', { action: 'update_step', index: 2, status: 'done', evidence: 'Attempt to prematurely approve the next phase.' }]);
        items.push(['run_shell', { command: command(file), cwd: dir }], ['task_plan', { action: 'update_step', index: phase + 1, status: 'done', evidence: 'Created ' + file + ' and ran its Node verification.' }]);
        message = calls(items);
      } else message = text('Submitted checkpoint evidence [STATUS: COMPLETE]');
    } else throw new Error('Unexpected model called: ' + role);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  } catch (err) { serverError = err; res.writeHead(500); res.end(JSON.stringify({ error: { message: String(err) } })); }
});
function launch(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/index.js'), ...args], { cwd: dir, env, windowsHide: true });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Checkpoint CLI timeout: ' + output.slice(-1800))); }, 45000);
    child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const env = { ...process.env, USERPROFILE: testHome, HOME: testHome, DEHA_PROVIDER: 'custom', CUSTOM_MODEL: 'chat', CUSTOM_API_KEY: 'local', CUSTOM_API_URL: base + '/chat/v1',
    PIPELINE_CHECKPOINTS: '0', PIPELINE_MAX_ITERATIONS: '2', DEHA_AUTO_START_SERVICES: '0', DEHA_MCP_AUTOCONNECT: '0', DEHA_CHECK_UPDATES: '0', DEHA_MAX_CONTEXT_TOKENS: '64000', NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const role of ['planner', 'coder', 'judge']) Object.assign(env, { [role.toUpperCase() + '_PROVIDER']: 'custom', [role.toUpperCase() + '_MODEL']: role === 'planner' ? 'large-planner' : 'small-coder', [role.toUpperCase() + '_API_KEY']: 'local', [role.toUpperCase() + '_API_URL']: base + '/' + role + '/v1' });
  // Exercise correction gates, then verify a completed resume in a separate process is local.
  const first = await launch(['build', 'Create two modules', '--checkpoints'], env);
  if (serverError) throw serverError;
  assert.equal(first.code, 0, first.output.slice(-2500));
  const record = state(); assert.deepEqual(record.checkpoints.map(c => c.status), ['approved', 'approved']);
  assert.deepEqual(record.checkpoints.map(c => c.attempts), [2, 2]);
  assert(record.steps.every(s => s.status === 'done'));
  assert.deepEqual(events, ['discovery', 'plan', 'coder1', 'reject1', 'coder1', 'approve1', 'coder2', 'invalid2', 'coder2', 'approve2']);
  assert.equal(counts.planner, 5); assert.equal(counts.coder, 10); assert.equal(counts.judge, 0); assert.equal(counts.chat, 0);
  const before = JSON.stringify(counts);
  const resumed = await launch(['build', 'Resume', '--use-saved-plan'], env);
  if (serverError) throw serverError;
  assert.equal(resumed.code, 0, resumed.output.slice(-2000)); assert.equal(JSON.stringify(counts), before);
  console.log(JSON.stringify({ passed: ['all tools executed by small Coder', 'Planner plan + checkpoint reviews only', 'future file writes and task updates rejected', 'same phase corrected before next phase', 'malformed approval keeps phase locked', 'actual shell checks and disk evidence', 'persistent approved checkpoints', 'completed resume sends no model requests', 'zero Judge requests'], requests: counts, artifacts: dir }, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => { server.closeAllConnections(); server.close(); });
