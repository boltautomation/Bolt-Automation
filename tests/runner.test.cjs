const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/core.js');
require('../extension/runner.js');
const C = globalThis.ChatterCore, Runner = globalThis.ChatterRunner;
const question = { id: 'q0', text: 'A factual question', multiple: false, options: [{ id: 'o0', text: 'A' }, { id: 'o1', text: 'B' }] };
const answer = { optionIds: ['o1'], confidence: .95, personal: false, explanation: 'Evidence.', sources: [{ url: 'https://example.org', title: 'Source' }] };
const page = (id = 'first', changes = {}) => ({ fingerprint: id, questions: [question], submitCount: 1, nextCount: 0, complete: false, ...changes });
function setup(pages, options = {}) {
  const actions = []; const controller = new AbortController(); let i = 0;
  const runner = new Runner({
    transport: async message => { actions.push(message); if (message.action === 'scan') return pages[Math.min(i++, pages.length - 1)]; return { ok: true }; },
    solve: async (question,signal,onResearch,repair,onResearchOpened) => { await onResearchOpened(); return answer; }, sleep: async () => {}, ...options
  });
  return { runner, actions, controller, run: config => runner.run(C.settings(config), controller.signal) };
}
test('fills, submits and recognizes quiz completion', async () => {
  const fixture = setup([page(), page('done', { questions: [], complete: true })]);
  const result = await fixture.run();
  assert.equal(result.reason, 'complete'); assert.equal(result.count, 1);
  assert.deepEqual(fixture.actions.map(action => action.action), ['scan', 'fill', 'submit', 'scan']);
  assert.deepEqual(fixture.actions[1].answers, [{ id: 'q0', optionIds: ['o1'] }]);
});
test('review mode fills without submitting', async () => {
  const fixture = setup([page()]);
  assert.equal((await fixture.run({ autoSubmit: false })).reason, 'review');
  assert.deepEqual(fixture.actions.map(action => action.action), ['scan', 'fill']);
});

test('answer speed pauses after research opens and before solving each page', async () => {
  const order=[];
  const fixture=setup([page(),page('second'),page('done',{questions:[],complete:true})],{
    solve:async(question,signal,onResearch,repair,onResearchOpened)=>{order.push('research-open');await onResearchOpened();order.push('solve');return answer;},
    onEvent:event=>{if(event.type==='pacing')order.push(`pause:${event.delayMs}`);},
    sleep:async ms=>{if(ms===2000){assert.equal(fixture.actions.filter(action=>action.action==='fill').length,order.filter(item=>item==='solve').length);order.push(`sleep:${ms}`);}}
  });
  assert.equal((await fixture.run({answerDelayMs:2000})).count,2);
  assert.deepEqual(order,['research-open','pause:2000','sleep:2000','solve','research-open','pause:2000','sleep:2000','solve']);
});

test('research callbacks and answer repairs share one cooldown per page',async()=>{
  const sleeps=[];let calls=0;
  const fixture=setup([page(),page('done',{questions:[],complete:true})],{
    solve:async(question,signal,onResearch,repair,onResearchOpened)=>{await onResearchOpened();await onResearchOpened();return ++calls===1?{...answer,optionIds:['missing']}:answer;},
    sleep:async ms=>sleeps.push(ms)
  });
  assert.equal((await fixture.run({answerDelayMs:3000})).reason,'complete');
  assert.equal(calls,2);assert.equal(sleeps.filter(ms=>ms===3000).length,1);
});

test('fastest adds no pacing delay and review mode respects answer speed', async () => {
  for(const answerDelayMs of [0,3000]){
    const sleeps=[];
    const fixture=setup([page()],{sleep:async ms=>sleeps.push(ms)});
    assert.equal((await fixture.run({autoSubmit:false,answerDelayMs})).reason,'review');
    assert.deepEqual(sleeps,answerDelayMs?[answerDelayMs]:[]);
    assert.deepEqual(fixture.actions.map(action=>action.action),['scan','fill']);
  }
});

test('Stop during a real pacing delay prevents filling and submitting', async () => {
  const fixture=setup([page()],{onEvent:event=>{if(event.type==='pacing')queueMicrotask(()=>fixture.controller.abort(new DOMException('Stop','AbortError')));}});
  // Use the real abortable timer instead of the fixture's instant sleep.
  const realRunner=new Runner({transport:fixture.runner.transport,solve:fixture.runner.solve,onEvent:fixture.runner.onEvent});
  await assert.rejects(realRunner.run(C.settings({answerDelayMs:30000}),fixture.controller.signal),{name:'AbortError'});
  assert.deepEqual(fixture.actions.map(action=>action.action),['scan']);
});

