// Read-only diagnostic for the current paused question. Opens its normal
// research page and tests local inference; never fills or submits quiz answers.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {Browser,Protocol}=require('../app/browser.cjs');
const {OllamaSolver}=require('../app/ollama.cjs');
require('../extension/core.js');
(async()=>{
  const origin='http://127.0.0.1:43117',html=await(await fetch(origin)).text(),token=html.match(/name="app-token" content="([^"]+)"/)?.[1];
  const state=await(await fetch(`${origin}/api/state`,{headers:{'X-App-Token':token}})).json();
  if(state.busy)throw new Error('A run is active. Use this read-only diagnostic while paused.');
  const question=process.argv.includes('--kayley')?{id:'q0',prompt:'Kayley is a veterinarian who does research to help improve the health of dairy cattle. Why does she feel her work is important? Hint: see the “How I affect people’s lives” section.',multiple:false,options:[{id:'o0',text:'Her work helps cattle produce more milk.'},{id:'o1',text:'Her work helps us understand how bacteria respond to antibiotics.'},{id:'o2',text:'She creates conditions where cattle live happier lives.'},{id:'o3',text:'She develops and promotes sustainable farming practices.'}],links:[{url:'https://letstalkscience.ca/careers/dr-kayley-mccubbin',title:'Research'}]}:[...state.events].reverse().find(event=>event.question)?.question;
  if(!question)throw new Error('No paused question is available to inspect.');
  for(const name of await fs.readdir('.app-runtime')){
    if(!name.startsWith('browser-'))continue;let protocol;
    try{
      const [port,endpoint]=(await fs.readFile(path.join('.app-runtime',name,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);
      protocol=await Protocol.connect(`ws://127.0.0.1:${port}${endpoint}`);
      const target=(await protocol.send('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&/^https:\/\/(www\.)?chatterhigh.com\/en\/students\//.test(target.url));
      if(!target)continue;
      const {sessionId}=await protocol.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      const browser=Object.assign(Object.create(Browser.prototype),{protocol,sessionId,targetId:target.targetId,contextId:target.browserContextId,origins:['https://chatterhigh.com','https://www.chatterhigh.com']});
      const signal=AbortSignal.timeout(120000),sources=await browser.researchSources(question,signal);
      assert.ok(sources.length,'No research source could be read.');
      const solver=new OllamaSolver({sourceLoader:async()=>sources}),answer=await solver.solve(question,signal);
      globalThis.ChatterCore.validateDecision(answer,question,.85);
      if(/Kayley/.test(question.prompt))assert.deepEqual(answer.optionIds,['o1']);
      console.log(JSON.stringify({result:'PASS',sections:sources.reduce((sum,source)=>sum+(source.sections||0),0),focused:sources.flatMap(source=>source.focused||[]),choice:answer.optionIds,confidence:answer.confidence,quizSubmitted:false}));return;
    }catch(error){if(protocol)throw error;}
    finally{protocol?.socket.close();}
  }
  throw new Error('No active automation browser was found.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
