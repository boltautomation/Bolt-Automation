const fs = require('node:fs/promises');
const path = require('node:path');
const { Protocol } = require('../app/browser.cjs');
(async () => {
  const root = path.resolve('.app-runtime');
  for (const name of await fs.readdir(root).catch(() => [])) {
    if (!name.startsWith('browser-')) continue;
    const profile = path.resolve(root, name); if (path.dirname(profile) !== root) throw new Error('Invalid test profile path');
    try {
      const [port, endpoint] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      const protocol = await Protocol.connect(`ws://127.0.0.1:${port}${endpoint}`);
      await protocol.send('Browser.close').catch(() => {}); protocol.socket.close();
    } catch {}
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
