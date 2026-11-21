// Interactive developer test harness. Credentials arrive through stdin only; never written to files.
const readline = require('node:readline');
const path = require('node:path');
let { Manager } = require('../app/manager.cjs');
let manager = new Manager();
const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const summary = () => ({ phase: manager.state.phase, busy: !!manager.job, message: manager.state.message, count: manager.state.count, modules: manager.state.modules, events: manager.state.events });
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = readline.createInterface({ input: process.stdin, terminal: false });
(async () => {
  output({ ready: true });
  for await (const line of input) {
    try {
      const command = JSON.parse(line);
      if (command.action === 'connect') { manager.connect(command.data); output({ started: true }); }
      else if (command.action === 'run') { manager.run(command.data); output({ started: true }); }
      else if (command.action === 'state') output(summary());
      else if (command.action === 'info') output(await manager.browser.info());
      else if (command.action === 'scan') output(await manager.browser.quiz({ action: 'scan', config: command.config || {} }));
      else if (command.action === 'evaluate') output(await manager.browser.evaluate(command.expression));
      else if (command.action === 'navigate') { await manager.browser.navigate(command.url, new AbortController().signal); output({ navigated: true }); }
      else if (command.action === 'modules') { manager.refreshModules(); output({ started: true }); }
      else if (command.action === 'stop') { manager.stop(); output({ stopped: true }); }
      else if (command.action === 'reload') {
        if (manager.job) throw new Error('Stop the current task first.');
        for (const id of Object.keys(require.cache)) if (id.startsWith(path.resolve(__dirname, '../app') + path.sep)) delete require.cache[id];
        ({ Manager } = require('../app/manager.cjs'));
        const next = new Manager(); next.browser = manager.browser; next.state = manager.state; next.pendingAccount = manager.pendingAccount;
        if (next.browser) {
          Object.setPrototypeOf(next.browser, require('../app/browser.cjs').Browser.prototype);
          next.browser.sources = null;
          await next.browser.evaluate('delete globalThis.ChatterDOM; true').catch(() => {});
        }
        manager = next; output({ reloaded: true });
      } else if (command.action === 'close') { await manager.disconnect(); output({ closed: true }); break; }
      else throw new Error('Unknown test command.');
    } catch (error) { output({ error: error.message }); }
  }
  await manager.disconnect();
})().catch(() => { output({ error: 'Live test failed.' }); process.exitCode = 1; });
