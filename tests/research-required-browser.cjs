// Local reproduction of the site's disabled Submit link until Research is visited.
const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
const {BrowserMouse}=require('../app/mouse.cjs');
require('../extension/core.js');require('../extension/runner.js');
const C=globalThis.ChatterCore;
(async()=>{
  const prompts={opinion:'In your opinion, which career appeals to you?',factual:'No matter what profession interests you, there are skills that help individuals succeed in advanced manufacturing. What other qualities might you possess if you’re interested in advanced manufacturing?',guess:'Which city is the capital of Canada?'};
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/research')return res.end('<h1>Research fixture</h1>');
    const kind=new URL(req.url,'http://localhost').searchParams.get('case')||'opinion';
    const survey='<form><fieldset><legend>Have you heard of this organization before?</legend><label><input type="radio" name="heard" value="yes">Yes</label><label><input type="radio" name="heard" value="no">No</label></fieldset><fieldset><legend>How interesting is this career to you?</legend>'+[1,2,3,4].map((n,i)=>'<label><input type="radio" name="interest" value="'+n+'">'+n+' - '+['Not Interesting','Somewhat Interesting','Interesting','Very Interesting'][i]+'</label>').join('')+'</fieldset><button id="next" type="button">Next Question</button></form>';
    res.end(`<!doctype html><style>body{font:18px system-ui;margin:30px}label{display:block;padding:12px}button,a{display:inline-block;padding:16px}.disabled{pointer-events:none;opacity:.5}</style><nav><a href="/sign_out">Log out</a></nav>
    <main><form><fieldset><legend>${prompts[kind]}</legend><label><input type="radio" name="answer">First choice</label><label><input type="radio" name="answer">Second choice</label></fieldset><button id="research" type="button" data-ref="aHR0cHM6Ly93d3cuY2FuYWRhLmNhLw==">Research</button><a id="answer-submit" href="#" class="disabled no-pointer-event">Submit</a></form></main><div id="state" hidden data-research="0" data-submits="0"></div>
    <script>
      const state=document.getElementById('state');
      const enable=()=>{const button=document.getElementById('answer-submit');if(button&&Number(state.dataset.research)>0&&document.querySelector('input[name=answer]:checked'))button.className='';};
      document.addEventListener('change',enable);
      document.addEventListener('click',e=>{
        if(!e.isTrusted)return;
        if(e.target.id==='research'){state.dataset.research=Number(state.dataset.research)+1;enable();window.open('/research','_blank');}
        if(e.target.id==='answer-submit'){e.preventDefault();if(e.target.classList.contains('disabled'))throw Error('Submit is disabled');state.dataset.submits=Number(state.dataset.submits)+1;document.querySelector('main').innerHTML=${JSON.stringify(survey)};}
        if(e.target.id==='next'){state.dataset.survey=JSON.stringify([...document.querySelectorAll('input:checked')].map(e=>({name:e.name,value:e.value})));document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';}
      });
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,signal=AbortSignal.timeout(60000);
  const browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin],mouseOptions:{durationScale:0}});
  try{
    await browser.launch(signal);
    for(const kind of ['opinion','factual','guess']){
      await browser.navigate(origin+'/?case='+kind,signal);
      await assert.rejects(new BrowserMouse(browser,{durationScale:0}).click(()=>document.getElementById('answer-submit'),null,{signal}),error=>error.code==='MOUSE_TARGET_DISABLED'&&!/covered/.test(error.message));
      let solved=0,thinking=0,interest=0;
      const runner=new globalThis.ChatterRunner({
        transport:m=>browser.quiz(m,signal),prepareResearch:(...args)=>browser.prepareResearch(...args),
        solve:async(question,s,onEvidence,repair,onOpened)=>{
          solved++;if(kind==='guess')throw Error('No research page could be read.');
          await browser.prepareResearch(question,s,onOpened);
          return {optionIds:[question.options[0].id],confidence:1,personal:false,sources:[{url:'https://www.canada.ca/'}]};
        },
        sleep:async ms=>{if(ms===1000){thinking++;assert.equal(await browser.evaluate(()=>document.getElementById('state').dataset.research),'1');}if(ms===2000)interest++;}
      });
      const result=await runner.run(C.settings({finishActivity:true,randomOpinions:true,guessWhenStuck:true,surveyMode:'random',answerDelayMs:1000,interestDelayMs:2000}),signal);
      assert.equal(result.reason,'complete');assert.equal(solved,kind==='opinion'?0:kind==='guess'?3:1);
      const state=await browser.evaluate(()=>({...document.getElementById('state').dataset}));
      assert.equal(state.research,'1','visit Research once before cooldown, including model-unavailable guesses');assert.equal(state.submits,'1');
      assert.equal(thinking,1);assert.equal(interest,1);
      const responses=JSON.parse(state.survey);assert.equal(responses.length,2);
      assert.ok(['yes','no'].includes(responses.find(r=>r.name==='heard').value));assert.ok(['1','2','3','4'].includes(responses.find(r=>r.name==='interest').value));
    }
    assert.equal((await browser.protocol.send('Target.getTargets')).targetInfos.filter(t=>t.openerId===browser.targetId).length,0);
    console.log('PASS disabled Submit is identified correctly; opinions, reported factual wording, and model-unavailable guesses visit Research before cooldown; single submission; random surveys and independent cooldown complete without model calls; source tabs close');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
