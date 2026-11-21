const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const dashboard = process.argv.includes('--dashboard');
let fixture = 'tests/browser-fixture.html';
if (dashboard) {
  fs.mkdirSync('test-results', { recursive: true });
  const html = fs.readFileSync('extension/dashboard.html', 'utf8')
    .replaceAll('href="dashboard.css"', 'href="../extension/dashboard.css"')
    .replaceAll('src="', 'src="../extension/')
    .replace('<script src="../extension/core.js">', '<script src="../tests/dashboard-harness.js"></script><script src="../extension/core.js">')
    .replace('</body>', '<script src="../tests/dashboard-tests.js"></script></body>');
  fixture = 'test-results/dashboard.html'; fs.writeFileSync(fixture, html);
}
const browser = process.env.CHATTERHIGH_TEST_BROWSER || require('../app/browser.cjs').findBrowser();
const result = spawnSync(browser, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${resolve('.browser-test-profile')}`,
  '--virtual-time-budget=5000', '--window-size=1400,1100',
  ...(dashboard ? [`--screenshot=${resolve('test-results/dashboard.png')}`] : []),
  '--dump-dom', pathToFileURL(resolve(fixture)).href
], { encoding: 'utf8', timeout: 30000, windowsHide: true });
const match = result.stdout?.match(/<pre id="results"[^>]*>([\s\S]*?)<\/pre>/);
if (match) console.log(match[1]);
if (result.error || !result.stdout?.includes('data-test-result="PASS"')) {
  console.error(result.error?.message || `Browser tests failed (exit ${result.status}).`);
  if (!match) console.error(result.stderr?.slice(0, 1500));
  process.exitCode = 1;
}
