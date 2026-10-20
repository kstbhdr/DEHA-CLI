// Real process-kill recovery check; all storage lives in an isolated temp home.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { fork } = require('child_process');

async function child(home, project, mode) {
  os.homedir = () => home;
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  const memory = require('../dist/services/session-memory');
  const { initializeInteractiveSession } = require('../dist/services/interactive-session');
  const conversations = require('../dist/conversations/manager');
  const restored = await initializeInteractiveSession(project);
  if (mode === 'write') {
    memory.setActiveTask('Recover the ARC research without losing E19');
    memory.setWorkspaceContextRaw({ version: 1, brain: { steps: [{ text: 'E19 research', status: 'doing' }],
      findings: ['17/118'], decisions: [], deadEnds: ['E18 failed'] }, changes: [], toolLog: [],
      followUps: { taskId: '', items: [] }, nextSeq: 1, turn: 19 });
    await memory.appendMessage({ role: 'user', content: 'Research ARC' });
    await memory.appendMessage({ role: 'assistant', content: null, tool_calls: [
      { id: 'probe', type: 'function', function: { name: 'run_shell', arguments: '{"command":"probe"}' } }] });
    await memory.appendMessage({ role: 'tool', tool_call_id: 'probe', content: 'E19 result persisted' });
    memory.setPendingInputs(['Queued follow-up one', 'Queued follow-up two']);
    process.send({ ready: true });
    setInterval(() => {}, 1000);
  } else {
    assert.equal(restored.messages.at(-1).content, 'E19 result persisted');
    assert.equal(memory.getActiveTask().originalUserRequest, 'Recover the ARC research without losing E19');
    assert.deepEqual(memory.getSessionSnapshot().workspace.brain.deadEnds, ['E18 failed']);
    assert.deepEqual(memory.getPendingInputs(), ['Queued follow-up one', 'Queued follow-up two']);
    const listed = conversations.listConversations(100, project);
    assert.equal(listed.length, 1);
    assert.equal(conversations.loadConversationMessages(listed[0].id)[1].tool_calls[0].id, 'probe');
    process.send({ recovered: true });
    process.exit(0);
  }
}

async function parent() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-kill-'));
  const project = path.join(home, 'project'); fs.mkdirSync(project);
  const spawn = mode => fork(__filename, [home, project, mode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const wait = (proc, key) => new Promise((resolve, reject) => {
    let received = false;
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`Timeout: ${key}`)); }, 20000);
    proc.stderr.on('data', chunk => process.stderr.write(chunk));
    proc.once('error', error => { clearTimeout(timer); reject(error); });
    proc.on('message', msg => { if (msg[key]) { received = true; clearTimeout(timer); resolve(); } });
    proc.once('exit', code => { clearTimeout(timer); if (!received) reject(new Error(`Child exited before ${key}: ${code}`)); });
  });
  const writer = spawn('write'); await wait(writer, 'ready');
  await new Promise(resolve => { writer.once('exit', resolve); writer.kill('SIGKILL'); });
  await wait(spawn('read'), 'recovered');
  // Simulate damaged local files as well, forcing the independent global copy.
  const buffer = path.join(project, '.deha', 'session-buffer.json');
  fs.writeFileSync(buffer, '{broken'); fs.writeFileSync(`${buffer}.bak`, '{broken');
  await wait(spawn('read'), 'recovered');
  console.log('PASS: forced kill -> restart -> task, brain, tool_calls, history; corrupt local buffers -> global recovery');
}

(process.argv[2] ? child(...process.argv.slice(2)) : parent()).catch(error => {
  console.error(error); process.exitCode = 1;
});
