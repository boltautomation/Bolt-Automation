const fs = require('node:fs/promises');
const { Browser } = require('../app/browser.cjs');
const { setTimeout: wait } = require('node:timers/promises');
(async () => {
  const origin = 'http://127.0.0.1:43117';
  const browser = new Browser({ headless: true, origins: [origin] });
  try {
    await browser.launch(new AbortController().signal); await browser.navigate(origin, new AbortController().signal); await wait(800);
    const status = await browser.evaluate(() => ({ model: document.getElementById('model').value, connection: document.getElementById('ollama-status').textContent }));
    if (!status.connection.includes('connected')) throw new Error(status.connection);
    const catalog = await browser.evaluate(() => {
      document.querySelector('input[value=modules]').click();
      return { count: document.getElementById('module').options.length - 1, placeholder: document.getElementById('module').options[0].textContent, dark: getComputedStyle(document.documentElement).colorScheme };
    });
    if (catalog.dark !== 'dark') throw new Error('Dark theme is not applied.');
    if (catalog.count && /sign in/i.test(catalog.placeholder)) throw new Error('Signed-in catalog shows a sign-in placeholder.');
    await fs.mkdir('test-results', { recursive: true }); await fs.writeFile('test-results/app-ready.png', await browser.screenshot());
    await browser.command('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
    await fs.writeFile('test-results/app-mobile.png', await browser.screenshot());
    console.log(`PASS running dark app is connected to ${status.model}, shows ${catalog.count} modules, and has correct signed-in text; desktop and mobile layouts captured`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
