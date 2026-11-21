const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {OllamaSolver}=require('../app/ollama.cjs');
require('../extension/core.js');
const fixtures=[
  {name:'capital versus provincial distractor',text:'Which city is the capital of Canada?',source:'Ottawa is the capital of Canada. Toronto is the capital of Ontario.',choices:['Toronto','Ottawa'],expected:['o1']},
  {name:'negated True/False',text:'Ottawa is not the capital of Canada.',source:'Ottawa is the capital of Canada. Toronto is the capital of Ontario, not Canada.',choices:['True','False','N/A'],expected:['o1']},
  {name:'all components of a combined option',text:'Which courses are in the photography program?',source:'The photography diploma includes Studio Lighting I, Digital Workflow, and Entrepreneurship for Creative Industries II.',choices:['Studio Lighting I','Digital Workflow','Entrepreneurship for Creative Industries II','All of the above'],expected:['o3']},
  {name:'personal-sounding introduction with factual blank',text:'Do you like running a business? The regional forecast projects over ______ job openings by 2032.',source:'The regional forecast projects over 245,000 job openings in business, finance, administration, and management by 2032.',choices:['45,000','145,000','245,000','545,000'],expected:['o2']},
  {name:'qualifier and numeric distinction',text:'What minimum prior study is required in addition to 60 professional-course credits?',source:'The program requires 60 credits of prior general university studies in addition to 60 credits of professional social work courses. A total of 120 credits is needed for graduation.',choices:['30 prior credits','60 prior credits','120 prior credits'],expected:['o1']},
  {name:'missing evidence must not become a confident fact',text:'What is the exact salary after training?',source:'The training program prepares technicians to maintain equipment across the country. This excerpt does not include compensation or salaries.',choices:['$80,000','$100,750','$117,325'],expected:null}
];
(async()=>{
  let current;const results=[];const solver=new OllamaSolver({doubleCheck:true,model:process.env.BOLT_ACCURACY_MODEL||'qwen3:4b',sourceLoader:async()=>[{id:'s0',url:'https://example.org/controlled-fixture',title:'Controlled source',text:current.source}]});
  await solver.check(AbortSignal.timeout(10000));
  for(const fixture of fixtures){current=fixture;const started=Date.now();console.log('CHECK '+fixture.name);let record;
    const question={id:fixture.name,prompt:fixture.text,text:fixture.text,multiple:false,options:fixture.choices.map((text,i)=>({id:'o'+i,text})),links:[]};
    let checked,repair=null,lastError;
    for(let attempt=0;attempt<3;attempt++)try{const candidate=await solver.solve(question,AbortSignal.timeout(300000),()=>{},repair);if(fixture.expected)globalThis.ChatterCore.validateDecision(candidate,question,.9);checked=candidate;break;}catch(error){lastError=error;repair={error:error.message,...(error.review?{review:error.review}:{})};}
    try{if(!checked)throw lastError;const answer=checked;
      if(!fixture.expected){assert.ok(answer.confidence<.9,'unsupported answer must fall below the submission threshold');record={name:fixture.name,outcome:'review',confidence:answer.confidence};}
      else{globalThis.ChatterCore.validateDecision(answer,question,.9);assert.deepEqual(answer.optionIds,fixture.expected);assert.equal(answer.crossChecked,true);record={name:fixture.name,outcome:'correct',confidence:answer.confidence};}
    }catch(error){assert.match(error.message,/source check|needs review|quote supporting evidence|did not select a valid answer/);record={name:fixture.name,outcome:'review',solvable:Boolean(fixture.expected)};}
    record.durationMs=Date.now()-started;results.push(record);console.log('PASS '+record.name+' → '+record.outcome);
  }
  await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/accuracy-model.json',JSON.stringify({model:solver.model,thinking:solver.think,scope:'Controlled local source fixtures; not a live-site accuracy measurement',results},null,2));
  console.log('PASS no incorrect answers accepted in controlled fixtures; '+results.filter(r=>r.outcome==='correct').length+' answered, '+results.filter(r=>r.outcome==='review').length+' left for review.');
})().catch(error=>{console.error(error);process.exitCode=1;});
