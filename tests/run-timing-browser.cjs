const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setTimeout:wait}=require('node:timers/promises');
const {RunMetrics}=require('../app/run-metrics.cjs'),{Manager}=require('../app/manager.cjs'),{Browser}=require('../app/browser.cjs'),{createApp}=require('../app/server.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
(async()=>{
 let time=0;const runMetrics=new RunMetrics({now:()=>time,wallNow:()=>1000000});
 const manager=new Manager({runMetrics,accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});runMetrics.start();
 manager.state.runSettings={model:'qwen3:4b'};manager.job=Promise.resolve();
 const app=await createApp({manager,port:0}),browser=new Browser({headless:true,origins:[app.origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(25000);
 const until=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await wait(50);}throw Error('Run timing UI did not update');};
 const values=()=>browser.evaluate(()=>({elapsed:document.getElementById('run-elapsed').value,rate:document.getElementById('run-qpm').value,count:document.getElementById('count').textContent}));
 try{
  await browser.launch(signal);await browser.command('Emulation.setDeviceMetricsOverride',{width:987,height:704,deviceScaleFactor:1,mobile:false});await browser.navigate(app.origin,signal);await browser.evaluate(()=>localStorage.setItem('bolt-onboarding-v1','skipped'));await browser.navigate(app.origin+'/?timing=1',signal);await wait(500);
  assert.equal((await values()).elapsed,'00:00');assert.equal((await values()).rate,'—');
  assert.equal(await browser.evaluate(()=>document.getElementById('run-model').textContent),'Running with qwen3:4b');
  await browser.evaluate(()=>{document.getElementById('model').value='qwen3.8:27b';});
  await until(async()=>await browser.evaluate(()=>document.getElementById('model-run-hint').textContent.includes('This run uses qwen3:4b')));
  assert.match(await browser.evaluate(()=>document.getElementById('model-run-hint').textContent),/Stop, then Resume/);
  manager.job=null;
  await until(async()=>await browser.evaluate(()=>document.getElementById('run-model').textContent==='Last run: qwen3:4b'));
  time=18500;runMetrics.submitted(1,'q1');await until(async()=>(await values()).elapsed==='00:18');assert.deepEqual(await values(),{elapsed:'00:18',rate:'~3.2',count:'1'});
  await browser.navigate(app.origin+'/?timing=2',signal);await until(async()=>(await values()).elapsed==='00:18');
  runMetrics.pause();time+=60000;await wait(1000);assert.equal((await values()).elapsed,'00:18');
  runMetrics.start({resume:true});time+=41500;runMetrics.submitted(1,'q2');runMetrics.submitted(0,'survey');await until(async()=>(await values()).elapsed==='01:00');assert.deepEqual(await values(),{elapsed:'01:00',rate:'~2.0',count:'2'});
  await browser.clickElement(()=>document.querySelector('[data-tab=autobot]'),null,{signal});await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:900,y:80});await wait(300);await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/run-timing.png',await browser.screenshot());
  for(const width of [320,987]){await browser.command('Emulation.setDeviceMetricsOverride',{width,height:704,deviceScaleFactor:1,mobile:false});await wait(100);assert.equal(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  time+=3600000;await until(async()=>(await values()).elapsed==='1:01:00');assert.equal((await values()).rate,'<0.1');
  runMetrics.pause();runMetrics.start();await until(async()=>(await values()).elapsed==='00:00');assert.equal((await values()).rate,'—');
  console.log('PASS elapsed time, rate warmup, submitted-only counts, refresh continuity, pause/resume, hour formatting, reset, and narrow layouts.');
 }finally{await browser.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
