const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../extension/core.js');require('../extension/runner.js');
const C=globalThis.ChatterCore;
const question={id:'q0',prompt:'Ottawa is the capital of Canada.',multiple:true,options:[{id:'o0',text:'True'},{id:'o1',text:'False'},{id:'o2',text:'N/A'},{id:'o3',text:'N/A'}]};
const answer={optionIds:['o0'],confidence:.98,personal:false,explanation:'The source supports the statement.',sources:[{url:'https://example.org/source'}]};
test('True/False placeholders are excluded without changing original choice IDs',()=>{
  assert.deepEqual(C.trueFalseOptions(question).map(option=>option.id),['o0','o1']);
  const reordered={options:[{id:'o0',text:'A. N/A'},{id:'o1',text:'B. False'},{id:'o2',text:'C. Not applicable'},{id:'o3',text:'D. True'}]};
  assert.deepEqual(C.trueFalseOptions(reordered).map(option=>option.id),['o1','o3']);
  assert.equal(C.trueFalseOptions({options:[{id:'a',text:'True'},{id:'b',text:'False'},{id:'c',text:'Neither is correct'}]}),null);
  assert.equal(C.trueFalseOptions({options:[{id:'a',text:'Yes'},{id:'b',text:'No'},{id:'c',text:'N/A'}]}),null);
});
test('True/False is exclusive even on checkbox pages and cannot select N/A',()=>{
  for(const optionIds of [['o2'],['o3'],['o0','o1']])assert.throws(()=>C.validateDecision({...answer,optionIds},question,.85),/option|Multiple answers/);
  for(const id of ['o0','o1'])assert.doesNotThrow(()=>C.validateDecision({...answer,optionIds:[id]},question,.85));
});
test('placeholder answer is repaired before filling or submitting a True/False page',async()=>{
  const actions=[];let calls=0,feedback,index=0;
  const pages=[{fingerprint:'tf',questions:[question],submitCount:1,nextCount:0},{fingerprint:'done',questions:[],complete:true}];
  const runner=new globalThis.ChatterRunner({transport:async action=>{actions.push(action);return action.action==='scan'?pages[Math.min(index++,1)]:{};},solve:async(q,s,r,repair)=>{feedback=repair;return {...answer,optionIds:[calls++===0?'o2':'o1']};},sleep:async()=>{}});
  assert.equal((await runner.run(C.settings({finishActivity:true}),new AbortController().signal)).reason,'complete');
  assert.equal(calls,2);assert.match(feedback.error,/N\/A is a placeholder/);
  assert.deepEqual(actions.filter(action=>action.action==='fill').map(action=>action.answers),[[{id:'q0',optionIds:['o1']}]]);
});
