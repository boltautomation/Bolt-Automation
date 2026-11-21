const assert = require('node:assert/strict');
const { OllamaSolver } = require('../app/ollama.cjs');
const { validateDecision } = (require('../extension/core.js'), globalThis.ChatterCore);
(async () => {
  const signal = AbortSignal.timeout(300000);
  const solver = new OllamaSolver({ sourceLoader: async () => [{ id: 's0', url: 'https://www.canada.ca/', title: 'Controlled test excerpt', text: 'Ottawa is the capital of Canada. Toronto is the capital of the province of Ontario.' }] });
  await solver.check(signal);
  const question = { id: 'q0', text: 'Which city is the capital of Canada?', multiple: false, options: [{ id: 'o0', text: 'Toronto' }, { id: 'o1', text: 'Ottawa' }], links: [] };
  const answer = await solver.solve(question, signal);
  validateDecision(answer, question, .85); assert.deepEqual(answer.optionIds, ['o1']);
  console.log(`PASS installed local model returns a grounded answer: ${answer.optionIds[0]}, confidence ${answer.confidence}`);
  solver.sourceLoader = async () => [{ id:'s0', url:'https://example.org/engineering', title:'Controlled engineering excerpt', text:'Engineers design products and processes to ensure things are built properly to specifications and regulations. Engineers also evaluate proper system operation in the field.' }];
  const combined = { id:'q1', text:'What are two things an engineer might do?', multiple:false, options:[
    {id:'o0',text:'Design products and processes to ensure things are built properly to specifications and regulations'},
    {id:'o1',text:'Evaluate proper system operation in the field'},
    {id:'o2',text:'Build a computer system from scratch'},
    {id:'o3',text:'Both A & B'}
  ], links:[] };
  const combinedAnswer = await solver.solve(combined, signal);
  validateDecision(combinedAnswer, combined, .85); assert.deepEqual(combinedAnswer.optionIds,['o3']);
  console.log('PASS installed local model selects the single Both A & B option rather than two component IDs');
  solver.sourceLoader=async()=>[{id:'s0',url:'https://example.org/canada',title:'Controlled capital excerpt',text:'Ottawa is the capital of Canada. Toronto is the capital of Ontario, not Canada.'}];
  for(const [prompt,expected] of [['Ottawa is the capital of Canada.','o2'],['Toronto is the capital of Canada.','o1'],['Ottawa is not the capital of Canada.','o1'],['Toronto is not the capital of Canada.','o2']]){
    const tf={id:'tf',prompt,text:prompt,multiple:true,options:[{id:'o0',text:'N/A'},{id:'o1',text:'False'},{id:'o2',text:'True'},{id:'o3',text:'N/A'}],links:[]};
    const result=await solver.solve(tf,signal);validateDecision(result,tf,.85);assert.deepEqual(result.optionIds,[expected]);
    console.log(`PASS installed local model handles True/False + duplicate N/A: ${prompt} → ${expected==='o2'?'True':'False'}`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
