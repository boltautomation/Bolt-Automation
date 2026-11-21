const fs = require('node:fs/promises');
const path = require('node:path');
const { Protocol, Browser } = require('../app/browser.cjs');
(async () => {
  const origin = 'http://127.0.0.1:43117';
  try {
    const html = await (await fetch(origin)).text(), token = html.match(/name="app-token" content="([^"]+)"/)?.[1];
    const state = await (await fetch(`${origin}/api/state`, { headers: { 'X-App-Token': token } })).json();
    console.log(JSON.stringify({ app: { connected: state.connected, busy: state.busy, phase: state.phase, moduleCount: state.modules.length, message: state.message } }));
  } catch {}
  const root = path.resolve('.app-runtime');
  for (const name of await fs.readdir(root).catch(() => [])) {
    if (!name.startsWith('browser-')) continue;
    let protocol;
    try {
      const [port, endpoint] = (await fs.readFile(path.join(root, name, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      protocol = await Protocol.connect(`ws://127.0.0.1:${port}${endpoint}`);
      const { targetInfos } = await protocol.send('Target.getTargets');
      for (const target of targetInfos.filter(target => target.type === 'page' && /^https:\/\/(www\.)?chatterhigh.com\//.test(target.url))) {
        const { sessionId } = await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        const browser = Object.assign(Object.create(Browser.prototype), { protocol, sessionId, targetId: target.targetId, contextId: target.browserContextId, origins: ['https://chatterhigh.com', 'https://www.chatterhigh.com'] });
        const info = await browser.info();
        const catalog = await browser.catalog(new AbortController().signal);
        console.log(JSON.stringify({ catalog: {count:catalog.length,examples:catalog.slice(0,3).map(({title,course,answered,total})=>({title,course,answered,total}))} }));
        console.log(JSON.stringify({ questionLayout: await browser.evaluate(()=>{
          const input=document.querySelector('input[type=radio]'), form=input?.closest('form');
          return {body:document.body.innerText.slice(0,4500),inputs:[...document.querySelectorAll('input[type=radio],input[type=checkbox]')].map(e=>({type:e.type,name:e.name,disabled:e.disabled,checked:e.checked,visible:!!e.getClientRects().length,labels:[...(e.labels||[])].map(l=>({text:l.innerText,visible:!!l.getClientRects().length})),parentClass:e.parentElement.className})),submit:[...document.querySelectorAll('a,button,input[type=submit]')].filter(e=>/^(submit|next question|continue)$/i.test((e.innerText||e.value||'').trim())).map(e=>({tag:e.tagName,className:e.className,disabled:e.disabled,text:e.innerText||e.value})),ancestors:form?[form,...(function*(e){for(let i=0;e&&i<4;i++,e=e.parentElement)yield e;})(form.parentElement)].map(e=>({tag:e.tagName,className:e.className,previous:[e.previousElementSibling,e.previousElementSibling?.previousElementSibling].filter(Boolean).map(p=>({tag:p.tagName,className:p.className,text:p.innerText?.slice(0,500)}))})):[]};
        }) }));
        if (process.argv.includes('--research')) {
          const scan = await browser.quiz({action:'scan',config:{}});
          if (scan.questions.length) {
            const sources = await browser.researchSources(scan.questions[0],new AbortController().signal);
            console.log(JSON.stringify({research: {prompt:scan.questions[0].prompt, sourceCount:sources.length, sources:sources.map(({url,title,text})=>({url,title,characters:text.length}))}}));
          }
        }
        const moduleLink = info.links.find(link => /^Modules$/i.test(link.text));
        if (moduleLink && process.argv.includes('--fragment')) {
          const { targetId } = await protocol.send('Target.createTarget', { url: moduleLink.url, browserContextId: target.browserContextId, background: true });
          try {
            const attachment = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
            const modulesBrowser = Object.assign(Object.create(Browser.prototype), { protocol, sessionId: attachment.sessionId, origins: browser.origins });
            for (let attempt=0; attempt<30; attempt++) {
              await new Promise(resolve=>setTimeout(resolve,250));
              try { if(await modulesBrowser.evaluate(()=>document.readyState==='complete')) break; } catch {}
            }
            const moduleInfo = await modulesBrowser.info();
            console.log(JSON.stringify({ moduleSample: await modulesBrowser.evaluate(async()=>{
              const control=document.querySelector('.drill-down-course[data-url]');
              const response=await fetch(new URL(control.dataset.url,location.href),{credentials:'same-origin'});
              const html=await response.text(), doc=new DOMParser().parseFromString(html,'text/html');
              for(const secret of doc.querySelectorAll('[name=authenticity_token],meta[name=csrf-token]'))secret.remove();
              return {status:response.status,type:response.headers.get('content-type'),text:doc.body.textContent.slice(0,6000),links:[...doc.querySelectorAll('a[href]')].map(a=>({text:a.textContent.trim(),href:a.getAttribute('href'),dataUrl:a.dataset.url})),sample:doc.body.innerHTML.slice(0,18000)};
            }) }));
          } finally { await protocol.send('Target.closeTarget', {targetId}); }
        }
      }
    } catch (error) { console.log(JSON.stringify({ inspection: error.message })); }
    finally { protocol?.socket.close(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
