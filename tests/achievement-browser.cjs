// Local reproduction of ChatterHigh's .unseen-badge / .exit achievement overlay.
const http=require('node:http');
const assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
(async()=>{
  const seen=[];
  const server=http.createServer((req,res)=>{
    if(/\/student_badges\/\d+\/seen$/.test(req.url)){seen.push(req.url);return res.end('seen');}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><style>body{font:16px system-ui;margin:30px}.unseen-badges,.other-dialog{position:fixed;inset:0;background:#0008;z-index:1000}.unseen-badge{position:absolute;top:100px;left:100px;width:450px;height:170px;padding:25px;background:linear-gradient(#333,#111);color:white}.header{text-align:center;font-weight:bold}.exit{position:absolute;right:12px;top:12px;width:26px;height:26px;border:2px solid #aaa;cursor:pointer}.exit:after{content:'×';font-size:24px;line-height:24px}.zbadge{position:absolute;top:15px;left:10px}.badge-large-researcher{background:#83b83f;border-radius:50%;padding:12px}[hidden]{display:none!important}label,button{display:block;padding:12px;margin:12px}#other-close{position:absolute;right:10px;top:10px}</style>
    <nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input type="radio" name="answer">Ottawa</label></fieldset><button id="submit" type="button">Submit Answer</button></form></main><button id="target" type="button">Other target</button><div id="test-state" hidden data-submissions="0" data-trusted-closes="0"></div>
    <script>
    const state=document.getElementById('test-state');
    window.addBadge=id=>{
      let root=document.querySelector('.unseen-badges');if(!root){root=document.createElement('div');root.className='unseen-badges';document.body.append(root);}root.hidden=false;
      const badge=document.createElement('div');badge.className='unseen-badge';badge.dataset.link='/en/students/1/student_badges/'+id+'/seen';badge.innerHTML='<div class="header">Level 1 Researcher!</div><div>Your power to make change has increased! Nice</div><div class="exit"></div><div class="zbadge"><span class="badge-large-researcher">1</span></div>';root.append(badge);
      badge.querySelector('.exit').onclick=event=>{if(!event.isTrusted)throw Error('Must use a trusted mouse click');state.dataset.trustedCloses=Number(state.dataset.trustedCloses)+1;badge.classList.add('seen');fetch(badge.dataset.link);setTimeout(()=>{badge.hidden=true;if(!root.querySelector('.unseen-badge:not(.seen)'))root.hidden=true;},150);};
    };
    document.getElementById('submit').addEventListener('mousedown',()=>{if(!state.dataset.pressPopup){state.dataset.pressPopup='yes';addBadge(4);}});
    document.getElementById('submit').onclick=()=>{if(document.querySelectorAll('input')[1].checked){state.dataset.submissions=Number(state.dataset.submissions)+1;document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';}};
    addBadge(1);addBadge(2);
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=new Browser({headless:true,origins:[origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(45000);
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);
    const page=await browser.quiz({action:'scan',config:{}},signal);
    assert.equal(page.questions.length,1);assert.equal(seen.length,2);
    assert.equal(await browser.evaluate(()=>document.getElementById('test-state').dataset.trustedCloses),'2');

    let injected=false;const originalSleep=browser.mouse.sleep;
    browser.mouse.durationScale=1;
    browser.mouse.sleep=async(ms,s)=>{if(!injected){injected=true;await browser.command('Runtime.evaluate',{expression:'window.addBadge(3)'});}await originalSleep(ms,s);};
    const answers=[{id:'q0',optionIds:['o1']}];
    await browser.quiz({action:'fill',fingerprint:page.fingerprint,answers,config:{}},signal);
    assert.equal(await browser.evaluate(()=>document.querySelectorAll('input')[1].checked),true);
    assert.ok(seen.some(url=>url.endsWith('/3/seen')));
    browser.mouse.sleep=originalSleep;

    await browser.quiz({action:'submit',fingerprint:page.fingerprint,answers,config:{}},signal);
    assert.equal((await browser.quiz({action:'scan',config:{}},signal)).complete,true);
    assert.equal(await browser.evaluate(()=>document.getElementById('test-state').dataset.submissions),'1');
    assert.ok(seen.some(url=>url.endsWith('/4/seen')));

    browser.mouse.durationScale=0;
    await browser.evaluate(()=>{const dialog=document.createElement('div');dialog.className='other-dialog';dialog.setAttribute('role','dialog');dialog.innerHTML='<p>Confirm your account settings</p><button id="other-close">×</button>';dialog.querySelector('button').onclick=()=>document.getElementById('test-state').dataset.otherClosed='yes';document.body.append(dialog);});
    await assert.rejects(browser.clickElement(()=>document.getElementById('target'),null,{signal}),/covered/);
    assert.equal(await browser.evaluate(()=>document.getElementById('test-state').dataset.otherClosed),undefined);
    await browser.evaluate(()=>document.querySelector('.other-dialog').remove());

    await browser.command('Runtime.evaluate',{expression:'window.addBadge(5)'});
    const stopped=new AbortController();browser.mouse.durationScale=1;browser.mouse.sleep=async()=>stopped.abort(new DOMException('Stop','AbortError'));
    await assert.rejects(browser.dismissAchievementPopups(stopped.signal),{name:'AbortError'});
    assert.ok(!seen.some(url=>url.endsWith('/5/seen')));
    assert.equal(new Set(seen).size,4);
    console.log('PASS stacked achievement popups close via trusted mouse clicks and seen requests; late popups during movement/press recover without duplicate submission; unrelated dialogs and Stop are respected');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
