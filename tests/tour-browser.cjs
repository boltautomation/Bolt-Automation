const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs');
const {Manager}=require('../app/manager.cjs');
const {createApp}=require('../app/server.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
(async()=>{
  const manager=new Manager({accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});
  for(let i=1;i<=4;i++)await manager.accountStore.save({email:`saved-account-${i}@example.test`,label:`Saved account ${i}`,secret:{}});
  let runCalls=0;manager.run=()=>{runCalls++;throw Error('A tour must never start a run');};
  const app=await createApp({manager,port:0});
  const browser=new Browser({headless:true,origins:[app.origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(45000);
  const until=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await wait(50);}throw Error('Tour UI did not settle');};
  const open=()=>browser.evaluate(()=>document.getElementById('quick-tour').open);
  const click=id=>browser.clickElement(id=>document.getElementById(id),id,{signal});
  const step=async n=>{await until(async()=>await browser.evaluate(n=>document.getElementById('quick-tour').dataset.step===String(n)&&document.activeElement===document.getElementById('tour-title'),n));};
  const key=async(name,code)=>{await browser.command('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code});await browser.command('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code});};
  const fits=async()=>{
    const box=await browser.evaluate(()=>{const r=document.getElementById('tour-card').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};});
    assert.ok(box.x>=0&&box.y>=0&&box.right<=box.width+1&&box.bottom<=box.height+1,JSON.stringify(box));assert.ok(box.scroll<=box.width);
    const overlap=await browser.evaluate(()=>{
      const ring=document.getElementById('tour-focus-ring');if(ring.hidden)return 0;
      const a=ring.getBoundingClientRect(),b=document.getElementById('tour-card').getBoundingClientRect();
      return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    });
    assert.equal(overlap,0,'the tutorial card must never cover its highlighted control');
  };
  try{
    await browser.launch(signal);await browser.command('Emulation.setDeviceMetricsOverride',{width:987,height:704,deviceScaleFactor:1,mobile:false});await browser.navigate(app.origin,signal);await until(open);await step(0);
    await fs.mkdir('test-results',{recursive:true});await wait(180);await fs.writeFile('test-results/tour-welcome.png',await browser.screenshot());await fits();
    const initial=await browser.evaluate(()=>({settings:localStorage.getItem('chatterhigh-local-settings'),tab:document.querySelector('[data-tab][aria-current=page]').dataset.tab,delay:document.getElementById('answerDelayMs').value}));
    await key('Tab',9);assert.equal(await browser.evaluate(()=>Boolean(document.activeElement.closest('#quick-tour'))),true);
    for(let n=1;n<8;n++){
      await click('tour-next');await step(n);await fits();
      if(n===1){assert.equal(await browser.evaluate(()=>document.querySelector('.sidebar').getBoundingClientRect().width),60);assert.ok(await browser.evaluate(()=>document.getElementById('tour-focus-ring').getBoundingClientRect().width<250),'account tour targets the button, not the entire saved-account list');await wait(180);await fs.writeFile('test-results/tour-accounts.png',await browser.screenshot());}
      if(n===3){assert.equal(await browser.evaluate(()=>document.getElementById('tour-details').textContent.includes('No pause')),true);await wait(180);await fs.writeFile('test-results/tour-timing.png',await browser.screenshot());}
      if(n===4){
        for(const [width,height]of [[987,704],[760,620],[320,640],[390,844],[550,400],[1080,740]]){
          await browser.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(100);await fits();
          assert.equal(await browser.evaluate(()=>!document.getElementById('tour-focus-ring').hidden),true,'the real setting stays visible after resizing');
          assert.equal(await browser.evaluate(()=>document.querySelector('.topbar-actions').getBoundingClientRect().right<=innerWidth),true,'header actions remain inside narrow windows');
          if(width===390)await fs.writeFile('test-results/tour-mobile.png',await browser.screenshot());
        }
      }
    }
    await click('tour-next');assert.equal(await open(),false);
    assert.equal(await browser.evaluate(()=>localStorage.getItem('bolt-onboarding-v1')),'completed');
    assert.equal(await browser.evaluate(()=>localStorage.getItem('chatterhigh-local-settings')),initial.settings);
    assert.equal(await browser.evaluate(()=>document.getElementById('answerDelayMs').value),initial.delay);assert.equal(runCalls,0);
    assert.equal(await browser.evaluate(()=>document.querySelector('[data-tab][aria-current=page]').dataset.tab),initial.tab);
    await click('sidebar-toggle');await wait(250);await fs.writeFile('test-results/sidebar-glass.png',await browser.screenshot());

    await browser.navigate(app.origin+'/?completed=1#settings',signal);await wait(900);assert.equal(await open(),false,'completed tour does not reappear');
    await click('replay-tour');await step(0);await click('tour-next');await step(1);await click('tour-back');await step(0);
    await key('Escape',27);assert.equal(await open(),false);assert.equal(await browser.evaluate(()=>localStorage.getItem('bolt-onboarding-v1')),'completed');
    assert.equal(await browser.evaluate(()=>document.querySelector('[data-tab][aria-current=page]').dataset.tab),'settings');
    await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('open-tour');await step(0);assert.equal(await browser.evaluate(()=>document.getElementById('tour-card').getAnimations().length),0);await click('tour-skip');

    await browser.evaluate(()=>localStorage.removeItem('bolt-onboarding-v1'));manager.job=Promise.resolve();
    await browser.navigate(app.origin+'/?busy=1',signal);await wait(1100);assert.equal(await open(),false,'automatic tour must not interrupt an active run');
    manager.job=null;await until(open);await click('tour-skip');assert.equal(await browser.evaluate(()=>localStorage.getItem('bolt-onboarding-v1')),'skipped');
    await browser.navigate(app.origin+'/?skipped=1',signal);await wait(900);assert.equal(await open(),false,'skipped tour stays dismissed');
    assert.equal(runCalls,0);
    const logo=await browser.evaluate(async()=>{const img=document.querySelector('.brand-icon');await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return {alpha:ctx.getImageData(0,0,1,1).data[3],background:getComputedStyle(img).backgroundColor};});
    assert.equal(logo.alpha,0);assert.equal(logo.background,'rgba(0, 0, 0, 0)');
    assert.match(await browser.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).backdropFilter),/blur\(20px\)/);
    console.log('PASS first-launch tour, all steps, focus containment, Skip/Back/Escape/replay, persistent dismissal, restored navigation, unchanged settings and no run actions, responsive layout, reduced motion, deferred introduction during active runs, and frosted sidebar');
  }finally{manager.job=null;await browser.close();await app.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
