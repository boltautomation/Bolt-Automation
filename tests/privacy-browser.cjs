/* All test hostnames resolve to the local fixture; no requests go to real trackers. */
const http=require('node:http');
const assert=require('node:assert/strict');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs');
(async()=>{
  const strict=!process.argv.includes('--compatible');
  const requests=[],networkErrors=[];let port;
  const tracker=()=>`http://beacon.scorecardresearch.com:${port}/track`;
  const server=http.createServer((req,res)=>{
    requests.push({url:req.url,host:req.headers.host,cookie:req.headers.cookie||'',dnt:req.headers.dnt,gpc:req.headers['sec-gpc']});
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/third-first'||req.url==='/third-frame')return res.end('<main>Cookie fixture</main>');
    if(req.url==='/data')return res.end('essential data');
    if(req.url.startsWith('/track')){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','text/javascript');return res.end('globalThis.trackerLoaded=true;');}
    if(req.url==='/worker.js'){
      res.setHeader('Content-Type','text/javascript');
      return res.end(`fetch('${tracker()}?worker').then(()=>postMessage('loaded')).catch(()=>postMessage('blocked'));`);
    }
    if(req.url==='/popup')return res.end(`<script src="${tracker()}?popup-script"></script><main>Popup fixture</main><script>fetch('${tracker()}?popup-fetch').then(()=>document.body.dataset.result='loaded').catch(()=>document.body.dataset.result='blocked');</script>`);
    res.setHeader('Set-Cookie','first=keep; SameSite=Lax; Path=/');
    res.end(`<!doctype html><title>Privacy fixture</title><nav><a href="/sign_out">Log out</a></nav><main>
      <button id="popup" onclick="window.open('/popup','_blank')">Open research</button>
      <div id="cookie-consent" role="dialog"><p>This website uses cookies.</p><button id="accept" onclick="document.body.dataset.cookieChoice='accept'">Accept all</button><button id="reject" onclick="document.body.dataset.cookieChoice=event.isTrusted?'reject':'untrusted';this.parentElement.remove()">Reject all</button></div>
      <p id="result">Loading</p></main><iframe src="http://localhost:${port}/third-frame"></iframe>
      <script src="${tracker()}?script"></script><script>
        Promise.all([fetch('/data').then(r=>r.text()),fetch('${tracker()}?fetch').then(()=> 'loaded',()=> 'blocked'),new Promise(resolve=>{const w=new Worker('/worker.js');w.onmessage=e=>{resolve(e.data);w.terminate();};w.onerror=()=>resolve('worker failed');})]).then(results=>document.getElementById('result').textContent=JSON.stringify(results));
      </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
  const origin=`http://127.0.0.1:${port}`,third=`http://localhost:${port}`;
  const browser=new Browser({headless:true,strictPrivacy:strict,origins:[origin,third],mouseOptions:{durationScale:0},launchArgs:['--disable-features=HttpsUpgrades','--no-proxy-server','--host-resolver-rules=MAP *.scorecardresearch.com 127.0.0.1']});
  const signal=AbortSignal.timeout(45000);
  const until=async check=>{for(let n=0;n<120;n++){signal.throwIfAborted();if(await check())return;await wait(100);}throw new Error('Privacy fixture timed out');};
  try{
    await browser.launch(signal);
    browser.protocol.on('Network.loadingFailed',event=>networkErrors.push({error:event.errorText,reason:event.blockedReason,cors:event.corsErrorStatus}));
    assert.ok(/Chrome\//.test((await browser.protocol.send('Browser.getVersion')).product));
    await browser.command('Network.setCookie',{name:'third',value:'seed',url:third,secure:true,sameSite:'None'});
    await browser.navigate(third+'/third-first',signal);
    assert.ok(requests.find(r=>r.url==='/third-first')?.cookie.includes('third=seed'),'third-party cookie must first work in a first-party context');
    await browser.navigate(origin,signal);
    await until(async()=>await browser.evaluate(()=>document.getElementById('result').textContent!=='Loading'));
    assert.deepEqual(await browser.evaluate(()=>JSON.parse(document.getElementById('result').textContent)),['essential data',strict?'blocked':'loaded',strict?'blocked':'loaded'],JSON.stringify({requests,networkErrors}));
    await until(()=>requests.some(r=>r.url==='/third-frame'));
    assert.equal(requests.find(r=>r.url==='/third-frame').cookie.includes('third=seed'),!strict);
    assert.ok(requests.find(r=>r.url==='/data').cookie.includes('first=keep'));
    assert.equal(requests.find(r=>r.url==='/data').gpc,strict?'1':undefined);assert.equal(requests.find(r=>r.url==='/data').dnt,strict?'1':undefined);
    const permissions=await browser.evaluate(async()=>Object.fromEntries(await Promise.all(['geolocation','camera','microphone','notifications'].map(async name=>[name,(await navigator.permissions.query({name})).state]))));
    assert.ok(Object.values(permissions).every(state=>state===(strict?'denied':'prompt')),JSON.stringify(permissions));
    assert.equal(browser.child.spawnargs.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'),strict);
    await browser.rejectOptionalCookies(signal);
    assert.equal(await browser.evaluate(()=>document.body.dataset.cookieChoice),strict?'reject':undefined);
    const before=new Set((await browser.protocol.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
    await browser.clickElement(()=>document.getElementById('popup'),null,{signal});
    let target;
    await until(async()=>Boolean(target=(await browser.protocol.send('Target.getTargets')).targetInfos.find(t=>!before.has(t.targetId)&&t.url===origin+'/popup')));
    const {sessionId}=await browser.protocol.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    const popup=Object.assign(Object.create(Browser.prototype),{protocol:browser.protocol,sessionId,origins:[origin],privacy:browser.privacy});
    await until(async()=>await popup.evaluate(()=>document.body?.dataset.result)===(strict?'blocked':'loaded'));
    assert.equal(requests.some(r=>r.url.startsWith('/track')),!strict,'compatibility mode must allow scripts and fetches that strict mode blocks');
    browser.privacy.assert();
    console.log(strict?'PASS strict Chrome privacy: trackers and third-party cookies blocked, permissions denied, cookie prompts declined':'PASS compatible Chrome: scripts, worker and popup fetches work, first-party cookies work, default permission prompts restored, forced WebRTC restriction off, cookie prompts left to the user');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);if(error.cause)console.error(error.cause.message);process.exitCode=1;});
