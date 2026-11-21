const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OllamaSolver}=require('../app/ollama.cjs');
const {excerpts}=require('../app/sources.cjs');
require('../extension/core.js');
const C=globalThis.ChatterCore;
require('../extension/runner.js');
const question={id:'q',prompt:'Which city is the capital of Canada?',multiple:false,options:[{id:'a',text:'Toronto'},{id:'b',text:'Ottawa'}],links:[]};
const source={id:'s0',url:'https://example.org/source',title:'Fixture',text:'Ottawa is the capital of Canada. Toronto is the capital of Ontario.'};
const answer={optionIds:['b'],confidence:.98,personal:false,explanation:'The source distinguishes the national capital from the provincial capital.',sourceIds:['s0'],evidenceQuote:'Ottawa is the capital of Canada.'};
function solverWith(responses){let calls=[];const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async(url,request)=>{calls.push(JSON.parse(request.body));return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(responses[Math.min(calls.length-1,responses.length-1)])}})};}});return {solver,calls};}
test('cross-checking requires agreement and uses the lower model estimate',async()=>{
  const {solver,calls}=solverWith([answer,{...answer,confidence:.91,supported:true}]);
  const result=await solver.solve(question,new AbortController().signal);assert.equal(result.crossChecked,true);assert.equal(result.confidence,.91);assert.equal(calls.length,2);
  assert.deepEqual(result.verification,{primaryConfidence:.98,independentConfidence:.91});
  assert.match(calls[1].messages[0].content,/EVERY option/);assert.ok(!calls[1].messages[1].content.includes(answer.explanation),'audit must not see the proposed answer');
  assert.equal(calls[0].format.properties.evidenceQuote,undefined,'models select references instead of copying quotes');
});
test('a real quote attached to the wrong choice cannot pass a disagreeing audit',async()=>{
  const {solver}=solverWith([{...answer,optionIds:['a']},{...answer,supported:true}]);
  await assert.rejects(solver.solve(question,new AbortController().signal),error=>{assert.match(error.message,/source checks disagreed/);assert.deepEqual(error.review.independent.optionIds,['b']);return true;});
});
test('topic matches, missing support, invented audit quotes, and unknown audit citations stop submission',async()=>{
  for(const change of [{supported:false},{evidenceQuote:'An invented quote that appears on no page.'},{sourceIds:['not-a-source']}]){
    const {solver}=solverWith([answer,{...answer,supported:true,...change}]);await assert.rejects(solver.solve(question,new AbortController().signal),/source check|quote supporting evidence/);
  }
});
test('factual numeric blanks and trailing factual tasks cannot become random opinions',()=>{
  for(const prompt of [
    'Do you like the idea of running a business? Business has over ______ job openings projected by 2032.',
    'Do you enjoy photography? What is an example of a course in this program?',
    'Do you like technology? True or False: This program lasts two years.',
    'Do you love travel? Once you finish training, your salary moves up to what amount?'
  ])for(const identified of [false,true])assert.equal(C.isOpinionQuestion({...question,prompt},identified),false,prompt);
  assert.equal(C.isOpinionQuestion({...question,prompt:'Do you like this career?'}),true);
});
test('long-source retrieval uses the actual prompt and preserves the relevant number and qualifiers',()=>{
  const evidence='For the 2032 forecast, business finance administration and management have over 245,000 job openings.';
  const text=('Generic campus information about students and courses. '.repeat(300))+evidence+(' Unrelated campus information. '.repeat(300));
  const extracted=excerpts(text,{prompt:'How many business finance administration and management job openings are projected by 2032?',options:[{text:'245,000'},{text:'45,000'}]},2800);
  assert.ok(extracted.includes(evidence));assert.ok(extracted.length<=2800);
});
test('cancellation interrupts the second check without returning a candidate',async()=>{
  const controller=new AbortController();let calls=0;
  const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async()=>{calls++;if(calls===2)controller.abort();return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify({...answer,supported:true})}})};}});
  await assert.rejects(solver.solve(question,controller.signal),{name:'AbortError'});assert.equal(calls,2);
});
test('runner forwards disagreement details into repair and never guesses when disabled',async()=>{
  let calls=0,submitted=false,guesses=0;const review={proposed:{optionIds:['a']},independent:{optionIds:['b']}};
  const runner=new globalThis.ChatterRunner({
    transport:async data=>{if(data.action==='scan')return {fingerprint:submitted?'done':'q',questions:submitted?[]:[question],complete:submitted,submitCount:1,nextCount:0};if(data.action==='submit')submitted=true;return {};},
    solve:async(q,signal,onResearch,repair)=>{if(!calls++){const error=new Error('Answer needs review: independent source checks disagreed.');error.review=review;throw error;}assert.deepEqual(repair.review,review);return {...answer,crossChecked:true,sources:[{url:source.url}]};},
    guess:async()=>{guesses++;return answer;},sleep:async()=>{}
  });
  const result=await runner.run(C.settings({finishActivity:true,doubleCheck:true,guessWhenStuck:false,confidence:.9}),new AbortController().signal);
  assert.equal(result.reason,'complete');assert.equal(calls,2);assert.equal(guesses,0);
  submitted=false;runner.solve=async()=>{throw new Error('No research source evidence is available.');};
  await assert.rejects(runner.run(C.settings({finishActivity:true,doubleCheck:true,guessWhenStuck:false}),new AbortController().signal),/No research source/);assert.equal(guesses,0);assert.equal(submitted,false);
});
