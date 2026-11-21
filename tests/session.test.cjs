const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Manager}=require('../app/manager.cjs');
const {SessionExpiredError}=require('../app/session.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
const ids=['https://chatterhigh.com/modules/1','https://chatterhigh.com/modules/2'];
const answer={optionIds:['o1'],confidence:.98,personal:false,sources:[{url:'https://example.org/source'}]};
class SessionBrowser{
  constructor(options={}){this.options=options;this.accepted=new Map(ids.map(id=>[id,0]));this.loginAttempts=0;this.expired=true;this.expiredOnce=false;this.currentUrl='https://chatterhigh.com/';this.submissions=[];}
  allowed(url){return globalThis.ChatterCore.isChatterHigh(url);}
  async launch(){}
  async close(){}
  async url(){return this.currentUrl;}
  async login(email,password,signal){this.loginAttempts++;this.loginEmail=email;if(this.loginAttempts>1){if(this.options.failLogin)throw new Error('Invalid password');if(this.options.onReconnect)await this.options.onReconnect(signal);}signal.throwIfAborted();this.expired=false;this.currentUrl='https://chatterhigh.com/dashboard';}
  async snapshotSession(){return {url:this.currentUrl,cookies:[{name:'account',value:this.loginEmail}]};}
  authenticated(info){return !info.expired&&!info.challenge;}
  async info(){return {url:this.expired?'https://chatterhigh.com/':this.currentUrl,expired:this.expired,challenge:this.options.challenge&&this.expired,buttons:[],links:[{text:'Modules',url:'https://chatterhigh.com/modules'},...ids.map((id,index)=>({text:`Module ${index+1}`,url:id,card:''}))]};}
  async assertSession(){if(this.expired)throw new SessionExpiredError();}
  async navigate(url){this.currentUrl=url;if(this.options.expireEveryModule&&ids.includes(url))this.expired=true;}
  async quiz(message){
    await this.assertSession();const n=this.accepted.get(this.currentUrl)||0;
    if(message.action==='submit'){this.accepted.set(this.currentUrl,n+1);this.submissions.push(`${this.currentUrl}:${n}`);if(!this.expiredOnce&&this.options.expireAfterSubmit){this.expiredOnce=true;this.expired=true;}return {};}
    const complete=n>=(this.currentUrl===ids[0]?2:1);
    return {fingerprint:`${this.currentUrl}:${n}`,questions:complete?[]:[{id:'q0',text:`Question ${n+1}`,multiple:false,options:[{id:'o0',text:'No'},{id:'o1',text:'Yes'}]}],complete,nextCount:0};
  }
}
async function setup(options={},remember=true){const browser=new SessionBrowser(options);const m=new Manager({browserFactory:()=>browser,accountStore:new MemoryAccounts(),progressStore:new MemoryProgress(),solverFactory:()=>({solve:async()=>answer})});m.connect({email:'session@example.test',password:'fixture-password',remember});await m.job;return {m,browser};}
function start(m,resume=false){m.run({accountId:m.state.accountId||undefined,email:m.state.account,mode:'modules',moduleIds:ids,resume,settings:{finishActivity:true}});return m.job;}
test('expired session after an accepted answer signs back in and resumes both modules without duplicate submissions',async()=>{
  const {m,browser}=await setup({expireAfterSubmit:true});await start(m);
  assert.equal(m.state.phase,'complete',m.state.message);assert.equal(browser.loginAttempts,2);assert.equal(m.state.count,3);
  assert.equal(new Set(browser.submissions).size,3);assert.deepEqual(m.state.queue.map(item=>item.status),['completed','completed']);
  assert.ok(m.state.events.some(event=>event.type==='session-restored'));assert.ok(!JSON.stringify(m.snapshot()).includes('fixture-password'));
});

test('stuck mouse controls refresh once and resume saved progress without repeating accepted answers',async()=>{
  const {m,browser}=await setup();const quiz=browser.quiz.bind(browser);let blocked=false,refreshes=0;
  const navigate=browser.navigate.bind(browser);
  browser.navigate=async url=>{if(url===browser.currentUrl)refreshes++;await navigate(url);};
  browser.quiz=async message=>{
    if(!blocked&&message.action==='fill'&&browser.accepted.get(ids[0])===1){
      blocked=true;throw Object.assign(new Error('Target still covered'),{code:'MOUSE_TARGET_OBSCURED'});
    }
    return quiz(message);
  };
  await start(m);
  assert.equal(m.state.phase,'complete',m.state.message);assert.equal(m.state.count,3);
  assert.equal(new Set(browser.submissions).size,3);assert.equal(browser.submissions.length,3);
  assert.ok(refreshes>=1);assert.equal(browser.loginAttempts,1);
  assert.equal(m.state.events.filter(e=>e.type==='recovering'&&/Refreshing once/.test(e.message)).length,1);
  assert.deepEqual(m.state.queue.map(item=>item.status),['completed','completed']);
});

test('persistent covered controls have a bounded refresh and keep failed modules available for resume',async()=>{
  const {m,browser}=await setup();const quiz=browser.quiz.bind(browser);let failures=0;
  browser.quiz=async message=>{
    if(message.action==='fill'){failures++;throw Object.assign(new Error('Target still covered'),{code:'MOUSE_TARGET_OBSCURED'});}
    return quiz(message);
  };
  await start(m);
  assert.equal(failures,4);assert.equal(m.state.phase,'paused');assert.equal(m.pausedTasks.length,2);
  assert.equal(m.state.events.filter(e=>e.type==='recovering'&&/Refreshing once/.test(e.message)).length,2);
  assert.equal(browser.submissions.length,0);assert.equal(browser.loginAttempts,1);
  assert.deepEqual(m.state.queue.map(item=>item.status),['needs-attention','needs-attention']);
});

test('selection, disabled-control, and page stalls recover once from saved progress',async()=>{
  for(const code of ['ANSWER_SELECTION_STALLED','MOUSE_TARGET_DISABLED','PAGE_NOT_READY','PAGE_TRANSITION_STALLED']){
    const {m,browser}=await setup();const quiz=browser.quiz.bind(browser);let failed=false;
    browser.quiz=async message=>{
      if(message.action==='fill'&&browser.accepted.get(ids[0])===1&&!failed){failed=true;throw Object.assign(new Error('Recoverable page stall'),{code});}
      return quiz(message);
    };
    await start(m);
    assert.equal(m.state.phase,'complete',code+': '+m.state.message);assert.equal(browser.submissions.length,3);assert.equal(new Set(browser.submissions).size,3);
    assert.equal(m.state.events.filter(e=>e.type==='recovering'&&/Refreshing once/.test(e.message)).length,1);
    assert.deepEqual(m.state.queue.map(q=>q.status),['completed','completed']);
  }
});
test('starting with a stale saved-account session reauthenticates instead of returning early as connected',async()=>{
  const {m,browser}=await setup();browser.expired=true;await start(m);
  assert.equal(m.state.phase,'complete',m.state.message);assert.equal(browser.loginAttempts,2);
});
test('rejected automatic login pauses the whole queue and attempts the password only once',async()=>{
  const {m,browser}=await setup({expireAfterSubmit:true,failLogin:true});await start(m);
  assert.equal(browser.loginAttempts,2);assert.equal(m.state.phase,'paused');assert.equal(m.snapshot().connected,false);
  assert.deepEqual(m.state.queue.map(item=>item.status),['paused','pending']);assert.equal(m.pausedTasks.length,2);
  assert.match(m.state.message,/remaining queue is saved/);
  assert.equal((await m.progressStore.get(m.state.account)).queue[1].status,'pending');
});
test('session-only login pauses with an actionable message and retains pending modules',async()=>{
  const {m,browser}=await setup({expireAfterSubmit:true},false);await start(m);
  assert.equal(browser.loginAttempts,1);assert.match(m.state.message,/Add a password/);assert.equal(m.state.queue[1].status,'pending');
});
test('verification screens never trigger automated credential retries',async()=>{
  const {m,browser}=await setup({expireAfterSubmit:true,challenge:true});await start(m);
  assert.equal(browser.loginAttempts,1);assert.equal(m.state.sessionStatus,'verification-required');assert.equal(m.snapshot().connected,false);assert.equal(m.state.queue[1].status,'pending');
});
test('Stop during automatic sign-in preserves the unfinished queue',async()=>{
  let m;const setupResult=await setup({expireAfterSubmit:true,onReconnect:async signal=>{m.stop();signal.throwIfAborted();}});m=setupResult.m;await start(m);
  assert.equal(m.state.phase,'paused');assert.match(m.state.message,/Stopped/);assert.deepEqual(m.state.queue.map(item=>item.status),['paused','pending']);
});
test('repeated logout loops are bounded and never fail every remaining module',async()=>{
  const {m,browser}=await setup({expireEveryModule:true});await start(m);
  assert.equal(browser.loginAttempts,3);assert.equal(m.state.phase,'paused');assert.deepEqual(m.state.queue.map(item=>item.status),['paused','pending']);
});
test('updating an expired saved login verifies and encrypts the new password without clearing its queue',async()=>{
  const {m,browser}=await setup();m.state.queue=ids.map(id=>({id,status:'pending',title:id}));browser.expired=true;
  m.connect({accountId:m.state.accountId,email:m.state.account,password:'updated-fixture',remember:true});await m.job;
  assert.equal(m.snapshot().connected,true);assert.equal(m.state.queue.length,2);
  assert.equal((await m.accountStore.get(m.state.accountId)).secret.password,'updated-fixture');
  assert.ok(!JSON.stringify(m.snapshot()).includes('updated-fixture'));
});
test('a reported disabled account never retries saved credentials and keeps the existing queue',async()=>{
  const {m,browser}=await setup();m.state.queue=ids.map(id=>({id,status:'pending',title:id}));m.state.sessionStatus='account-disabled';browser.expired=true;
  await start(m,true);assert.equal(browser.loginAttempts,1);assert.equal(m.snapshot().connected,false);assert.equal(m.state.sessionStatus,'account-disabled');assert.equal(m.state.queue.length,2);assert.match(m.state.message,/account is disabled/);
});
