const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs'),{Manager}=require('../app/manager.cjs'),{createApp}=require('../app/server.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
const {setTimeout:wait}=require('node:timers/promises');
(async()=>{
  const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><nav><a href="/sign_out">Log out</a></nav><main><form><fieldset><legend>Fill out the reflection page and return here. Did you complete the reflection? Keep this worksheet open.</legend>${['Yes','No','N/A','N/A'].map(t=>`<label><input type=checkbox name=answer>${t}</label>`).join('')}</fieldset><button type=button id=submit>Submit</button></form></main><script>document.getElementById('submit').onclick=e=>{if(!e.isTrusted)throw Error('Expected real mouse input');const checked=[...document.querySelectorAll('input:checked')];if(checked.length!==1||checked[0]!==document.querySelector('input'))throw Error('Expected Yes only');document.querySelector('main').innerHTML='<h1>You have completed all the questions for this module.</h1><h2>Correct Answers</h2><p>9/10</p>';};</script>`);});
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+fixture.address().port,signal=AbortSignal.timeout(30000),browser=new Browser({headless:true,origins:[origin],mouseOptions:{durationScale:0}});
  let app,ui;
  try{
    await browser.launch(signal);await browser.navigate(origin+'/modules/1/question',signal);
    const manager=new Manager({accountStore:new MemoryAccounts(),progressStore:new MemoryProgress(),solverFactory:()=>({solve:async()=>assert.fail('Completion acknowledgements must not call a model')})});
    manager.browser=browser;Object.assign(manager.state,{account:'fixture@example.test',sessionStatus:'verified',modulesStatus:'loaded',modules:[{id:origin+'/modules/1/question',url:origin+'/modules/1/question',title:'Reflection fixture',total:10,answered:9,completed:false}]});
    manager.run({mode:'modules',moduleIds:[manager.state.modules[0].id],email:manager.state.account,settings:{finishActivity:true,autoSubmit:true,randomOpinions:false,guessWhenStuck:false}});await manager.job;
    assert.equal(manager.state.phase,'complete',manager.state.message);assert.deepEqual(manager.state.queue[0].score,{correct:9,total:10,source:'site'});assert.equal(manager.state.count,1);
    app=await createApp({manager,port:0});ui=new Browser({headless:true,origins:[app.origin]});await ui.launch(signal);await ui.navigate(app.origin,signal);
    await ui.evaluate(()=>localStorage.setItem('bolt-onboarding-v1','skipped'));await ui.navigate(app.origin,signal);
    for(let i=0;i<20;i++){if((await ui.evaluate(()=>document.querySelector('#queue-list')?.textContent||'')).includes('9/10 correct'))break;await wait(100);}
    assert.match(await ui.evaluate(()=>document.querySelector('#queue-list').textContent),/Completed · 9\/10 correct/);
    assert.match(await ui.evaluate(()=>document.querySelector('#history-list').textContent),/9\/10 correct/);
    await ui.evaluate(()=>document.querySelector('#hide-completed').checked=false);await ui.evaluate(()=>document.querySelector('#hide-completed').dispatchEvent(new Event('change')));
    assert.match(await ui.evaluate(()=>document.querySelector('#module-list').textContent),/Completed · 9\/10 correct/);
    console.log('PASS real Chrome selects Yes only, submits through the mouse, reads the actual 9/10 result, persists it and displays it in queue, modules and History');
  }finally{await ui?.close();if(app)await app.close();else await browser.close();await new Promise(r=>fixture.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
