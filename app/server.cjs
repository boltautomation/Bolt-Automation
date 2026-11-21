const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Manager } = require('./manager.cjs');
const { findBrowser } = require('./browser.cjs');
const { listModels } = require('./ollama.cjs');
const {screenBounds}=require('./window.cjs');
const {StudyService}=require('./study.cjs');
const {ResearchPrivacy}=require('./research-privacy.cjs');
const PUBLIC = path.join(__dirname, 'public');
function error(message, status) { return Object.assign(new Error(message), { status }); }
async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw error('Expected JSON.', 415);
  let raw = ''; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length; if (bytes > 32768) throw error('Request too large.', 413);
    raw += chunk;
  }
  try { return JSON.parse(raw); } catch { throw error('Invalid JSON.', 400); }
}
function openWindow(url) {
  // This is the visible, interactive app window requested by the user.
  const profile=path.resolve(__dirname,'../.app-runtime/ui');
  const bounds=screenBounds();
  const child = spawn(findBrowser(), [`--app=${url}`, `--user-data-dir=${profile}`, `--window-size=${bounds.width},${bounds.height}`, `--window-position=${bounds.left},${bounds.top}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {}); child.unref();
}
async function createApp({ manager = new Manager(), study=new StudyService(), privacy=new ResearchPrivacy(), port = 43117, open = false } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  let origin;
  const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
  const staticFiles = {
    '/': ['index.html', 'text/html; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'],
    '/client.js': ['client.js', 'text/javascript; charset=utf-8'], '/study.js': ['study.js', 'text/javascript; charset=utf-8'], '/core.js': ['../../extension/core.js', 'text/javascript; charset=utf-8'],
    '/assets/bolt.png': ['assets/bolt-transparent.png', 'image/png']
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (request.headers.host !== new URL(origin).host) throw error('Invalid host.', 403);
      if (request.headers.origin && request.headers.origin !== origin) throw error('Invalid origin.', 403);
      const route = new URL(request.url, origin).pathname;
      if (request.method === 'GET' && route === '/health') return json(response, 200, { app: 'chatterhigh-local-app', version: 13 });
      if (request.method === 'GET' && staticFiles[route]) {
        const [file, type] = staticFiles[route];
        let content = await fs.readFile(path.resolve(PUBLIC, file));
        if (route === '/') content = content.toString('utf8').replace('__APP_TOKEN__', token).replace('__STUDY_PANEL__',await fs.readFile(path.join(PUBLIC,'study-panel.html'),'utf8')).replaceAll('https://ollama.com/download/windows',process.platform==='darwin'?'https://ollama.com/download/mac':'https://ollama.com/download/windows').replaceAll('Saved passwords and sessions are encrypted for your Windows sign-in.',process.platform==='darwin'?'Saved passwords and sessions are encrypted with a key in your macOS login Keychain.':'Saved passwords and sessions are encrypted for your Windows sign-in.').replaceAll('on this PC','on this computer').replaceAll('Your Windows pointer stays free.','Your system pointer stays free.');
        response.writeHead(200, { 'Content-Type': type }); response.end(content); return;
      }
      const provided = request.headers['x-app-token'];
      if (typeof provided !== 'string' || Buffer.byteLength(provided) !== Buffer.byteLength(token) || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))) throw error('Invalid app session. Reload the app.', 403);
      if (request.method === 'GET' && route === '/api/state') {
        let accounts=[],accountsError='';try{accounts=await manager.accountStore.list();}catch{accountsError='Saved accounts could not be loaded. Re-add the affected account.';}
        return json(response,200,{...manager.snapshot(),accounts,accountsError});
      }
      if(request.method==='GET'&&route==='/api/study/state')return json(response,200,await study.state());
      if(request.method==='GET'&&route==='/api/study/research/state')return json(response,200,privacy.snapshot());
      if(request.method==='POST'&&route==='/api/study/import'){
        if(!/^application\/pdf(?:;|$)/i.test(request.headers['content-type']||''))throw error('Choose a PDF file.',415);
        let size=0;const parts=[];for await(const part of request){size+=part.length;if(size>8*1024*1024)throw error('PDF files must be 8 MB or smaller.',413);parts.push(part);}
        return json(response,200,await study.importPdf(Buffer.concat(parts),new URL(request.url,origin).searchParams.get('name')));
      }
      if (request.method !== 'POST') throw error('Not found.', 404);
      const data = await body(request);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('Expected an object.', 400);
      if(route==='/api/study/search')return json(response,200,await study.search(data));
      if(route==='/api/study/ask')return json(response,200,await study.ask(data));
      if(route==='/api/study/verify')return json(response,200,await study.verify(data));
      if(route==='/api/study/answer')return json(response,200,await study.answer(data.id));
      if(route==='/api/study/documents/remove'){await study.removeDocument(data.id);return json(response,200,{ok:true});}
      if(route==='/api/study/answers/remove'){await study.removeAnswer(data.id);return json(response,200,{ok:true});}
      if(route==='/api/study/cancel'){study.cancel();return json(response,200,{ok:true});}
      if(route==='/api/study/research/open')return json(response,200,await privacy.open(data.url,data.rejectCookies));
      if(route==='/api/study/research/close'){await privacy.close();return json(response,200,{ok:true});}
      if (route === '/api/ollama') return json(response, 200, { models: await listModels(data.url) });
      if (route === '/api/pull') { manager.pull(data); return json(response, 202, { ok: true }); }
      if (route === '/api/accounts/save-current') { manager.saveCurrent(data); return json(response,202,{ok:true}); }
      if (route === '/api/accounts/remove') { await manager.removeAccount(data.id); return json(response,200,{ok:true}); }
      if (route === '/api/modules/selection') { if(!Array.isArray(data.ids))throw error('Expected module IDs.',400);await manager.saveSelection(data.ids);return json(response,200,{ok:true}); }
      if (route === '/api/connect') manager.connect(data);
      else if (route === '/api/run') manager.run(data);
      else if (route === '/api/modules') manager.refreshModules();
      else if (route === '/api/verify-login') manager.confirmLogin(data);
      else if (route === '/api/stop') manager.stop();
      else if (route === '/api/disconnect') await manager.disconnect();
      else if (route === '/api/show-browser') {
        if (!manager.browser) throw error('Sign in to open the automation browser.', 400);
        await manager.browser.show();
      } else if (route === '/api/shutdown') {
        json(response, 200, { ok: true });
        setImmediate(async () => { study.cancel();await privacy.close();await manager.disconnect(); server.close(); }); return;
      } else throw error('Not found.', 404);
      json(response, 202, { ok: true });
    } catch (err) {
      if (!response.headersSent) json(response, err.status || 400, { error: err.message || 'The operation failed.' });
      else response.end();
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  if (open) openWindow(origin);
  return { server, manager, study, privacy, origin, token, close: async () => { study.cancel();await privacy.close();await manager.disconnect(); await new Promise(resolve => server.close(resolve)); } };
}
if (require.main === module) {
  const port = Number(process.env.BOLT_PORT || process.env.CHATTERHIGH_PORT || 43117);
  createApp({ port, open: process.argv.includes('--open') }).then(app => {
    console.log(`Bolt: ${app.origin}`);
    const close = () => app.close().then(() => process.exit(0));
    process.once('SIGINT', close); process.once('SIGTERM', close);
  }).catch(async err => {
    if (err.code === 'EADDRINUSE') {
      try {
        const origin = `http://127.0.0.1:${port}`;
        const health = await (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) })).json();
        if (health.app === 'chatterhigh-local-app') { if (process.argv.includes('--open')) openWindow(origin); return; }
      } catch {}
    }
    console.error(`Could not start Bolt: ${err.message}`); process.exitCode = 1;
  });
}
module.exports = { createApp };
