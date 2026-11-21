const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../extension/core.js');require('../extension/runner.js');
const C=globalThis.ChatterCore;
const interest={id:'q0',prompt:'How interesting is this career to you?',multiple:false,options:[{id:'high',text:'4 - Very Interesting'},{id:'low',text:'1 - Not Interesting'}]};
const awareness={id:'q0',prompt:'Have you heard of this organization before?',multiple:false,options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]};
const factual={id:'q0',prompt:'What is the capital of Canada?',multiple:false,options:[{id:'toronto',text:'Toronto'},{id:'ottawa',text:'Ottawa'}]};
function fixture(questions){
  const actions=[],sleeps=[],events=[],controller=new AbortController();let complete=false,solves=0;
  const runner=new globalThis.ChatterRunner({
    transport:async action=>{actions.push(action);if(action.action==='scan')return {fingerprint:complete?'done':'q',questions:complete?[]:questions,complete,submitCount:1,nextCount:0};if(action.action==='submit')complete=true;return {};},
    solve:async(q,signal,research,repair,onOpened)=>{solves++;await onOpened();return {optionIds:['ottawa'],confidence:.99,personal:false,explanation:'Source evidence.',sources:[{url:'https://example.org'}]};},
    sleep:async ms=>sleeps.push(ms),onEvent:event=>events.push(event)
  });
  return {runner,actions,sleeps,events,controller,solves:()=>solves,run:settings=>runner.run(C.settings({answerDelayMs:7000,interestDelayMs:2000,...settings}),controller.signal)};
}
test('interest cooldown has its own bounded, persisted setting',()=>{
  assert.equal(C.settings().interestDelayMs,0);assert.equal(C.settings({interestDelayMs:'3000'}).interestDelayMs,3000);
  for(const value of [-1,30001,1.5,NaN,'bad'])assert.throws(()=>C.settings({interestDelayMs:value}),/Interest cooldown/);
});
test('interest pages use only the separate interest pause',async()=>{
  const f=fixture([interest]);assert.equal((await f.run()).reason,'complete');
  assert.deepEqual(f.sleeps,[2000]);assert.equal(f.solves(),0);assert.equal(f.events.find(e=>e.type==='pacing').interest,true);
});
test('combined awareness/interest surveys pause once per page',async()=>{
  const f=fixture([awareness,{...interest,id:'q1'},{...interest,id:'q2'}]);await f.run();assert.deepEqual(f.sleeps,[2000]);
});
test('awareness-only pages and factual questions retain their answer-speed pause',async()=>{
  for(const q of [awareness,factual]){const f=fixture([q]);await f.run();assert.deepEqual(f.sleeps,[7000]);}
});
test('zero interest cooldown adds no answer-speed pause to an interest page',async()=>{
  const f=fixture([interest]);await f.run({interestDelayMs:0});assert.deepEqual(f.sleeps,[]);
});
test('mixed factual/interest forms keep the two pauses separate',async()=>{
  const f=fixture([factual,{...interest,id:'q1'}]);await f.run();assert.deepEqual(f.sleeps,[7000,2000]);assert.equal(f.solves(),1);
});
test('randomized interest answers use the interest pause when survey presets are disabled',async()=>{
  const f=fixture([interest]);await f.run({autoSurvey:false,randomOpinions:true});assert.deepEqual(f.sleeps,[2000]);assert.equal(f.solves(),0);
});
test('Stop cancels an interest pause before filling or submitting',async()=>{
  const f=fixture([interest]);f.runner.sleep=async()=>f.controller.abort(new DOMException('Stop','AbortError'));
  await assert.rejects(f.run(),{name:'AbortError'});assert.deepEqual(f.actions.map(a=>a.action),['scan']);
});
