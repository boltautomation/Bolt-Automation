const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
require('../extension/core.js');require('../extension/runner.js');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/research')return res.end('<h1>Local research source</h1>');
    const kind=new URL(req.url,'http://localhost').searchParams.get('case');
    const custom=['delayed','stuck'].includes(kind);
    const choices=custom?'<button type="button" role="radio" aria-checked="false" id="a">First</button><button type="button" role="radio" aria-checked="false" id="b">Second</button>':'<label><input id="a" type="radio" name="answer">First</label><label><input id="b" type="radio" name="answer">Second</label>';
    const submit=kind==='native'?'<button type="button" id="submit" disabled>Submit Answer</button>':`<a href="#" id="submit" class="${['repair','stale','stop'].includes(kind)?'disabled':''}">Submit Answer</a>`;
    res.end(`<!doctype html><style>body{font:18px system-ui;margin:30px}label,button,a{display:block;padding:16px;margin:10px}.disabled{pointer-events:none}</style><nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which answer is correct?</legend>${choices}</fieldset><button type="button" id="research" data-ref="aHR0cHM6Ly93d3cuY2FuYWRhLmNhLw==">Research</button>${submit}</form></main><div id="state" hidden data-choice-clicks="0" data-research="0" data-submits="0"></div><script>
      const kind=${JSON.stringify(kind)},state=document.getElementById('state');
      document.addEventListener('change',()=>{if(kind==='native')setTimeout(()=>document.getElementById('submit').disabled=false,600);});
      document.addEventListener('click',e=>{
        if(!e.isTrusted)return;
        if(e.target.matches('[role=radio]')){state.dataset.choiceClicks=Number(state.dataset.choiceClicks)+1;if(kind!=='stuck')setTimeout(()=>{document.querySelectorAll('[role=radio]').forEach(r=>r.setAttribute('aria-checked',r===e.target?'true':'false'));},250);}
        if(e.target.id==='research'){state.dataset.research=Number(state.dataset.research)+1;document.querySelectorAll('input[type=radio]').forEach(i=>i.checked=false);if(kind==='stale')document.querySelector('legend').textContent='A different question has loaded.';document.getElementById('submit').className='';window.open('/research','_blank');}
        if(e.target.id==='submit'){e.preventDefault();state.dataset.submits=Number(state.dataset.submits)+1;document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';}
      });
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,signal=AbortSignal.timeout(60000);
  const browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin],mouseOptions:{durationScale:0}});
  const open=async kind=>{await browser.navigate(origin+'/?case='+kind,signal);return browser.quiz({action:'scan',config:{}},signal);};
  const answers=[{id:'q0',optionIds:['o1']}];
  const state=()=>browser.evaluate(()=>({...document.getElementById('state').dataset}));
  const message=(page,action)=>({action,fingerprint:page.fingerprint,answers,config:{}});
  try{
    await browser.launch(signal);
    let page=await open('delayed');
    await browser.quiz(message(page,'fill'),signal);
    assert.equal((await state()).choiceClicks,'1','wait for the custom control to register, without clicking it twice');
    assert.equal(await browser.evaluate(()=>document.getElementById('b').getAttribute('aria-checked')),'true');
    await browser.quiz(message(page,'submit'),signal);assert.equal((await state()).submits,'1');

    page=await open('native');
    await browser.quiz(message(page,'fill'),signal);
    await browser.quiz(message(page,'submit'),signal);
    assert.equal((await state()).submits,'1');assert.equal((await state()).research,'0','a brief readiness delay does not repeat Research unnecessarily');

    page=await open('stuck');
    await assert.rejects(browser.quiz(message(page,'fill'),signal),e=>e.code==='ANSWER_SELECTION_STALLED');
    assert.equal((await state()).choiceClicks,'1');assert.equal((await state()).submits,'0');

    page=await open('repair');
    await browser.quiz(message(page,'fill'),signal);
    // Simulate a remembered visit that the page/server did not acknowledge.
    browser.researchVisits=new Set([browser.researchVisitKey(page.questions[0])]);
    const repairs=[];
    await browser.quiz(message(page,'submit'),signal,code=>repairs.push(code));
    assert.ok(repairs.includes('RESEARCH_RECHECK'));assert.equal((await state()).research,'1');assert.equal((await state()).submits,'1');

    page=await open('stale');
    await browser.quiz(message(page,'fill'),signal);
    await assert.rejects(browser.quiz(message(page,'submit'),signal),/quiz changed/i);assert.equal((await state()).submits,'0');

    page=await open('stop');
    await browser.quiz(message(page,'fill'),signal);
    const stopped=new AbortController();
    await assert.rejects(browser.quiz(message(page,'submit'),stopped.signal,()=>stopped.abort(new DOMException('Stop','AbortError'))),{name:'AbortError'});
    assert.equal((await state()).research,'0');assert.equal((await state()).submits,'0');

    await open('receipt');const command=browser.command.bind(browser);let interrupted=false;
    browser.command=async(method,params)=>{
      const result=await command(method,params);
      if(!interrupted&&method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&(await state()).submits==='1'){interrupted=true;throw Error('Reply interrupted after accepted Submit');}
      return result;
    };
    const runner=new globalThis.ChatterRunner({transport:m=>browser.quiz(m,signal),sleep:async()=>{},solve:async()=>({optionIds:['o1'],confidence:1,personal:false,sources:[{url:'https://www.canada.ca/'}]})});
    assert.equal((await runner.run(globalThis.ChatterCore.settings(),signal)).reason,'complete');assert.equal(interrupted,true);assert.equal((await state()).submits,'1');
    assert.equal((await browser.protocol.send('Target.getTargets')).targetInfos.filter(t=>t.openerId===browser.targetId).length,0);
    console.log('PASS delayed choice confirmation, bounded stuck-choice failure, forced Research recheck and answer restoration, stale-question and Stop protection, interrupted accepted Submit without duplicates, and source-tab cleanup');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
