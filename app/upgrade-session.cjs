// Apply an app update without asking the user to sign in again.
// Session cookies move directly between two local browser contexts in memory.
// Saved-profile data is protected with Windows DPAPI; plaintext secrets are
// never written to files, printed, or sent to another origin.
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { Browser, Protocol } = require('./browser.cjs');
const { Manager } = require('./manager.cjs');
const { createApp } = require('./server.cjs');
const origin = 'http://127.0.0.1:43117';
const runtime = path.resolve(__dirname, '../.app-runtime');
const report = value => fs.writeFile(path.join(runtime, 'upgrade-status.json'), JSON.stringify(value));
async function findSession() {
  for (const name of await fs.readdir(runtime)) {
    if (!name.startsWith('browser-')) continue;
    let protocol;
    try {
      const [port, endpoint] = (await fs.readFile(path.join(runtime, name, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      protocol = await Protocol.connect(`ws://127.0.0.1:${port}${endpoint}`);
      const { targetInfos } = await protocol.send('Target.getTargets');
      const target = targetInfos.find(target => target.type === 'page' && /^https:\/\/(www\.)?chatterhigh.com\/(en|fr)\/students\//.test(target.url));
      if (!target) continue;
      const { sessionId } = await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      const { cookies } = await protocol.send('Network.getCookies', { urls: ['https://chatterhigh.com/', 'https://www.chatterhigh.com/'] }, sessionId);
      const allowed = cookies.filter(cookie => ['chatterhigh.com', 'www.chatterhigh.com'].includes(cookie.domain.replace(/^\./, '')));
      if (allowed.length) return { url: target.url, cookies: allowed };
    } catch {}
    finally { protocol?.socket.close(); }
  }
  throw new Error('No signed-in automation session was found.');
}
(async () => {
  await fs.mkdir(runtime, { recursive: true }); await report({ phase: 'preparing' });
  let browser, app;
  try {
    const html = await (await fetch(origin)).text();
    const token = html.match(/name="app-token" content="([^"]+)"/)?.[1];
    if (!token) throw new Error('The app session could not be read.');
    const headers = { 'X-App-Token': token, 'Content-Type': 'application/json' };
    let state = await (await fetch(`${origin}/api/state`, { headers })).json();
    for(let attempt=0;state.busy&&attempt<90;attempt++){await report({phase:'waiting-for-current-run'});await wait(2000);state=await(await fetch(`${origin}/api/state`,{headers})).json();}
    if (state.busy) throw new Error('The update is ready. Finish or stop the current activity before applying it.');
    const manager = new Manager();
    if(process.argv.includes('--keep-expired')){
      const account=(await manager.accountStore.list()).find(account=>account.id===state.accountId);
      if(!account)throw new Error('No original saved account is available for the paused queue.');
      const email=state.account||account.email,progress=await manager.progressStore.get(email);
      browser=new Browser();await browser.launch(AbortSignal.timeout(30000));await browser.navigate('https://chatterhigh.com/en/users/sign_in',AbortSignal.timeout(20000));
      manager.browser=browser;
      for(const key of ['account','accountId','modules','modulesStatus','modulesError','selectedModuleIds','history','queue','queueIndex','activity','count','taskCount'])if(state[key]!==undefined)manager.state[key]=state[key];
      manager.state.account=email;
      if(!manager.state.modules.length)manager.state.modules=Object.values(progress.items).filter(item=>/^https?:/.test(item.id)).map(item=>({...item,url:item.id,completed:item.status==='completed'}));
      if(!manager.state.queue.length)manager.state.queue=progress.queue;
      if(!manager.state.history.length)manager.state.history=Object.values(progress.items);
      if(!manager.state.selectedModuleIds.length)manager.state.selectedModuleIds=progress.selected;
      if(process.argv.includes('--restore-selected')){
        manager.state.queue=progress.selected.map(id=>{
          const item=progress.items[id]||manager.state.modules.find(module=>module.id===id);
          if(!item)return null;
          return {id,title:item.title,course:item.course||'',answered:item.answered||0,total:item.total||null,status:item.status==='completed'?'completed':item.status==='needs-attention'?'needs-attention':'pending',...(item.error?{error:item.error}:{})};
        }).filter(Boolean);
      }
      manager.state.queue=manager.state.queue.map(item=>({...item,status:item.status==='running'?'paused':item.status}));
      manager.pausedTasks=manager.state.queue.filter(item=>item.status!=='completed').map(item=>({...item,...manager.state.modules.find(module=>module.id===item.id),mode:item.id.startsWith('daily:')?'daily':'modules',completed:false}));
      if(process.argv.includes('--restore-selected')&&manager.pausedTasks.length)manager.state.activity={...manager.pausedTasks[0],moduleId:manager.pausedTasks[0].id};
      manager.pendingAccount=email;manager.pendingRemember=true;
      manager.state.sessionStatus='expired';manager.state.phase='paused';manager.state.error=true;
      manager.state.message='ChatterHigh rejected the saved login. Update this account’s password in Accounts, or sign in in the browser. Your remaining queue is saved.';
      if(process.argv.includes('--account-disabled')){manager.state.sessionStatus='account-disabled';manager.state.message='This ChatterHigh account is disabled. Contact ChatterHigh to resolve it before signing in manually. Automatic retries are stopped; your remaining queue is saved.';}
      await manager.progressStore.queue(email,manager.state.queue);
    }else if (state.connected||state.accountId) {
      const saved = await findSession().catch(()=>null);
      let restored=false;
      if(saved){
      browser = new Browser(); await browser.launch(AbortSignal.timeout(30000));
      const cookies = saved.cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
        secure: cookie.secure, httpOnly: cookie.httpOnly, ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}), ...(cookie.expires > 0 ? { expires: cookie.expires } : {}) }));
      await browser.command('Network.setCookies', { cookies });
      // Release references before starting the replacement server.
      cookies.length = 0; saved.cookies.length = 0;
      await browser.navigate(saved.url, AbortSignal.timeout(20000));
      restored=browser.authenticated(await browser.info());
      }
      if(!restored){
        if(browser)await browser.close();
        if(!state.accountId)throw new Error('The expired session needs a saved login. The original app and queue were left open.');
        manager.connect({accountId:state.accountId,mode:'modules'});await manager.job;browser=manager.browser;
        if(!manager.snapshot().connected)throw new Error(`The saved login could not reconnect: ${manager.state.message} The original app and queue were left open.`);
      }else{
      manager.browser = browser; manager.state.account = state.account;manager.state.accountId=state.accountId||'';
      await manager.persistAccount(undefined,true);
      await manager.loadModules(AbortSignal.timeout(30000));
      }
      if (manager.state.modulesStatus !== 'loaded') throw new Error('The replacement module list could not be verified; the original app was left open.');
      const selectedModule = manager.state.modules.find(module => module.url.split('?')[0] === saved?.url.split('?')[0]);
      manager.state.activity = state.activity || (selectedModule ? { mode: 'modules', moduleId: selectedModule.id, title: selectedModule.title, total: selectedModule.total } : { mode: 'daily', moduleId: '', title: 'Daily Quiz' });
      manager.state.phase = 'paused'; manager.state.message = 'Updated and signed in. Continue your current activity, or choose another.';
      const page = await browser.quiz({action:'scan',config:{}});
      if(page.complete){manager.state.phase='complete';manager.state.message='Selected activity completed.';}
    }
    await report({ phase: 'verified', modules: manager.state.modules.length });
    // Only retire the old session after the replacement login and catalog work.
    const latest = await (await fetch(`${origin}/api/state`, { headers })).json();
    if (latest.busy) throw new Error('An activity started during the update. The original app was left running.');
    if(latest.accountId!==state.accountId||latest.account!==state.account)throw new Error('The active account changed during the update. The original app was left running.');
    await fetch(`${origin}/api/shutdown`, { method: 'POST', headers, body: '{}' });
    for (let attempt = 0; attempt < 150; attempt++) {
      try { await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) }); }
      catch { break; }
      await wait(100);
    }
    // Refresh the verified replacement session after the retiring process exits.
    if(manager.state.sessionStatus!=='account-disabled')await manager.persistQuietly();
    app = await createApp({ manager, port: 43117, open: true });
    const close = () => app.close().then(() => process.exit(0));
    process.once('SIGINT', close); process.once('SIGTERM', close);
    await report({ phase: 'ready', connected: manager.snapshot().connected, modules: manager.state.modules.length });
  } catch (error) {
    if (browser && !app) await browser.close();
    await report({ phase: 'error', message: error.message }); process.exitCode = 1;
  }
})().catch(() => { process.exitCode = 1; });
