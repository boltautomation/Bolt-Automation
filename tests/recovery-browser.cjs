// Trusted mouse recovery checks against a local fixture, never a live quiz.
const http=require('node:http');
const assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><style>
      body{font:18px system-ui;margin:30px}label{display:block;position:relative;padding:24px;margin:12px;width:500px;border:1px solid}
      input{position:absolute;width:1px;height:1px;clip:rect(0,0,0,0)}button{padding:20px}
      #cover{position:fixed;inset:0;z-index:1000;background:#3338}[hidden]{display:none!important}
      #partial{position:absolute;inset:0 35%;z-index:1;background:#3338}a{color:blue}
    </style><nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which city is the capital of Canada?</legend>
      <label><input id="toronto" type="radio" name="answer">Toronto</label>
      <label id="ottawa-label"><input id="ottawa" type="radio" name="answer">Ottawa<span id="partial"></span></label>
      </fieldset><button id="submit" type="button">Submit Answer</button></form></main>
      <button id="target">Target</button><div id="cover" hidden></div><div id="state" hidden data-submissions="0" data-clicks="0" data-other="0"></div>
      <script>
      const state=document.getElementById('state');
      document.addEventListener('click',e=>{if(!e.isTrusted)throw Error('Mouse must be trusted');if(e.target.id==='target')state.dataset.clicks=Number(state.dataset.clicks)+1;});
      document.getElementById('submit').onclick=()=>{state.dataset.submissions=Number(state.dataset.submissions)+1;document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';};
      </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,signal=AbortSignal.timeout(60000);
  const browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin],mouseOptions:{durationScale:0}});
  const scan=()=>browser.quiz({action:'scan',config:{}},signal);
  const state=()=>browser.evaluate(()=>({...document.getElementById('state').dataset}));
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);
    let page=await scan();
    const answers=[{id:'q0',optionIds:['o1']}];

    // A clipped input with a partially covered label still has a safe mouse point.
    await browser.evaluate(()=>{
      const partial=document.getElementById('partial');
      partial.innerHTML='<a href="#other" style="display:block;width:100%;height:100%">Other link</a>';
      partial.querySelector('a').onclick=e=>{e.preventDefault();document.getElementById('state').dataset.other='1';};
    });
    page=await scan();
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers,config:{}},signal);
    assert.equal(await browser.evaluate(()=>document.getElementById('ottawa').checked),true);
    assert.equal((await state()).other,'0','must avoid the nested link at the label center');

    // A temporary full-page blocker clears itself while the bot waits and retries.
    await browser.evaluate(()=>{document.getElementById('cover').hidden=false;setTimeout(()=>document.getElementById('cover').hidden=true,700);});
    assert.equal(await browser.clickElement(()=>document.getElementById('target'),null,{signal}),true);
    assert.equal((await state()).clicks,'1');

    // Layout changes during movement cause remeasurement, without duplicate clicks.
    let shifted=false;
    browser.mouse.durationScale=1;const sleep=browser.mouse.sleep;
    browser.mouse.sleep=async(ms,s)=>{
      if(!shifted){shifted=true;await browser.evaluate(()=>document.getElementById('target').style.marginLeft='300px');}
      await sleep(ms,s);
    };
    await browser.clickElement(()=>document.getElementById('target'),null,{signal});
    assert.equal((await state()).clicks,'2');

    // A framework can replace all input nodes with equivalent ones mid-movement.
    await browser.evaluate(()=>{document.getElementById('toronto').checked=true;document.getElementById('partial').remove();});
    page=await scan();
    let replaced=false;
    browser.mouse.sleep=async(ms,s)=>{
      if(!replaced){replaced=true;await browser.evaluate(()=>{const field=document.querySelector('fieldset');field.replaceWith(field.cloneNode(true));});}
      await sleep(ms,s);
    };
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers,config:{}},signal);
    assert.equal(await browser.evaluate(()=>document.getElementById('ottawa').checked),true);

    // Stop cancels recovery while a blocker is still present.
    browser.mouse.durationScale=0;browser.mouse.sleep=sleep;
    await browser.evaluate(()=>document.getElementById('cover').hidden=false);
    const stopped=new AbortController();const timer=setTimeout(()=>stopped.abort(new DOMException('Stop','AbortError')),150);
    try{await assert.rejects(browser.clickElement(()=>document.getElementById('target'),null,{signal:stopped.signal}),{name:'AbortError'});}finally{clearTimeout(timer);}
    assert.equal((await state()).clicks,'2');

    // Never reuse a solved answer if a new question appears during recovery.
    await browser.evaluate(()=>{
      document.getElementById('toronto').checked=true;
      setTimeout(()=>{document.querySelector('legend').textContent='Which city is the largest in Canada?';document.getElementById('cover').hidden=true;},100);
    });
    await assert.rejects(browser.quiz({action:'fill',fingerprint:page.fingerprint,answers,config:{}},signal),/quiz changed/i);
    assert.equal(await browser.evaluate(()=>document.getElementById('toronto').checked),true);
    assert.equal((await state()).submissions,'0');

    // The current question can still be answered and submitted exactly once.
    page=await scan();
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers,config:{}},signal);
    await browser.quiz({action:'submit',fingerprint:page.fingerprint,answers,config:{}},signal);
    assert.equal((await scan()).complete,true);assert.equal((await state()).submissions,'1');
    console.log('PASS clipped inputs, exposed label points, nested-link avoidance, temporary blockers, moving/rerendered controls, Stop during recovery, stale-question protection, and single submission');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
