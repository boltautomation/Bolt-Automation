const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs');
const {Manager}=require('../app/manager.cjs');
const {createApp}=require('../app/server.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
(async()=>{
  let fixture='offline',pulls=0;
  const model=http.createServer((request,response)=>{response.writeHead(fixture==='offline'?503:200,{'Content-Type':'application/json'});response.end(JSON.stringify({models:fixture==='ready'?[{name:'qwen3:4b',size:1}]:[]}));});
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  const manager=new Manager({accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});
  manager.pull=()=>{pulls++;manager.state.phase='downloading';};manager.run=()=>{throw Error('Setup must never start an activity');};
  const app=await createApp({manager,port:0});
  const browser=new Browser({headless:true,origins:[app.origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(30000);
  const until=async predicate=>{for(let attempt=0;attempt<80;attempt++){if(await predicate())return;await wait(50);}throw Error('Setup UI did not settle');};
  const click=id=>browser.clickElement(id=>document.getElementById(id),id,{signal});
  const state=()=>browser.evaluate(()=>({state:document.getElementById('setup-guide').dataset.state,hidden:document.getElementById('setup-guide').hidden,install:!document.getElementById('setup-install').hidden,download:!document.getElementById('setup-download').hidden,checking:document.getElementById('setup-check').disabled}));
  try{
    await browser.launch(signal);await browser.navigate(app.origin,signal);await browser.evaluate(()=>localStorage.setItem('bolt-onboarding-v1','skipped'));await browser.navigate(app.origin+'/?setup=1#accounts',signal);
    await until(async()=>!(await state()).checking);
    await browser.clickElement(()=>document.querySelector('[data-tab=settings]'),null,{signal});await wait(220);
    await browser.evaluate(url=>{document.getElementById('ollamaUrl').value=url;},`http://127.0.0.1:${model.address().port}`);
    await click('check-ollama');await until(async()=>(await state()).state==='service'&&!(await state()).checking);
    assert.equal((await state()).install,true);assert.equal((await state()).download,false);assert.equal(pulls,0);
    for(const width of [320,987]){await browser.command('Emulation.setDeviceMetricsOverride',{width,height:704,deviceScaleFactor:1,mobile:false});await wait(100);assert.equal(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    fixture='empty';await click('setup-check');await until(async()=>(await state()).state==='model');assert.equal((await state()).download,true);assert.equal((await state()).install,false);assert.equal(pulls,0);
    await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/setup-guide.png',await browser.screenshot());
    await click('setup-settings');assert.equal(await browser.evaluate(()=>document.activeElement.id),'model');
    await click('setup-download');await until(()=>pulls===1);
    await until(async()=>await browser.evaluate(()=>document.getElementById('badge').textContent==='Downloading'));
    fixture='ready';manager.state.phase='idle';await until(async()=>(await state()).hidden);assert.equal((await state()).state,'ready');assert.equal(pulls,1);
    console.log('PASS missing service, missing model, no automatic download, explicit download, model-settings focus, automatic setup completion, and narrow layouts.');
  }finally{await browser.close();await app.close();await new Promise(resolve=>model.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
