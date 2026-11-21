/* Browser mouse checks use a local fixture, never a real account or quiz. */
const http=require('node:http');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/research')return res.end('<main><h1>Research fixture</h1><p>A local test source.</p></main>');
    res.end(`<!doctype html><title>Browser mouse test</title><style>body{font:18px system-ui;margin:0;background:#202225;color:#eee}nav{padding:16px}a{color:#afd}main{margin:300px auto 40px;padding:26px;width:560px;background:#2b2e32;border-radius:12px}label{display:block;padding:16px;margin:10px;border:1px solid #555;border-radius:8px;cursor:pointer}label:has(:checked){background:#365447}button{padding:14px;margin:12px;font:inherit}#hidden-answer{display:none}</style>
    <nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input id="hidden-answer" type="radio" name="answer">Ottawa</label></fieldset><button type="button" id="research" data-ref="aHR0cHM6Ly93d3cuY2FuYWRhLmNhLw==">Research</button><button type="button" id="submit">Submit Answer</button></form></main><button id="covered">Covered target</button><div id="cover" hidden></div><pre id="events" hidden>[]</pre><script>
    const log=document.getElementById('events');for(const type of ['mousemove','mousedown','mouseup','click'])document.addEventListener(type,e=>{const events=JSON.parse(log.textContent);events.push({type,trusted:e.isTrusted,x:e.clientX,y:e.clientY,time:e.timeStamp,target:e.target.id});log.textContent=JSON.stringify(events.slice(-300));if(type==='click'&&!e.isTrusted)e.preventDefault();},true);
    document.getElementById('research').onclick=e=>{if(e.isTrusted)window.open('/research','_blank');};
    document.getElementById('submit').onclick=e=>{if(e.isTrusted&&document.getElementById('hidden-answer').checked)document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';};
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=new Browser({headless:true,origins:[origin]});
  const signal=AbortSignal.timeout(45000);
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);
    const page=await browser.quiz({action:'scan',config:{}},signal);
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers:[{id:'q0',optionIds:['o1']}],config:{}},signal);
    assert.equal(await browser.evaluate(()=>document.getElementById('hidden-answer').checked),true);
    const events=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent));
    assert.ok(events.filter(e=>e.type==='mousemove').length>=8);assert.ok(events.every(e=>e.trusted));
    assert.ok(events.at(-1).time-events[0].time>=100,'movement should occur over time');
    assert.equal(await browser.evaluate(()=>getComputedStyle(document.querySelector('[data-bolt-cursor]')).pointerEvents),'none');
    assert.equal(await browser.evaluate(()=>document.querySelector('[data-bolt-cursor]').getAttribute('aria-hidden')),'true');
    await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/browser-mouse.png',await browser.screenshot());
    browser.mouse.durationScale=0;

    const before=events.filter(e=>e.type==='click').length;
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers:[{id:'q0',optionIds:['o1']}],config:{}},signal);
    assert.equal(await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).filter(e=>e.type==='click').length),before);

    const targetsBefore=new Set((await browser.protocol.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
    let opened=false;
    const researchController=new AbortController();
    await assert.rejects(browser.researchSources(page.questions[0],researchController.signal,{onOpened:async()=>{
      const tab=(await browser.protocol.send('Target.getTargets')).targetInfos.find(t=>!targetsBefore.has(t.targetId)&&t.url===origin+'/research');
      assert.ok(tab,'a trusted Research click must open the source tab before cooldown');opened=true;researchController.abort(new DOMException('Stop','AbortError'));
    }}),{name:'AbortError'});
    assert.equal(opened,true);
    assert.ok(!(await browser.protocol.send('Target.getTargets')).targetInfos.some(t=>t.url===origin+'/research'));

    await assert.rejects(browser.clickElement(()=>document.getElementById('covered'),null,{signal,beforePress:()=>browser.evaluate(()=>{
      const cover=document.getElementById('cover');cover.hidden=false;cover.style.cssText='position:fixed;inset:0;z-index:99999;background:#0006';
    })}),/covered/);
    await browser.evaluate(()=>document.getElementById('cover').hidden=true);
    assert.equal(await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).some(e=>e.type==='click'&&e.target==='covered')),false);

    await browser.quiz({action:'submit',fingerprint:page.fingerprint,answers:[{id:'q0',optionIds:['o1']}],config:{}},signal);
    assert.equal((await browser.quiz({action:'scan',config:{}},signal)).complete,true);
    assert.ok((await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent))).every(e=>e.trusted));
    console.log('PASS visible curved cursor, trusted mouse events, hidden-input label selection, no duplicate selection, Research before cooldown, blocked-target protection, and mouse submission');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
