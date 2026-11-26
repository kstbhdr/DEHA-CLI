// Real concurrent processes; all storage is contained in a temporary home.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { fork } = require('child_process');

async function child(home, launch, project, marker, id = '') {
  os.homedir = () => home;
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  const session = require('../dist/services/session-memory');
  const { initializeInteractiveSession } = require('../dist/services/interactive-session');
  const { executeBrainTool, syncBrainFile } = require('../dist/services/sectioned-context/brain');
  const { getBrainFile } = require('../dist/services/sectioned-context/store');
  try {
    const restored = await initializeInteractiveSession(launch, [], id || undefined, { resume: !!id });
    if (!id) {
      assert.equal(restored.messages.length, 0);
      session.setWorkDir(project);
      syncBrainFile();
      await session.appendMessage({ role: 'user', content: marker });
      executeBrainTool({ action: 'set_plan', steps: [marker] });
    }
    process.send({ ready: true, id: restored.conversationId, brain: getBrainFile(),
      buffer: session.getSessionBufferFile(), project: session.getWorkDir(),
      namespace: session.getMemoryNamespace(), workspace: session.getSessionSnapshot().workspace });
    process.on('message', async msg => {
      if (msg.action === 'stop') process.exit(0);
      if (msg.action === 'update') {
        executeBrainTool({ action: 'add_finding', text: marker + '_UPDATED' });
        process.send({ updated: true });
      }
    });
  } catch (error) {
    process.send({ blocked: true, error: error.message });
    process.exit(0);
  }
}

async function parent() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-isolation-'));
  const launch = path.join(home, 'launch');
  const project = path.join(home, 'shared-project');
  const other = path.join(home, 'other-launch');
  for (const dir of [launch, project, other]) fs.mkdirSync(dir);
  const children = [];
  const spawn = (marker, id = '', cwd = launch, scope = '') => {
    const proc = fork(__filename, [home, cwd, project, marker, id], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, DEHA_SESSION_SCOPE: scope },
    });
    proc.stderr.on('data', data => process.stderr.write(data));
    children.push(proc);
    return proc;
  };
  const wait = (proc, key) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timeout: ${key}`)); }, 20000);
    const onMessage = msg => {
      if (msg[key] || (key === 'outcome' && (msg.ready || msg.blocked))) { cleanup(); resolve(msg); }
      else if (msg.blocked) { cleanup(); reject(new Error(msg.error)); }
    };
    const onExit = code => { cleanup(); reject(new Error(`Exited before ${key}: ${code}`)); };
    function cleanup() { clearTimeout(timer); proc.off('message', onMessage); proc.off('exit', onExit); }
    proc.on('message', onMessage); proc.once('exit', onExit);
  });
  const stop = proc => new Promise(resolve => { proc.once('exit', resolve); proc.send({ action: 'stop' }); });
  try {
    const a = spawn('PRIVATE_A'); const readyA = wait(a, 'ready');
    const b = spawn('PRIVATE_B'); const readyB = wait(b, 'ready');
    const [first, second] = await Promise.all([readyA, readyB]);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.brain, second.brain);
    assert.notEqual(first.buffer, second.buffer);
    assert.notEqual(first.namespace, second.namespace);
    assert.equal(path.basename(first.brain), 'brain.md');
    for (const [own, marker, foreign] of [[first, 'PRIVATE_A', 'PRIVATE_B'], [second, 'PRIVATE_B', 'PRIVATE_A']]) {
      assert.ok(own.brain.startsWith(project + path.sep));
      assert.ok(fs.readFileSync(own.brain, 'utf8').includes(marker));
      assert.ok(!fs.readFileSync(own.brain, 'utf8').includes(foreign));
    }
    const blocked = await wait(spawn('RESUME', first.id, other), 'blocked');
    assert.match(blocked.error, /Sohbet/);
    const updating = wait(b, 'updated'); b.send({ action: 'update' }); await updating;
    assert.ok(!fs.readFileSync(first.brain, 'utf8').includes('PRIVATE_B'));
    await new Promise(resolve => { a.once('exit', resolve); a.kill('SIGKILL'); });
    const contenderA = spawn('RESUMED_A', first.id, other); const resultA = wait(contenderA, 'outcome');
    const contenderB = spawn('RESUMED_B', first.id, other); const resultB = wait(contenderB, 'outcome');
    const outcomes = await Promise.all([resultA, resultB]);
    assert.equal(outcomes.filter(result => result.ready).length, 1, 'Exactly one process must acquire a dead owner\'s lock');
    const winner = outcomes[0].ready ? 0 : 1;
    const resumed = [contenderA, contenderB][winner];
    const restored = outcomes[winner];
    assert.equal(restored.project, project);
    assert.equal(restored.brain, first.brain);
    assert.equal(restored.namespace, first.namespace);
    assert.equal(restored.workspace.brain.steps[0].text, 'PRIVATE_A');
    await stop(resumed);
    await stop(b);
    const scoped = spawn('SCOPED', '', launch, 'same-scope'); await wait(scoped, 'ready');
    const rejected = await wait(spawn('COLLISION', '', project, 'same-scope'), 'blocked');
    assert.match(rejected.error, /kapsamı kullanımda/);
    await stop(scoped);
    console.log('PASS: parallel agents, project switch, private brains/buffers, duplicate resume/scope blocked, killed owner recovery');
    console.log(`Artifacts: ${home}`);
  } finally {
    for (const proc of children) if (proc.exitCode === null) proc.kill('SIGKILL');
  }
}

(process.argv[2] ? child(...process.argv.slice(2)) : parent()).catch(error => {
  console.error(error); process.exitCode = 1;
});
