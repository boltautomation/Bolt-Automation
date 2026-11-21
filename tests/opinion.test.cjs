const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../extension/core.js');require('../extension/runner.js');
const C=globalThis.ChatterCore;
const opinion={id:'q0',prompt:'In your own opinion, which career interests you most?',multiple:false,options:[{id:'artist',text:'Artist'},{id:'engineer',text:'Engineer'},{id:'scientist',text:'Scientist'}],links:[]};
function fixture(question=opinion,options={}){
  const actions=[],events=[],controller=new AbortController();let submitted=false;
  const runner=new globalThis.ChatterRunner({
    transport:async action=>{actions.push(action);if(action.action==='scan')return {fingerprint:submitted?'done':'q',questions:submitted?[]:[question],complete:submitted,submitCount:1,nextCount:0};if(action.action==='submit')submitted=true;return {};},
    solve:async()=>{throw new Error('Opinion presets should not call the model');},sleep:async()=>{},onEvent:event=>events.push(event),...options
  });
  return {actions,events,controller,run:settings=>runner.run(C.settings({finishActivity:true,randomOpinions:true,...settings}),controller.signal)};
}

test('opinion wording is recognized without treating ordinary facts or contact consent as opinions',()=>{
  for(const prompt of ['In your opinion, is this an appealing career?','What do you think about this career?','How do you feel about this topic?','Do you agree with this statement?','Which career interests you most?'])assert.equal(C.isOpinionQuestion({...opinion,prompt}),true,prompt);
  for(const prompt of ['Which city is the capital of Canada?','Which statement did most participants agree with?','Would you like to receive marketing emails?'])assert.equal(C.isOpinionQuestion({...opinion,prompt}),false,prompt);
  assert.equal(C.isOpinionQuestion({...opinion,prompt:'Would you like to receive marketing emails?'},true),false);
});

test('the two reported module questions are factual despite background interests and do-you-think wording',()=>{
  const prompts=[
    'No matter what profession interests you, there are certain skills that help individuals succeed in advanced manufacturing. If you excel in math and science or love working with computers, this industry may be for you! What other qualities might you possess if you’re interested in advanced manufacturing?',
    'Let’s keep exploring by testing a bathtub scenario to better understand how carbon flows in our atmosphere. After finishing your experiment, do you think a t-shirt is a carbon source or sink? (Hint: Make sure to save your worksheet!)'
  ];
  for(const prompt of prompts)assert.equal(C.isOpinionQuestion({...opinion,prompt}),false,prompt);
});

test('opinions with a Research link complete the site visit before cooldown and filling',async()=>{
  const order=[],q={...opinion,links:[{url:'https://example.org/research'}]};
  const f=fixture(q,{prepareResearch:async(question,signal,onOpened)=>{assert.equal(question,q);signal.throwIfAborted();order.push('research-opened');await onOpened();order.push('research-closed');},sleep:async ms=>{if(ms===2000)order.push('cooldown');}});
  assert.equal((await f.run({answerDelayMs:2000})).reason,'complete');
  assert.deepEqual(order,['research-opened','cooldown','research-closed']);assert.ok(f.actions.some(a=>a.action==='submit'));
});

test('random opinion answers can select any displayed option and are explicitly labeled',()=>{
  assert.deepEqual(C.randomOpinionAnswer(opinion,()=>0).optionIds,['artist']);
  const answer=C.randomOpinionAnswer(opinion,()=>.99);
  assert.deepEqual(answer.optionIds,['scientist']);assert.equal(answer.randomOpinion,true);assert.equal(answer.guessMethod,'random-opinion');assert.equal(answer.verified,false);assert.equal(answer.confidence,0);assert.deepEqual(answer.sources,[]);
  assert.match(answer.explanation,/Random opinion response/);
});

test('opinion questions use random choices immediately, even when factual guessing is off',async()=>{
  const f=fixture();assert.equal((await f.run({guessWhenStuck:false})).reason,'complete');
  const answer=f.events.find(e=>e.type==='answer').answer;
  assert.ok(opinion.options.some(o=>o.id===answer.optionIds[0]));assert.equal(answer.randomOpinion,true);
  assert.ok(!f.events.some(e=>e.type==='research'));assert.equal(f.events.find(e=>e.type==='submitted').randomOpinion,true);
});

test('questions identified as personal by the model become random opinion responses',async()=>{
  const q={...opinion,prompt:'Choose the activity response that applies.'};let calls=0;
  const f=fixture(q,{solve:async()=>{calls++;return {personal:true,optionIds:[],confidence:0,explanation:'A personal reflection.',sources:[]};}});
  assert.equal((await f.run()).reason,'complete');assert.equal(calls,1);
  assert.equal(f.events.find(e=>e.type==='answer').answer.randomOpinion,true);
});

test('personal classification from guess generation also uses a random opinion response',async()=>{
  const q={...opinion,prompt:'Choose the activity response that applies.'};
  for(const guess of [async()=>({personal:true,optionIds:[],confidence:0}),async()=>{const error=new Error('This question asks for your own opinion or experience.');error.code='PERSONAL_QUESTION';throw error;}]){
    const f=fixture(q,{solve:async()=>{throw new Error('No research page could be read.');},guess});
    assert.equal((await f.run({guessWhenStuck:true})).reason,'complete');assert.equal(f.events.find(e=>e.type==='answer').answer.randomOpinion,true);
  }
});

test('existing No and lowest-interest survey preferences take priority over random opinions',async()=>{
  const q={...opinion,prompt:'How interesting is this career to you?',options:[{id:'high',text:'4 - Very Interesting'},{id:'low',text:'1 - Not Interesting'}]};
  const f=fixture(q);assert.equal((await f.run({autoSurvey:true})).reason,'complete');
  const answer=f.events.find(e=>e.type==='answer').answer;
  assert.deepEqual(answer.optionIds,['low']);assert.equal(answer.survey,true);assert.equal(answer.randomOpinion,undefined);
});

test('disabling random opinions retains the manual-personal-answer behavior',async()=>{
  const f=fixture(opinion,{solve:async()=>({personal:true,confidence:0,optionIds:[]})});
  await assert.rejects(f.run({randomOpinions:false}),/own opinion/);assert.ok(f.actions.every(a=>a.action==='scan'));
});

test('review mode and Stop still prevent automatic opinion submission',async()=>{
  const review=fixture();assert.equal((await review.run({autoSubmit:false})).reason,'review');assert.deepEqual(review.actions.map(a=>a.action),['scan','fill']);
  const stopped=fixture(opinion,{sleep:async()=>stopped.controller.abort(new DOMException('Stop','AbortError'))});
  await assert.rejects(stopped.run({answerDelayMs:1000}),{name:'AbortError'});assert.ok(stopped.actions.every(a=>a.action==='scan'));
});
