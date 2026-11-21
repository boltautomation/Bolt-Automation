// A controlled timing fixture: real mouse clicks and a simulated 300ms model.
const http=require('node:http'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs');
require('../extension/core.js');require('../extension/runner.js');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/research')return res.end('<h1>Local research</h1>');
    const survey='<form><fieldset><legend>Have you heard of this organization before?</legend><label><input type="radio" name="aware">Yes</label><label><input type="radio" name="aware">No</label></fieldset><fieldset><legend>How interesting is this career to you?</legend><label><input type="radio" name="interest">4 - Very Interesting</label><label><input type="radio" name="interest">1 - Not Interesting</label></fieldset><button id="next" type="button">Next Question</button></form>';
    res.end(`<!doctype html><style>body{font:18px system-ui;margin:30px}label,button{display:block;padding:12px;margin:8px}</style><nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input type="radio" name="answer">Ottawa</label></fieldset><button id="research" type="button" data-ref="aHR0cHM6Ly93d3cuY2FuYWRhLmNhLw==">Research</button><button id="submit" type="button">Submit Answer</button></form></main><div id="state" hidden data-submits="0" data-nexts="0"></div><script>
    const state=document.getElementById('state');document.addEventListener('click',e=>{if(!e.isTrusted)return;if(e.target.id==='research'){state.dataset.researchAt=performance.now();window.open('/research','_blank');}if(e.target.matches('input[name=answer]'))state.dataset.answerAt=performance.now();if(e.target.id==='submit'){state.dataset.submits=Number(state.dataset.submits)+1;document.querySelector('main').innerHTML=${JSON.stringify(survey)};}if(e.target.id==='next'){state.dataset.nexts=Number(state.dataset.nexts)+1;document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';}},true);</script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin]});
  const signal=AbortSignal.timeout(45000),timings=[];
  try{
    await browser.launch(signal);
    for(const delayMs of [0,1000]){
      await browser.navigate(origin,signal);
      let modelCalls=0;
      const runner=new globalThis.ChatterRunner({transport:m=>browser.quiz(m,signal),solve:async(q,s,onEvidence,repair,onOpened)=>{
        modelCalls++;await browser.prepareResearch(q,s,onOpened);await wait(300,undefined,{signal:s});
        return {optionIds:['o1'],confidence:1,personal:false,sources:[{url:'https://www.canada.ca/'}]};
      }});
      const started=performance.now(),result=await runner.run(globalThis.ChatterCore.settings({finishActivity:true,answerDelayMs:delayMs}),signal);
      const state=await browser.evaluate(()=>({...document.getElementById('state').dataset}));
      assert.equal(result.reason,'complete');assert.equal(modelCalls,1);assert.equal(state.submits,'1');assert.equal(state.nexts,'1');
      assert.ok(Number(state.answerAt)-Number(state.researchAt)>=delayMs-5,'never answer before the configured research delay');
      timings.push({delayMs,elapsedMs:Math.round(performance.now()-started),researchToAnswerMs:Math.round(Number(state.answerAt)-Number(state.researchAt))});
    }
    const before=process.argv.includes('--before');
    await fs.writeFile(before?'.app-runtime/performance-before.json':'.app-runtime/performance-after.json',JSON.stringify(timings,null,2));
    console.log(JSON.stringify({timings}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
