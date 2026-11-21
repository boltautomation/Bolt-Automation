const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sourcePassages,resolveReferences}=require('../app/evidence.cjs');
const {OllamaSolver}=require('../app/ollama.cjs');
const {normalize}=require('../app/sources.cjs');
const question={prompt:'True or False: services are only offered in person.',options:[{id:'t',text:'True'},{id:'f',text:'False'}],multiple:false,links:[]};
const source={id:'s0',title:'Service directory',url:'https://example.org/directory',text:'North office. Session Format: In-person, Online. South office. Session Format: Online, Telephone.'};
const decision={explanation:'Online and telephone services contradict only in person.',optionIds:['f'],confidence:.98,personal:false,evidenceRefs:['s0:p0'],supported:true};
const response=value=>({ok:true,json:async()=>({done:true,message:{content:JSON.stringify(value)}})});

test('passage labels cover the complete source and preserve punctuation, numbers and negation',()=>{
  const text='An introduction. '.repeat(400)+'The fee is $125, not $25. Service isn’t limited to in-person visits. '+ 'Additional details. '.repeat(400);
  const passages=sourcePassages([{...source,text}]);
  assert.ok(passages.length>16,'all passages remain available instead of a short candidate list');
  assert.equal(passages.map(p=>p.text).join(' '),normalize(text));
  for(const p of passages){assert.ok(normalize(text).includes(p.text));assert.ok(p.text.length<=712);}
  assert.equal(new Set(passages.map(p=>p.id)).size,passages.length);
  assert.ok(passages.some(p=>p.text.includes('$125, not $25')));
});

test('references copy actual source text, ignoring a model paraphrase',()=>{
  const passages=sourcePassages([source]);
  const value=resolveReferences({...decision,evidenceQuote:'All therapists only work online.',sourceIds:['invented']},passages);
  assert.equal(value.evidenceQuote,source.text);
  assert.deepEqual(value.sourceIds,['s0']);
  assert.equal(value.evidenceQuotes[0].id,'s0:p0');
});

test('excerpt gaps cannot join unrelated source fragments into one supporting quote',()=>{
  const passages=sourcePassages([{...source,text:'First source fragment with its own context.\n[…]\nSeparate source fragment after omitted material.'}]);
  assert.deepEqual(passages.map(p=>p.text),['First source fragment with its own context.','Separate source fragment after omitted material.']);
  assert.deepEqual(passages.map(p=>p.id),['s0:p0','s0:p1']);
});

test('empty and unknown references cannot borrow or manufacture supporting evidence',async()=>{
  for(const refs of [[],['s0:p999'],['s1:p0'],null]){
    const solver=new OllamaSolver({sourceLoader:async()=>[source],fetcher:async()=>response({...decision,evidenceRefs:refs,evidenceQuote:source.text,sourceIds:['s0']})});
    await assert.rejects(solver.solve(question,new AbortController().signal),/source passage|quote supporting evidence/);
  }
});

test('independent checks select source references without seeing the proposed answer',async()=>{
  const requests=[];
  const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async(url,request)=>{requests.push(JSON.parse(request.body));return response(decision);}});
  const value=await solver.solve(question,new AbortController().signal);
  assert.equal(value.crossChecked,true);assert.equal(value.evidenceQuote,source.text);
  assert.ok(requests[0].messages[1].content.includes('[s0:p0] '+source.text));
  assert.deepEqual(requests[0].format.properties.evidenceRefs.items.enum,['s0:p0']);
  assert.equal(requests[0].format.properties.evidenceQuote,undefined);
  assert.ok(!requests[1].messages[1].content.includes(decision.explanation));
});

test('a referenced quote does not let a disagreeing or unsupported independent answer pass',async()=>{
  for(const change of [{optionIds:['t']},{supported:false}]){
    let calls=0;
    const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async()=>response(++calls===1?decision:{...decision,...change})});
    await assert.rejects(solver.solve(question,new AbortController().signal),/source checks disagreed|source check could not establish/);
  }
});

test('multiple references retain each exact passage and its source attribution',()=>{
  const sources=[source,{...source,id:'s1',text:'The second office also offers evening appointments.'}];
  const value=resolveReferences({...decision,evidenceRefs:['s0:p0','s1:p0','s0:p0']},sourcePassages(sources));
  assert.deepEqual(value.sourceIds,['s0','s1']);assert.equal(value.evidenceQuotes.length,2);
  assert.equal(value.evidenceQuotes[1].text,sources[1].text);
});