test('survey-only pages retain their pause before filling without research',async()=>{
  const sleeps=[];
  const survey={id:'q0',prompt:'Have you heard of this organization before?',multiple:false,options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]};
  const fixture=setup([page('survey',{questions:[survey]}),page('done',{questions:[],complete:true})],{
    solve:async()=>{throw new Error('Survey must not research');},sleep:async ms=>sleeps.push(ms)
  });
  assert.equal((await fixture.run({answerDelayMs:2000})).reason,'complete');
  assert.deepEqual(sleeps,[2000]);
  assert.deepEqual(fixture.actions.find(action=>action.action==='fill').answers,[{id:'q0',optionIds:['no']}]);
});
test('follows feedback Next buttons before solving the next question', async () => {
  const feedback = page('feedback', { questions: [], nextCount: 1 });
  const fixture = setup([page(), feedback, page('second'), page('done', { questions: [], complete: true })]);
  assert.equal((await fixture.run()).count, 2);
  assert.deepEqual(fixture.actions.filter(action => action.action !== 'scan').map(action => action.action), ['fill', 'submit', 'next', 'fill', 'submit']);
});
test('never resubmits an unchanged page', async () => {
  const fixture = setup([page()]);
  await assert.rejects(fixture.run(), /did not advance/);
  assert.equal(fixture.actions.filter(action => action.action === 'submit').length, 1);
});
test('a page with no questions does not click arbitrary Continue on initial start', async () => {
  const fixture = setup([page('empty', { questions: [], nextCount: 1, message: 'Open a quiz.' })]);
  await assert.rejects(fixture.run(), /Open a quiz/);
  assert.ok(fixture.actions.length > 1);
  assert.ok(fixture.actions.every(action=>action.action==='scan'));
});
test('uncertain, personal, invalid and uncited answers never fill or submit', async () => {
  for (const change of [{ confidence: .2 }, { personal: true }, { optionIds: ['missing'] }, { sources: [] }]) {
    const fixture = setup([page()], { solve: async () => ({ ...answer, ...change }) });
    await assert.rejects(fixture.run());
    assert.equal(fixture.actions.length, 1);
  }
});
test('all questions on the page must be verified before any answer is filled', async () => {
  let calls = 0;
  const fixture = setup([page('multi', { questions: [question, { ...question, id: 'q1' }] })], { solve: async () => ++calls === 1 ? answer : { ...answer, confidence: .1 } });
  await assert.rejects(fixture.run()); assert.equal(fixture.actions.length, 1);
});
test('question limits stop before spending on a page that exceeds the cap', async () => {
  let calls = 0;
  const fixture = setup([page('multi', { questions: [question, { ...question, id: 'q1' }] })], { solve: async () => { calls++; return answer; } });
  assert.equal((await fixture.run({ maxQuestions: 1 })).reason, 'limit'); assert.equal(calls, 0);
});
test('stop during research prevents subsequent DOM mutations', async () => {
  const fixture = setup([page()], { solve: async () => { fixture.controller.abort(new DOMException('Stop', 'AbortError')); return answer; } });
  await assert.rejects(fixture.run(), { name: 'AbortError' });
  assert.deepEqual(fixture.actions.map(action => action.action), ['scan']);
});
test('retries content-script availability during navigation', async () => {
  let scans = 0; const actions = [];
  const runner = new Runner({ solve: async () => answer, sleep: async () => {}, transport: async message => {
    actions.push(message.action);
    if (message.action !== 'scan') return {};
    if (++scans === 1) return page();
    if (scans === 2) throw new Error('content script reloading');
    return page('done', { questions: [], complete: true });
  } });
  assert.equal((await runner.run(C.settings(), new AbortController().signal)).reason, 'complete');
  assert.equal(actions.filter(action => action === 'submit').length, 1);
});

test('initial transient scans retry but session and verification failures stop immediately',async()=>{
  for(const fatal of [false,true]){
    let scans=0,submits=0,accepted=false;
    const runner=new Runner({sleep:async()=>{},solve:async()=>answer,transport:async m=>{
      if(m.action==='scan'){if(++scans===1)throw Object.assign(new Error(fatal?'Verification required':'Page reloading'),fatal?{code:'SESSION_RECOVERY_REQUIRED'}:{});return accepted?page('done',{questions:[],complete:true}):page();}
      if(m.action==='submit'){submits++;accepted=true;}return {};
    }});
    if(fatal){await assert.rejects(runner.run(C.settings(),new AbortController().signal),/Verification/);assert.equal(scans,1);assert.equal(submits,0);}
    else{assert.equal((await runner.run(C.settings(),new AbortController().signal)).reason,'complete');assert.equal(submits,1);}
  }
});

