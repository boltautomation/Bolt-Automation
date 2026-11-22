const {test}=require('node:test'),assert=require('node:assert/strict');
require('../extension/core.js');require('../extension/runner.js');const C=globalThis.ChatterCore;
const question={id:'q0',prompt:'Fill out the reflection page and then return. Did you complete the reflection? (Hint: Keep this worksheet open.)',multiple:true,links:[{url:'https://example.org/worksheet.pdf'}],options:[{id:'yes',text:'Yes'},{id:'no',text:'No'},{id:'na1',text:'N/A'},{id:'na2',text:'N/A'}]};
test('reflection acknowledgements select Yes exclusively without opinions, surveys or guesses',()=>{
  const result=C.completionAnswer(question);assert.deepEqual(result.optionIds,['yes']);assert.equal(result.verified,false);assert.ok(result.completionAcknowledgement);
  assert.equal(C.completionAnswer({...question,prompt:'What is the correct fibre classification?'}),null);
  assert.equal(C.completionAnswer({...question,options:[...question.options,{id:'yes2',text:'Yes'}]}),null);
  assert.equal(C.completionAnswer({...question,prompt:'Have you completed your consent form?'}),null);
});
test('reflection flow opens Research, observes pacing, submits Yes and returns the site score',async()=>{
  const actions=[];let submitted=false;
  const runner=new globalThis.ChatterRunner({transport:async m=>{actions.push(m);if(m.action==='scan')return submitted?{questions:[],complete:true,score:{correct:9,total:10,source:'site'}}:{questions:[question],fingerprint:'q',submitCount:1,nextCount:0};if(m.action==='submit')submitted=true;return {};},prepareResearch:async(q,s,opened)=>{actions.push({action:'research'});await opened();},solve:async()=>assert.fail('Acknowledgement must not invoke AI'),guess:async()=>assert.fail('No guessing'),sleep:async ms=>actions.push({action:'delay',ms})});
  const result=await runner.run(C.settings({finishActivity:true,autoSurvey:false,randomOpinions:false,guessWhenStuck:false,answerDelayMs:1000}),new AbortController().signal);
  assert.equal(result.count,1);assert.deepEqual(result.score,{correct:9,total:10,source:'site'});assert.deepEqual(actions.find(m=>m.action==='fill').answers,[{id:'q0',optionIds:['yes']}]);
  assert.ok(actions.findIndex(m=>m.action==='research')<actions.findIndex(m=>m.action==='delay'));assert.ok(actions.some(m=>m.action==='submit'));
});
test('reflection acknowledgements preserve manual-submit mode and Stop',async()=>{
  const actions=[],controller=new AbortController();
  const runner=new globalThis.ChatterRunner({transport:async m=>{actions.push(m.action);return {questions:[question],fingerprint:'q',submitCount:1};},solve:async()=>assert.fail('No model'),prepareResearch:async()=>controller.abort(),sleep:async()=>{}});
  await assert.rejects(runner.run(C.settings({finishActivity:true}),controller.signal),{name:'AbortError'});assert.deepEqual(actions,['scan']);
  runner.prepareResearch=undefined;actions.length=0;assert.equal((await runner.run(C.settings({autoSubmit:false}),new AbortController().signal)).reason,'review');assert.deepEqual(actions,['scan','fill']);
});
test('site scores accept actual correct/total results and never mistake answered progress or model confidence for correctness',()=>{
  for(const text of ['Correct Answers 9/10','Correct Answers: 9 out of 10','9 of 10 questions correct'])assert.deepEqual(C.siteScore(text),{correct:9,total:10,source:'site'});
  assert.deepEqual(C.siteScore('Correct Answers 0/10'),{correct:0,total:10,source:'site'});
  for(const text of ['10/10 answered','Confidence 99%','Correct Answers 11/10','Correct Answers 0/0'])assert.equal(C.siteScore(text),null);
});
