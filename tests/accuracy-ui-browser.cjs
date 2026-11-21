const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs'),{Manager}=require('../app/manager.cjs'),{createApp}=require('../app/server.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
(async()=>{
 const manager=new Manager({accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});
 const q={id:'fixture',prompt:'Practice question',options:[{id:'a',text:'Source-backed answer'}]};
 manager.state.events=[{type:'answer',question:q,answer:{optionIds:['a'],confidence:.94,crossChecked:true,evidenceQuote:'A source-backed answer for a controlled example.',explanation:'Controlled example.',reviewExplanation:'The second pass supports the same choice.',sources:[]}}];
 manager.state.queue=[{id:'review',title:'Review an unresolved question',status:'needs-attention',error:'Independent source checks disagreed. No guess was submitted.'}];
 const app=await createApp({manager,port:0}),browser=new Browser({headless:true,origins:[app.origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(25000);
 try{
  await browser.launch(signal);await browser.command('Emulation.setDeviceMetricsOverride',{width:987,height:704,deviceScaleFactor:1,mobile:false});await browser.navigate(app.origin,signal);
  await browser.evaluate(()=>{localStorage.setItem('bolt-onboarding-v1','skipped');localStorage.setItem('chatterhigh-local-settings',JSON.stringify({model:'qwen3:4b',guessWhenStuck:true,confidence:.85,answerDelayMs:3000}));});
  await browser.navigate(app.origin+'/?accuracy=1#autobot',signal);await wait(600);
  await browser.clickElement(()=>document.querySelector('[data-tab=autobot]'),null,{signal});await wait(220);
  await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:930,y:80});await wait(250);
  const policy=await browser.evaluate(()=>({checks:document.getElementById('doubleCheck').checked,guesses:document.getElementById('guessWhenStuck').checked,confidence:document.getElementById('confidence').value,delay:document.getElementById('answerDelayMs').value,checked:document.getElementById('quality-checked').textContent,review:document.getElementById('quality-review').textContent}));
  assert.deepEqual(policy,{checks:true,guesses:false,confidence:'90',delay:'3000',checked:'1',review:'1'});
  await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/accuracy-workspace.png',await browser.screenshot());
  for(const [width,height]of [[320,704],[390,844],[987,704]]){await browser.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(100);assert.equal(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await browser.clickElement(()=>document.getElementById('accuracy-settings'),null,{signal});await wait(220);
  assert.equal(await browser.evaluate(()=>document.activeElement.id),'doubleCheck');
  await browser.evaluate(()=>document.getElementById('settings-form').requestSubmit());
  await browser.navigate(app.origin+'/?accuracy=2#settings',signal);await wait(350);
  assert.equal(await browser.evaluate(()=>document.getElementById('guessWhenStuck').checked),false);
  await fs.writeFile('test-results/accuracy-settings.png',await browser.screenshot());
  await browser.evaluate(()=>{document.getElementById('guessWhenStuck').checked=true;document.getElementById('settings-form').requestSubmit();});
  await browser.navigate(app.origin+'/?accuracy=3#settings',signal);await wait(350);
  assert.equal(await browser.evaluate(()=>document.getElementById('guessWhenStuck').checked),true,'an explicit new choice is preserved');
  console.log('PASS legacy settings upgraded to source checks and guesses off, timing preserved, quality counters, responsive layout, settings focus, persistence and explicit opt-in.');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
