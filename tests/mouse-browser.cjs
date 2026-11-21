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
    <nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input id="hidden-answer" type="radio" name="answer">Ottawa</label></fieldset><button type="button" id="research" data-ref="aHR0cHM6Ly93d3cuY2FuYWRhLmNhLw==">Research</button><button type="button" id="submit">Submit Answer</button></form></main><button id="covered">Covered target</button><button id="motion-start" style="position:fixed;left:0;top:80px;width:28px;height:28px;padding:0;margin:0">1</button><button id="motion-end" style="position:fixed;left:0;bottom:0;width:28px;height:28px;padding:0;margin:0">2</button><div id="cover" hidden></div><pre id="events" hidden>[]</pre><script>
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

    browser.setMousePreferences({humanizedMouse:true});
    assert.equal(browser.mouse.humanized,true);assert.equal(browser.mouseOptions.humanized,true);
    browser.mouse.random=()=>.85;
    await browser.clickElement(()=>document.getElementById('motion-start'),null,{signal});
    const edgeStart={...browser.mouse.position};
    const eventOffset=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).length);
    await browser.clickElement(()=>document.getElementById('motion-end'),null,{signal});
    const edgeEvents=await browser.evaluate(offset=>JSON.parse(document.getElementById('events').textContent).slice(offset),eventOffset);
    const moves=edgeEvents.filter(e=>e.type==='mousemove');
    const viewport=await browser.evaluate(()=>({width:innerWidth,height:innerHeight}));
    assert.ok(moves.length>=12,'humanized motion dispatches a smooth path');
    assert.ok(edgeEvents.every(e=>e.trusted));
    assert.ok(moves.every(e=>e.x>=0&&e.x<viewport.width&&e.y>=0&&e.y<viewport.height),'curves remain inside the browser viewport');
    assert.ok(moves.some(e=>e.x===0),'edge-bound curves are safely clamped');
    assert.ok(moves.some(e=>Math.abs(e.x-edgeStart.x)>2),'the humanized route curves away from its vertical baseline');
    const press=edgeEvents.find(e=>e.type==='mousedown');
    assert.equal(press.target,'motion-end');assert.ok(Math.hypot(press.x-browser.mouse.position.x,press.y-browser.mouse.position.y)<=1);
    assert.ok(moves.at(-1).time-moves[0].time>=100,'humanized motion unfolds over time');

    const cancelController=new AbortController(),originalCommand=browser.command;
    let moveCommands=0;
    const cancelOffset=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).length);
    browser.command=async function(method,params){const result=await originalCommand.call(this,method,params);if(method==='Input.dispatchMouseEvent'&&params.type==='mouseMoved'&&++moveCommands===3)cancelController.abort(new DOMException('Stop','AbortError'));return result;};
    try{
      await assert.rejects(browser.clickElement(()=>document.getElementById('motion-start'),null,{signal:cancelController.signal}),{name:'AbortError'});
    }finally{browser.command=originalCommand;}
    const cancelledEvents=await browser.evaluate(offset=>JSON.parse(document.getElementById('events').textContent).slice(offset),cancelOffset);
    assert.ok(cancelledEvents.length>0);assert.ok(cancelledEvents.every(e=>e.type==='mousemove'),'Stop during humanized motion does not press a control');
    browser.mouse.durationScale=0;

    const before=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).filter(e=>e.type==='click').length);
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
    console.log('PASS fast/humanized trusted mouse motion, viewport-edge curves, exact target presses, movement cancellation, hidden-input labels, no duplicate selection, Research before cooldown, blocked-target protection, and mouse submission');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
