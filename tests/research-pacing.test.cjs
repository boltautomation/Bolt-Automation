const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
const {OllamaSolver}=require('../app/ollama.cjs');
require('../extension/runner.js');
const C=globalThis.ChatterCore;
const question={id:'q0',text:'Which city is the capital of Canada?',multiple:false,options:[{id:'o0',text:'Toronto'},{id:'o1',text:'Ottawa'}],links:[{url:'https://www.canada.ca/'}]};
const sourceText='Ottawa is the capital of Canada and the seat of the federal government. The city is located in Ontario.';

function fixture(){
  const order=[];let clicked=false,closed=false,submitted=false;
  const browser=Object.assign(Object.create(Browser.prototype),{
    targetId:'quiz',contextId:'account',sessionId:'quiz-session',origins:['https://chatterhigh.com'],
    assertSession:async()=>{},
    clickElement:async()=>{clicked=true;order.push('click-research');return true;},
    protocol:{send:async(method,params)=>{
      if(method==='Target.getTargets')return {targetInfos:clicked&&!closed?[{targetId:'research',type:'page',openerId:'quiz',browserContextId:'account'}]:[]};
      if(method==='Target.attachToTarget')return {sessionId:'research-session'};
      if(method==='Target.closeTarget'){closed=true;order.push('close-research');return {};}
      if(method==='Page.bringToFront')return {};
      if(method==='Page.getFrameTree')return {frameTree:{frame:{url:question.links[0].url,id:'research-frame'}}};
      if(method==='Page.createIsolatedWorld')return {executionContextId:1};
      if(method==='Runtime.evaluate'){if(params.expression.includes('function declineCookies'))return {result:{value:{clicked:false}}};assert.equal(closed,false);order.push('read-source');return {result:{value:{url:question.links[0].url,title:'Canada',text:sourceText}}};}
      throw new Error(`Unexpected browser command: ${method}`);
    }}
  });
  const solver=new OllamaSolver({
    sourceLoader:(...args)=>browser.researchSources(...args),
    fetcher:async()=>{
      order.push('generate');return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify({optionIds:['o1'],confidence:.99,personal:false,explanation:'Evidence supports Ottawa.',sourceIds:['s0'],evidenceQuote:'Ottawa is the capital of Canada'})}})};
    }
  });
  const runner=new globalThis.ChatterRunner({
    solve:(...args)=>solver.solve(...args),
    sleep:async ms=>{if(ms!==500){assert.ok(clicked);assert.equal(closed,false);order.push(`cooldown:${ms}`);}},
    transport:async message=>{
      if(message.action==='scan')return {fingerprint:submitted?'done':'question',questions:submitted?[]:[question],complete:submitted,submitCount:1,nextCount:0};
      order.push(message.action);if(message.action==='submit')submitted=true;return {};
    }
  });
  return {order,runner,browser,closed:()=>closed};
}

for(const answerDelayMs of [0,2000])test(`Research click precedes ${answerDelayMs}ms cooldown, reading, generation and submission`,async()=>{
  const f=fixture();
  assert.equal((await f.runner.run(C.settings({answerDelayMs}),new AbortController().signal)).reason,'complete');
  assert.deepEqual(f.order,['click-research',...(answerDelayMs?[`cooldown:${answerDelayMs}`]:[]),'read-source','close-research','generate','fill','submit']);
});

test('Stop with the research tab open cancels the cooldown and closes it without reading or answering',async()=>{
  const f=fixture(),controller=new AbortController();
  let paused;const waiting=new Promise(resolve=>paused=resolve);
  f.runner.sleep=async()=>new Promise((resolve,reject)=>{
    controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true});paused();
  });
  const running=f.runner.run(C.settings({answerDelayMs:30000}),controller.signal);
  await waiting;
  assert.deepEqual(f.order,['click-research']);assert.equal(f.closed(),false);
  controller.abort(new DOMException('Stop','AbortError'));
  await assert.rejects(running,{name:'AbortError'});
  assert.deepEqual(f.order,['click-research','close-research']);
});

test('failed research clicks report the actual cause instead of silently returning no sources',async()=>{
  const f=fixture();f.browser.clickElement=async()=>{throw new Error('The automation browser did not respond.');};
  await assert.rejects(f.browser.researchSources(question,new AbortController().signal),/Research page could not be loaded: The automation browser did not respond/);
  assert.deepEqual(f.order,[]);
});

test('Research cleanup verifies destruction when Chrome acknowledges closing early',async()=>{
  const f=fixture(),send=f.browser.protocol.send;let closing=false,checks=0;
  f.browser.protocol.send=async(method,params)=>{
    if(method==='Target.closeTarget')closing=true;
    if(method==='Target.getTargets'&&closing){checks++;return {targetInfos:checks<3?[{targetId:'research'}]:[]};}
    return send(method,params);
  };
  await f.browser.closeResearchTarget('research');
  assert.equal(checks,3);assert.deepEqual(f.order,['close-research']);
});
