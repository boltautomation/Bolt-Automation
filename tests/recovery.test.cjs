const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/core.js'); require('../extension/runner.js');
const C = globalThis.ChatterCore;
const q = {id:'q0',prompt:'What is the duration of this program?',text:'What is the duration of this program?',multiple:false,options:[{id:'o0',text:'Eight-months full-time'},{id:'o1',text:'Six-semesters part-time'},{id:'o2',text:'Four semesters'},{id:'o3',text:'Both A & B'}]};
const good = {optionIds:['o3'],confidence:.95,personal:false,explanation:'Both durations are supported.',sources:[{url:'https://example.org/education'}]};
const page=(id,questions=[q],extra={})=>({fingerprint:id,questions,submitCount:1,nextCount:0,complete:false,...extra});
const done=page('done',[],{complete:true});
function fixture(pages,solve=async()=>good) {
  let index=0;const actions=[],events=[];
  const runner=new globalThis.ChatterRunner({transport:async action=>{actions.push(action);return action.action==='scan'?pages[Math.min(index++,pages.length-1)]:{};},solve,onEvent:event=>events.push(event),sleep:async()=>{}});
  return {actions,events,run:()=>runner.run(C.settings({finishActivity:true}),new AbortController().signal)};
}
test('A and B are mapped to the provided Both A & B choice, including checkbox layouts',()=>{
  for(const multiple of [false,true])assert.deepEqual(C.normalizeCombinedAnswer({...good,optionIds:['o0','o1']},{...q,multiple}).optionIds,['o3']);
  assert.deepEqual(C.normalizeCombinedAnswer({...good,optionIds:['o0','o1','o3']},q).optionIds,['o3']);
  assert.deepEqual(C.normalizeCombinedAnswer({...good,optionIds:['o0','o2']},q).optionIds,['o0','o2']);
});
test('all supported component choices map to All of the above',()=>{
  const all={...q,options:[...q.options.slice(0,3),{id:'o3',text:'All of the above'}]};
  assert.deepEqual(C.normalizeCombinedAnswer({...good,optionIds:['o0','o1','o2']},all).optionIds,['o3']);
});
test('combined answer normalization continues without another model request or manual action',async()=>{
  let calls=0;const f=fixture([page('q'),done],async()=>{calls++;return {...good,optionIds:['o0','o1']};});
  assert.equal((await f.run()).reason,'complete');assert.equal(calls,1);
  assert.deepEqual(f.actions.find(action=>action.action==='fill').answers,[{id:'q0',optionIds:['o3']}]);
});
test('initial and between-question loading gaps are rescanned automatically',async()=>{
  const f=fixture([page('loading',[]),page('q1'),page('loading-two',[]),page('still-loading',[]),page('q2'),done]);
  assert.equal((await f.run()).count,2);
  assert.equal(f.actions.filter(action=>action.action==='submit').length,2);
  assert.ok(f.events.some(event=>event.type==='recovering'));
});
test('invalid model output is repaired with feedback before any answer is submitted',async()=>{
  const factual={...q,options:q.options.slice(0,3)};
  let calls=0,repair;
  const f=fixture([page('q',[factual]),done],async(question,signal,research,feedback)=>{
    calls++;repair=feedback;
    return {...good,optionIds:calls===1?['o0','o1']:['o0']};
  });
  assert.equal((await f.run()).reason,'complete');assert.equal(calls,2);
  assert.match(repair.error,/Multiple answers/);
  assert.equal(f.actions.filter(action=>action.action==='submit').length,1);
});
test('unresolved model errors stop after three attempts without submitting guesses',async()=>{
  let calls=0;
  const f=fixture([page('q')],async()=>{calls++;throw new Error('The model could not quote supporting evidence.');});
  await assert.rejects(f.run(),/quote supporting evidence/);assert.equal(calls,3);
  assert.ok(f.actions.every(action=>action.action==='scan'));
});

test('low confidence gets one fresh evidence attempt and reports the actual unmet threshold',async()=>{
  let calls=0;
  const f=fixture([page('q')],async(question,signal,research,repair)=>{
    calls++;
    if(calls===2){assert.equal(repair.code,'LOW_CONFIDENCE');assert.equal(repair.previous,null);assert.ok(!repair.error.includes('95%'));}
    return {...good,confidence:.8,crossChecked:true};
  });
  await assert.rejects(f.run(),error=>error.code==='LOW_CONFIDENCE'&&error.details.confidence===.8);
  assert.equal(calls,2);assert.ok(!f.actions.some(action=>action.action==='fill'||action.action==='submit'));
  assert.equal(f.events.filter(event=>event.type==='answer-review').length,2);
});

test('fresh source verification may resolve a confidence miss without guessing',async()=>{
  let calls=0;const f=fixture([page('q'),done],async()=>({...good,confidence:++calls===1?.8:.98,crossChecked:true}));
  assert.equal((await f.run()).reason,'complete');assert.equal(calls,2);
  assert.equal(f.actions.filter(action=>action.action==='submit').length,1);
});