test('an accepted Submit with a lost response is reconciled without a duplicate, ignoring transient blank pages',async()=>{
  let accepted=false,submits=0,blanks=0;const events=[];
  const runner=new Runner({solve:async()=>answer,sleep:async()=>{},onEvent:e=>events.push(e),transport:async m=>{
    if(m.action==='scan'){
      if(accepted&&blanks++===0)return page('loading',{questions:[]});
      return accepted?page('done',{questions:[],complete:true}):page();
    }
    if(m.action==='submit'){submits++;accepted=true;throw Error('Response interrupted');}return {};
  }});
  const result=await runner.run(C.settings(),new AbortController().signal);
  assert.equal(result.reason,'complete');assert.equal(result.count,1);assert.equal(submits,1);
  assert.ok(events.some(e=>e.type==='recovering'&&/without repeating/.test(e.message)));
});

test('a failed Submit with no confirmed advancement is never blindly repeated',async()=>{
  let submits=0,scans=0;
  const runner=new Runner({solve:async()=>answer,sleep:async()=>{},transport:async m=>{
    if(m.action==='scan'){scans++;return page();}if(m.action==='submit'){submits++;throw Error('No click receipt');}return {};
  }});
  await assert.rejects(runner.run(C.settings(),new AbortController().signal),/No click receipt/);
  assert.equal(submits,1);assert.equal(scans,4);
});

test('an accepted Next with an interrupted response is not clicked twice',async()=>{
  let accepted=false,nexts=0;
  const runner=new Runner({sleep:async()=>{},transport:async m=>{
    if(m.action==='scan')return page(accepted?'done':'feedback',{questions:[],nextCount:accepted?0:1,complete:accepted,feedback:!accepted});
    if(m.action==='next'){nexts++;accepted=true;throw Error('Next response interrupted');}return {};
  }});
  assert.equal((await runner.run(C.settings(),new AbortController().signal)).reason,'complete');assert.equal(nexts,1);
});

test('Stop during click reconciliation prevents further scans or submissions',async()=>{
  let submits=0,scans=0;const controller=new AbortController();
  const runner=new Runner({solve:async()=>answer,sleep:async()=>controller.abort(new DOMException('Stop','AbortError')),transport:async m=>{
    if(m.action==='scan'){scans++;return page();}if(m.action==='submit'){submits++;throw Error('Lost response');}return {};
  }});
  await assert.rejects(runner.run(C.settings(),controller.signal),{name:'AbortError'});
  assert.equal(submits,1);assert.equal(scans,1);
});

test('an unchanged page after submission produces a typed stall instead of replaying Submit',async()=>{
  const f=setup([page()]);
  await assert.rejects(f.run(),e=>e.code==='PAGE_TRANSITION_STALLED');
  assert.equal(f.actions.filter(a=>a.action==='submit').length,1);
});

test('generation overlaps the selected delay and filling waits for both, in either completion order',async()=>{
  for(const timerFirst of [true,false]){
    let releaseTimer,releaseModel,started,submitted=false,filled=false,timerDone=false,modelDone=false;
    const modelStarted=new Promise(resolve=>started=resolve),delays=[];
    const runner=new Runner({
      sleep:async ms=>{delays.push(ms);await new Promise(resolve=>releaseTimer=resolve);timerDone=true;},
      solve:async(q,s,onEvidence,repair,onOpened)=>{await onOpened();started();await new Promise(resolve=>releaseModel=resolve);modelDone=true;return answer;},
      transport:async m=>{if(m.action==='scan')return submitted?page('done',{questions:[],complete:true}):page();if(m.action==='fill'){assert.ok(timerDone&&modelDone);assert.equal(m.pacingComplete,true);filled=true;}if(m.action==='submit')submitted=true;return {};}
    });
    const running=runner.run(C.settings({answerDelayMs:3000}),new AbortController().signal);
    await modelStarted;assert.equal(filled,false,'generation starts while the delay is still pending');
    if(timerFirst)releaseTimer();else releaseModel();
    await new Promise(resolve=>setImmediate(resolve));assert.equal(filled,false,'one unfinished prerequisite must still block filling');
    if(timerFirst)releaseModel();else releaseTimer();
    assert.equal((await running).reason,'complete');assert.deepEqual(delays,[3000]);
  }
});

test('a failed solve cancels its unused pacing timer',async()=>{
  let pacingSignal;
  const runner=new Runner({
    sleep:(ms,s)=>{pacingSignal=s;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(s.reason),{once:true}));},
    solve:async(q,s,onEvidence,repair,onOpened)=>{await onOpened();throw Error('Unrecoverable model failure');},
    transport:async()=>page()
  });
  await assert.rejects(runner.run(C.settings({answerDelayMs:30000}),new AbortController().signal),/Unrecoverable model failure/);
  assert.equal(pacingSignal.aborted,true);
});
