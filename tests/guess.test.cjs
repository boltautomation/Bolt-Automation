const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../extension/core.js');require('../extension/runner.js');
const {OllamaSolver}=require('../app/ollama.cjs');
const C=globalThis.ChatterCore;
const question={id:'q0',prompt:'Which city is the capital of Canada?',multiple:false,options:[{id:'o0',text:'Toronto'},{id:'o1',text:'Ottawa'}],links:[]};
const good={optionIds:['o1'],confidence:.98,personal:false,explanation:'Ottawa is the capital.',sources:[{url:'https://example.org'}]};
function fixture(options={}){
  const actions=[],events=[],controller=new AbortController();let submitted=false;
  const runner=new globalThis.ChatterRunner({
    transport:async action=>{actions.push(action);if(action.action==='scan')return {fingerprint:submitted?'done':'q',questions:submitted?[]:[question],complete:submitted,submitCount:1,nextCount:0};if(action.action==='submit')submitted=true;return {};},
    solve:async()=>{throw new Error('No research page could be read.');},guess:async()=>({...good,confidence:.2,sources:[]}),
    sleep:async()=>{},onEvent:event=>events.push(event),...options
  });
  return {runner,actions,events,controller,run:settings=>runner.run(C.settings({finishActivity:true,guessWhenStuck:true,...settings}),controller.signal)};
}

test('failed research tries recovery then submits a clearly marked model guess',async()=>{
  let researched=0,guessed=0;
  const f=fixture({solve:async()=>{researched++;throw new Error('No research page could be read.');},guess:async()=>{guessed++;return {...good,confidence:.2,sources:[]};}});
  assert.equal((await f.run()).reason,'complete');assert.equal(researched,3);assert.equal(guessed,1);
  assert.deepEqual(f.actions.find(a=>a.action==='fill').answers,[{id:'q0',optionIds:['o1']}]);
  const answer=f.events.find(e=>e.type==='answer').answer;
  assert.equal(answer.guessed,true);assert.equal(answer.verified,false);assert.equal(answer.supported,false);assert.equal(answer.confidence,.2);assert.match(answer.explanation,/Unverified guess/);
  assert.equal(f.events.find(e=>e.type==='submitted').guessed,true);
});

test('low-confidence valid answers are reused as guesses instead of requesting another model answer',async()=>{
  let guesses=0;const f=fixture({solve:async()=>({...good,confidence:.3}),guess:async()=>{guesses++;return good;}});
  assert.equal((await f.run()).count,1);assert.equal(guesses,0);
  assert.equal(f.events.find(e=>e.type==='answer').answer.confidence,.3);
});

test('turning off guess mode preserves evidence/confidence requirements',async()=>{
  const f=fixture();await assert.rejects(f.run({guessWhenStuck:false}),/No research page/);
  assert.ok(f.actions.every(a=>a.action==='scan'));assert.equal(C.settings().guessWhenStuck,false);
});

test('hung research and guess generation are aborted before a random valid fallback',async()=>{
  let researchSignal,guessSignal;
  const f=fixture({questionTimeoutMs:10,guessTimeoutMs:10,solve:(q,signal)=>{researchSignal=signal;return new Promise(()=>{});},guess:(q,signal)=>{guessSignal=signal;return new Promise(()=>{});}});
  assert.equal((await f.run()).reason,'complete');assert.equal(researchSignal.aborted,true);assert.equal(guessSignal.aborted,true);
  const answer=f.events.find(e=>e.type==='answer').answer;
  assert.equal(answer.guessMethod,'random');assert.equal(answer.confidence,0);assert.match(answer.explanation,/random choice/);
  assert.ok(question.options.some(o=>answer.optionIds[0]===o.id));
});

test('invalid guesses fall back only to real choices and never True/False N/A placeholders',async()=>{
  const f=fixture({guess:async()=>({...good,optionIds:['missing']})});
  assert.equal((await f.run()).reason,'complete');assert.equal(f.events.find(e=>e.type==='answer').answer.guessMethod,'random');
  const tf={...question,multiple:true,options:[{id:'na1',text:'N/A'},{id:'false',text:'False'},{id:'true',text:'True'},{id:'na2',text:'N/A'}]};
  assert.deepEqual(C.randomGuess(tf,'stuck',()=>0).optionIds,['false']);assert.deepEqual(C.randomGuess(tf,'stuck',()=>.99).optionIds,['true']);
});

test('Stop during guessing prevents filling or submitting',async()=>{
  const f=fixture({guess:async()=>{f.controller.abort(new DOMException('Stop','AbortError'));return good;}});
  await assert.rejects(f.run(),{name:'AbortError'});assert.ok(f.actions.every(a=>a.action==='scan'));
});

test('session errors, CAPTCHA and identified personal questions never become guesses',async()=>{
  for(const error of [Object.assign(new Error('Session expired'),{code:'SESSION_EXPIRED'}),Object.assign(new Error('Reconnect required'),{code:'SESSION_RECOVERY_REQUIRED'}),new Error('Verify you are human: CAPTCHA'),new Error('This question asks for your own opinion or experience.')]){
    let guesses=0;const f=fixture({solve:async()=>{throw error;},guess:async()=>{guesses++;return good;}});
    await assert.rejects(f.run());assert.equal(guesses,0);assert.ok(f.actions.every(a=>a.action==='scan'));
  }
  const personal=fixture({guess:async()=>({...good,personal:true})});
  await assert.rejects(personal.run(),/own opinion/);assert.ok(personal.actions.every(a=>a.action==='scan'));
});

test('review mode fills a guessed answer without submitting it',async()=>{
  const f=fixture();assert.equal((await f.run({autoSubmit:false})).reason,'review');
  assert.deepEqual(f.actions.map(a=>a.action),['scan','fill']);
});

test('best-effort local inference skips research, preserves True/False IDs and does not invent citations',async()=>{
  let body,loads=0;
  const solver=new OllamaSolver({sourceLoader:async()=>{loads++;return [];},fetcher:async(url,request)=>{body=JSON.parse(request.body);return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify({optionIds:['true'],confidence:.3,personal:false,explanation:'A plausible general-knowledge answer.'})}})};}});
  const tf={...question,multiple:true,options:[{id:'na',text:'N/A'},{id:'false',text:'False'},{id:'true',text:'True'}]};
  const answer=await solver.guess(tf,new AbortController().signal,'Source unavailable');
  assert.equal(loads,0);assert.deepEqual(body.format.properties.optionIds.items.enum,['false','true']);assert.equal(body.format.properties.optionIds.maxItems,1);
  assert.match(body.messages[0].content,/UNVERIFIED/);assert.deepEqual(answer.sources,[]);assert.equal(answer.confidence,.3);
});
