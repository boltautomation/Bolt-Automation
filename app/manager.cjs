const {Browser}=require('./browser.cjs');
const activities=require('./activities.cjs');
const {OllamaSolver,DEFAULT_MODEL,ollamaUrl,pullModel}=require('./ollama.cjs');
const {AccountStore}=require('./accounts.cjs');
const {ProgressStore}=require('./progress.cjs');
const {SessionExpiredError,SessionRecoveryError}=require('./session.cjs');
require('../extension/core.js');require('../extension/runner.js');
const C=globalThis.ChatterCore;
const initial=()=>({phase:'idle',sessionStatus:'unknown',account:'',accountId:'',loginEmail:'',accountWarning:'',modules:[],modulesStatus:'idle',modulesError:'',selectedModuleIds:[],history:[],queue:[],queueIndex:0,events:[],message:'Choose an account and an activity to begin.',count:0,taskCount:0});
class Manager {
  constructor({browserFactory=()=>new Browser(),solverFactory=options=>new OllamaSolver(options),signInUrl,accountStore=new AccountStore(),progressStore=new ProgressStore()}={}) {
    Object.assign(this,{browserFactory,solverFactory,signInUrl,accountStore,progressStore});this.state=initial();this.browser=null;this.controller=null;this.job=null;this.batchOffset=0;
  }
  snapshot(){return {...this.state,connected:Boolean(this.browser&&this.browser.alive!==false&&this.state.account&&!['expired','verification-required','account-disabled'].includes(this.state.sessionStatus)),browserOpen:Boolean(this.browser&&this.browser.alive!==false),busy:Boolean(this.job||this.closing)};}
  begin(task){
    if(this.job||this.closing)throw Object.assign(new Error('A task is already running. Stop it before switching accounts or starting another run.'),{status:409});
    this.controller=new AbortController();this.state.error=false;const signal=this.controller.signal;
    this.job=Promise.resolve().then(()=>task(signal)).catch(error=>{this.state.phase='paused';this.state.error=!signal.aborted;this.state.message=signal.aborted?'Stopped. Your remaining modules are still queued.':error.message;}).finally(()=>{this.job=null;this.controller=null;});
  }
  event(detail){
    if(detail.type==='submitted'){
      this.state.phase='running';this.state.taskCount=detail.count;this.state.count=this.batchOffset+detail.count;
      this.state.message=detail.randomOpinion?'Submitted a random opinion response. Continuing…':detail.survey?'Survey answered. Continuing…':`Submitted ${this.state.count} answer(s).${detail.guessed?' Includes an unverified guess.':''}`;
      const item=this.state.queue[this.state.queueIndex];if(item&&item.total)item.answered=Math.min(item.total,(this.taskStartAnswered||0)+detail.count);
      if(this.state.account)this.checkpointJob=this.progressStore.queue(this.state.account,structuredClone(this.state.queue)).catch(()=>{this.state.accountWarning='The latest queue checkpoint could not be saved.';});
    }
    if(detail.type==='research'){this.state.phase='running';this.state.message=`Researching question ${detail.count+1}…`;}
    if(detail.type==='pacing'){this.state.phase='running';this.state.message=`${detail.interest?'Interest question cooldown':'Thinking cooldown'}: ${detail.delayMs/1000}s before continuing…`;}
    if(detail.type==='evidence'){this.state.phase='running';this.state.message=detail.checking?'Cross-checking the answer against the sources…':'Research read. Generating the answer…';}
    if(detail.type==='guessing'){this.state.phase='running';this.state.message='Research is stuck. Making an unverified guess and continuing…';}
    if(detail.type==='random-opinion'){this.state.phase='running';this.state.message='Choosing a random opinion response…';}
    if(detail.type==='recovering'){this.state.phase='recovering';this.state.message=detail.message;}
    this.state.events.push({...detail,at:new Date().toISOString(),task:this.state.activity?.title});if(this.state.events.length>200)this.state.events.shift();
  }
  validateCredentials(data){
    if(data.accountId)return String(data.email||'').trim();
    const email=String(data.email||'').trim();
    if(!email||email.length>320||!email.includes('@'))throw Object.assign(new Error('Enter a valid email address.'),{status:400});
    if(!this.browser||this.browser.alive===false||this.state.account.toLowerCase()!==email.toLowerCase())if(typeof data.password!=='string'||!data.password||data.password.length>2000)throw Object.assign(new Error('Enter the password for this account.'),{status:400});
    return email;
  }
  async persistAccount(password,force=false){
    if(!this.state.account||!this.browser||this.browser.alive===false||(!force&&!this.state.accountId))return;
    try{await this.checkSession();}catch(error){if(error.code==='SESSION_EXPIRED')return;throw error;}
    const session=this.browser.snapshotSession?await this.browser.snapshotSession():undefined;
    const record=await this.accountStore.save({id:this.state.accountId||undefined,email:this.state.account,secret:{...(password?{password}:{}),...(session?{session}:{})}});
    this.state.accountId=record.id;this.state.accountWarning='';return record;
  }
  async persistQuietly(password){try{await this.persistAccount(password);}catch{this.state.accountWarning='The saved session could not be refreshed. Your saved password is unchanged.';}}
  async checkSession(signal){
    signal?.throwIfAborted();
    try{
      if(!this.browser||this.browser.alive===false)throw new SessionExpiredError('The automation browser disconnected. Reconnecting…');
      if(this.browser.assertSession)await this.browser.assertSession(this.signInUrl);
      else if(!this.browser.authenticated(await this.browser.info(),this.signInUrl))throw new SessionExpiredError();
      this.state.sessionStatus='verified';
    }catch(error){if(error.accountDisabled)this.state.sessionStatus='account-disabled';else if(error.code==='SESSION_EXPIRED'){if(this.state.sessionStatus==='account-disabled')throw new SessionRecoveryError('This account is disabled. Contact ChatterHigh to resolve it before signing in manually. Your remaining queue is saved.');this.state.sessionStatus='expired';}throw error;}
  }
  async recoverSession(signal,password=''){
    if(this.state.sessionStatus==='account-disabled')throw new SessionRecoveryError('This account is disabled. Contact ChatterHigh to resolve it before signing in manually. Your remaining queue is saved.');
    this.state.sessionStatus='expired';let saved;
    try{
      if(this.browser?.alive!==false&&this.browser){const info=await this.browser.info();if(info.accountDisabled){this.state.sessionStatus='account-disabled';throw new SessionRecoveryError('ChatterHigh has disabled this account. Contact ChatterHigh to resolve it. Your remaining queue is saved.');}if(info.challenge){this.state.sessionStatus='verification-required';throw new SessionRecoveryError('ChatterHigh needs verification in the browser. Your remaining queue is saved; finish verification, then Resume.');}}
      if(this.state.accountId){saved=await this.accountStore.get(this.state.accountId);if(saved.email.toLowerCase()!==this.state.account.toLowerCase())throw new SessionRecoveryError('The saved account does not match this queue. Select the original account to resume.');}
      if(!password)password=saved?.secret.password||'';
      if(!password)throw new SessionRecoveryError('Your ChatterHigh session expired. Add a password to this saved account to enable automatic sign-in. Your remaining queue is saved.');
      this.sessionRecoveries=(this.sessionRecoveries||[]).filter(time=>Date.now()-time<10*60*1000);
      if(this.sessionRecoveries.length>=3)throw new SessionRecoveryError('ChatterHigh keeps ending this session. The remaining queue is saved; check the account in the browser before resuming.');
      this.sessionRecoveries.push(Date.now());this.event({type:'recovering',message:'Session expired. Signing back into the same account and restoring the queue…',count:this.state.taskCount});this.state.phase='reconnecting';
      signal.throwIfAborted();
      if(!this.browser||this.browser.alive===false){if(this.browser)await this.browser.close();this.browser=this.browserFactory();await this.browser.launch(signal);}
      await this.browser.login(this.state.account,password,signal,this.signInUrl);
      await this.checkSession(signal);await this.persistQuietly(password);
      this.event({type:'session-restored',message:'Signed back in. Continuing the interrupted module.',count:this.state.taskCount});
    }catch(error){signal.throwIfAborted();if(error.accountDisabled)this.state.sessionStatus='account-disabled';if(error.code==='SESSION_RECOVERY_REQUIRED')throw error;throw new SessionRecoveryError('Automatic sign-in could not finish. Check the saved password or finish verification in the browser, then Resume. Your remaining queue is saved.');}
    finally{password='';if(saved?.secret)saved.secret.password='';}
  }
  async ensureSession(signal,password){try{await this.checkSession(signal);}catch(error){if(error.code!=='SESSION_EXPIRED')throw error;await this.recoverSession(signal,password);}}
  async ensureAccount(data,signal){
    let saved;
    if(data.accountId){
      if(data.accountId===this.state.accountId&&this.browser&&this.browser.alive!==false){data.email=this.state.account;try{await this.ensureSession(signal,data.password);}finally{data.password='';}return;}
      saved=await this.accountStore.get(data.accountId);
      if(data.email&&String(data.email).trim().toLowerCase()!==saved.email.toLowerCase())throw new Error('Use Add account to sign in with a different email.');
      data.email=saved.email;if(!data.password)data.password=saved.secret.password||'';
    }
    const email=this.validateCredentials(data);this.state.loginEmail=email;
    if(this.browser&&this.browser.alive!==false&&this.state.account.toLowerCase()===email.toLowerCase()){
      await this.ensureSession(signal,data.password);
      if(data.remember){try{await this.persistAccount(data.password,true);}catch{this.state.accountWarning='Sign-in worked, but the login could not be saved.';}}
      data.password='';return;
    }
    await this.persistQuietly();if(this.browser)await this.browser.close();
    this.browser=null;this.pausedTasks=[];this.batchOffset=0;this.state={...initial(),phase:'signing-in',loginEmail:email,accountId:data.accountId||'',message:'Signing in…'};
    this.pendingAccount=email;this.pendingRemember=Boolean(data.remember||data.accountId);
    this.browser=this.browserFactory();
    try{
      await this.browser.launch(signal);
      let restored=false;
      if(saved?.secret.session&&this.browser.restoreSession)try{restored=await this.browser.restoreSession(saved.secret.session,signal);}catch{signal.throwIfAborted();}
      if(!restored){if(!data.password)throw new Error('This saved session expired. Enter the password once to update the saved login.');await this.browser.login(email,data.password,signal,this.signInUrl);}
      signal.throwIfAborted();this.state.account=email;this.state.sessionStatus='verified';this.pendingAccount='';
      if(this.pendingRemember)try{await this.persistAccount(data.password,true);}catch{this.state.accountWarning='Signed in, but this login could not be saved. Try Save current login.';}
      this.state.phase='ready';this.state.message='Signed in.';
    }finally{data.password='';if(saved?.secret)saved.secret.password='';}
  }
  connect(data){this.validateCredentials(data);this.begin(async signal=>{await this.ensureAccount(data,signal);await this.loadModules(signal);this.state.phase='ready';this.state.message='Signed in. Choose the activities you want to run.';});}
  async loadModules(signal){
    this.state.phase='loading-modules';this.state.modulesStatus='loading';this.state.modulesError='';this.state.message='Loading your modules…';
    try{
      this.state.modules=await activities.modules(this.browser,signal);
      const progress=await this.progressStore.sync(this.state.account,this.state.modules);
      this.state.history=Object.values(progress.items);this.state.selectedModuleIds=progress.selected.filter(id=>this.state.modules.some(module=>module.id===id&&!module.completed));
      this.state.modules=this.state.modules.map(module=>({...module,lastStatus:progress.items[module.id]?.status}));
      if(!this.state.queue.length&&progress.queue.length){this.state.queue=progress.queue.map(item=>{const module=this.state.modules.find(module=>module.id===item.id);return {...item,answered:module?.answered??item.answered,total:module?.total??item.total,status:module?.completed?'completed':item.status==='running'?'paused':item.status};});this.pausedTasks=this.state.queue.filter(item=>item.status!=='completed').map(item=>({...item,...this.state.modules.find(module=>module.id===item.id),mode:item.id.startsWith('daily:')?'daily':'modules',completed:false}));}
      this.state.modulesStatus='loaded';if(this.browser.catalogPartial)this.state.modulesError='Some courses did not load. Reload to retry.';
    }catch(error){this.state.modulesStatus='error';this.state.modulesError=error.message;signal.throwIfAborted();}
  }
  refreshModules(){if(!this.state.account)throw Object.assign(new Error('Sign in before loading modules.'),{status:400});this.begin(async signal=>{await this.loadModules(signal);this.state.phase='ready';this.state.message=this.state.modules.length?'Module list updated.':'No modules loaded. Check the catalog message and retry.';});}
  confirmLogin(data){if(!this.browser||!this.pendingAccount)throw new Error('Start a sign-in first.');this.begin(async signal=>{if(!this.browser.authenticated(await this.browser.info(),this.signInUrl))throw new Error('Finish signing in in the automation browser first.');this.state.account=this.pendingAccount;this.pendingAccount='';if(this.pendingRemember)await this.persistAccount(undefined,true).catch(()=>{this.state.accountWarning='Login could not be saved.';});await this.loadModules(signal);this.state.phase='ready';this.state.message='Signed in.';});}
  saveCurrent(data={}){if(!this.state.account)throw new Error('Sign in before saving this account.');this.begin(async()=>{this.state.phase='saving-account';try{await this.persistAccount(data.password,true);this.state.phase='ready';this.state.message='Account saved. Select it anytime from Accounts.';}finally{data.password='';}});}
  async removeAccount(id){if(this.job)throw new Error('Stop the running activity first.');await this.accountStore.remove(id);if(this.state.accountId===id)this.state.accountId='';}
  async saveSelection(ids){if(!this.state.account)throw new Error('Sign in first.');const valid=[...new Set(ids)].filter(id=>this.state.modules.some(module=>module.id===id));this.state.selectedModuleIds=valid;await this.progressStore.selection(this.state.account,valid);}
  dailyId(){return `daily:${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date())}`;}
  async outcome(task,status,error){
    if(this.checkpointJob)await this.checkpointJob;
    const item=this.state.queue[this.state.queueIndex];if(item){item.status=status;if(error)item.error=error;else delete item.error;}
    if(task.mode==='modules')this.state.modules=this.state.modules.map(module=>module.id===task.id?{...module,completed:status==='completed',answered:item?.answered??module.answered,lastStatus:status}:module);
    const record=await this.progressStore.update(this.state.account,task.id,{title:task.title,course:task.course||'',status,answered:status==='completed'&&task.total?task.total:item?.answered||this.state.taskCount,total:task.total||null,error:status==='completed'?null:error||null,...(status==='completed'?{completedAt:new Date().toISOString()}:{})});
    this.state.history=[...this.state.history.filter(item=>item.id!==record.id),record];
    await this.progressStore.queue(this.state.account,this.state.queue);
  }
  run(data){
    if(!['daily','modules'].includes(data.mode))throw new Error('Choose Daily Quiz or Modules.');
    const config=C.settings({model:DEFAULT_MODEL,doubleCheck:true,finishActivity:data.settings?.maxQuestions===undefined,...data.settings}),baseUrl=ollamaUrl(data.ollamaUrl);
    if(!data.resume)this.validateCredentials(data);
    if(data.resume&&!this.browser)throw new Error('Sign in first.');
    if(data.resume&&data.accountId!==this.state.accountId&&String(data.email||'').trim().toLowerCase()!==(this.state.account||this.pendingAccount||'').toLowerCase())throw new Error('Continue uses the account already in the browser. Sign in to switch accounts.');
    if(data.activityUrl)activities.activityUrl(this.browser||this.browserFactory(),data.activityUrl);
    this.begin(async signal=>{
      const solver=this.solverFactory({baseUrl,model:config.model,doubleCheck:config.doubleCheck,sourceLoader:(question,sourceSignal,options)=>this.browser.researchSources(question,sourceSignal,options)});
      let modelFailure;
      if(solver.check){this.state.message='Checking the local model…';try{await solver.check(signal);}catch(error){signal.throwIfAborted();if(!config.guessWhenStuck&&!config.randomOpinions)throw error;modelFailure=error;this.state.message=config.guessWhenStuck?'Local AI unavailable. Continuing with unverified guesses.':'Local AI unavailable. Recognized opinion questions can still use random responses.';}}
      if(data.resume){await this.ensureSession(signal);if(!this.state.account)this.state.account=this.pendingAccount;}
      else await this.ensureAccount(data,signal);
      let tasks;
      if(data.resume&&this.pausedTasks?.length)tasks=this.pausedTasks;
      else if(data.resume&&this.state.activity)tasks=[{...this.state.activity,id:this.state.activity.id||this.state.activity.moduleId||this.dailyId(),url:this.state.activity.url,completed:false}];
      else if(data.mode==='modules'&&!data.activityUrl){
        if(this.state.modulesStatus!=='loaded')await this.loadModules(signal);
        const ids=[...new Set(Array.isArray(data.moduleIds)?data.moduleIds:[data.moduleId].filter(Boolean))].slice(0,1000);
        tasks=ids.map(id=>this.state.modules.find(module=>module.id===id)).filter(Boolean).map(module=>({...module,mode:'modules'}));
        if(!tasks.length){this.state.phase='ready';this.state.message='Check the modules you want to run, then press Start.';return;}
        await this.saveSelection(tasks.map(task=>task.id));
      }else tasks=[{id:data.mode==='daily'?this.dailyId():data.activityUrl,mode:data.mode,url:data.activityUrl||'',title:data.mode==='daily'?'Daily Quiz':'Selected module',completed:false}];
      this.state.queue=tasks.map(task=>({id:task.id,title:task.title,course:task.course||'',total:task.total||null,answered:task.answered||0,status:task.completed?'completed':'pending'}));
      this.state.count=0;this.state.events=[];this.batchOffset=0;this.pausedTasks=[];let attention=0;
      await this.progressStore.queue(this.state.account,this.state.queue);
      for(let index=0;index<tasks.length;index++){
        const task=tasks[index];this.state.queueIndex=index;if(task.completed)continue;
        this.state.activity={...task,moduleId:task.mode==='modules'?task.id:'',mode:task.mode};this.state.taskCount=0;this.taskStartAnswered=task.answered||0;
        this.state.queue[index].status='running';this.state.phase='opening';this.state.message=`Opening ${task.title}…`;
        try{
          signal.throwIfAborted();
          const taskUrl=task.url||(/^https?:/.test(task.id)?task.id:'');
          const currentUrl=this.browser.url?await this.browser.url():taskUrl;
          const scope=taskUrl.split('?')[0].replace(/\/question\/?$/,'');
          const currentTask=data.resume&&index===0&&(!scope||currentUrl.startsWith(scope));
          let result,recovered=false,layoutRecoveries=0;
          for(let attempt=0;;attempt++){
            const offset=this.state.taskCount;
            try{
              await this.ensureSession(signal);
              if(!currentTask||recovered)await activities.openActivity(this.browser,{mode:task.mode,module:task.mode==='modules'?task:null,url:task.url,config},signal);
              this.state.phase='running';
              const runner=new globalThis.ChatterRunner({transport:message=>{signal.throwIfAborted();return this.browser.quiz(message,signal,code=>this.event({type:'recovering',message:code==='RESEARCH_RECHECK'?'Submit is still locked. Revisiting Research and checking the same answers…':['CONTROL_NOT_READY','MOUSE_TARGET_DISABLED'].includes(code)?'Waiting for the page to enable the control…':code==='MOUSE_COORDINATE_MISMATCH'?'Chrome’s mouse coordinates do not match the intended control. Recalibrating before clicking…':'A control is blocked or moved. Adjusting the cursor and retrying automatically…',count:this.state.taskCount}));},prepareResearch:typeof this.browser.prepareResearch==='function'?(...args)=>this.browser.prepareResearch(...args):undefined,solve:(...args)=>{if(modelFailure)throw modelFailure;return solver.solve(...args);},guess:typeof solver.guess==='function'?(...args)=>{if(modelFailure)throw modelFailure;return solver.guess(...args);}:undefined,onEvent:detail=>this.event({...detail,...(typeof detail.count==='number'?{count:offset+detail.count}:{})})});
              result=await runner.run(config,signal);result.count+=offset;break;
            }catch(error){
              signal.throwIfAborted();
              if(error.code!=='SESSION_EXPIRED'&&error.code!=='SESSION_RECOVERY_REQUIRED')try{await this.checkSession(signal);}catch(sessionError){if(sessionError.code==='SESSION_EXPIRED')error=sessionError;}
              if(['MOUSE_TARGET_OBSCURED','MOUSE_TARGET_MOVED','MOUSE_TARGET_CHANGED','MOUSE_COORDINATE_MISMATCH','MOUSE_TARGET_DISABLED','ANSWER_SELECTION_STALLED','PAGE_NOT_READY','PAGE_TRANSITION_STALLED'].includes(error.code)&&layoutRecoveries<1){
                layoutRecoveries++;
                this.event({type:'recovering',message:'The page is still stuck. Refreshing once and resuming from saved progress…',count:this.state.taskCount});
                await this.browser.navigate(activities.activityUrl(this.browser,await this.browser.url()),signal);
                recovered=true;continue;
              }
              if(error.code!=='SESSION_EXPIRED')throw error;
              if(attempt>=2)throw new SessionRecoveryError('The session expired repeatedly in this module. Your remaining queue is saved; check the account, then Resume.');
              await this.recoverSession(signal);recovered=true;
            }
          }
          this.batchOffset+=result.count;this.state.count=this.batchOffset;
          if(result.reason!=='complete'){await this.outcome(task,'paused');this.pausedTasks=tasks.slice(index);this.state.phase='paused';this.state.message=result.message;return;}
          if(task.total)this.state.queue[index].answered=task.total;
          await this.outcome(task,'completed');
        }catch(error){
          if(signal.aborted){await this.outcome(task,'paused');this.pausedTasks=[...new Map([...this.pausedTasks,...tasks.slice(index)].map(item=>[item.id,item])).values()];throw error;}
          if(error.code==='SESSION_RECOVERY_REQUIRED'||error.code==='SESSION_EXPIRED'){
            await this.outcome(task,'paused',error.message);this.pausedTasks=[...new Map([...this.pausedTasks,...tasks.slice(index)].map(item=>[item.id,item])).values()];this.state.phase='paused';this.state.error=true;this.state.message=error.message;return;
          }
          attention++;this.batchOffset+=this.state.taskCount;this.state.count=this.batchOffset;await this.outcome(task,'needs-attention',error.message);this.pausedTasks.push(task);
          this.state.events.push({type:'task-error',task:task.title,message:error.message,...(error.details?{details:error.details}:{}),at:new Date().toISOString()});
        }
      }
      this.state.queueIndex=tasks.length;this.state.phase=attention?'paused':'complete';this.state.error=Boolean(attention);
      this.state.message=attention?`${tasks.length-attention} activities completed; ${attention} need attention.`:tasks.length===1?'Quiz completed.':`All ${tasks.length} selected activities completed.`;
      this.state.selectedModuleIds=this.state.selectedModuleIds.filter(id=>!this.state.modules.find(module=>module.id===id)?.completed);await this.progressStore.selection(this.state.account,this.state.selectedModuleIds);
      await this.persistQuietly();
    });
  }
  stop(){this.controller?.abort(new DOMException('Stopped by you.','AbortError'));}
  pull(data){const model=String(data.model||DEFAULT_MODEL),baseUrl=ollamaUrl(data.url);this.begin(async signal=>{this.state.phase='downloading';await pullModel(model,baseUrl,{signal,onProgress:progress=>{this.state.message=`${model}: ${progress.status}${progress.total?` · ${Math.floor((progress.completed||0)/progress.total*100)}%`:''}`;}});this.state.phase=this.state.account?'ready':'idle';this.state.message=`${model} downloaded.`;});}
  async disconnect(){if(this.closing)return this.closing;this.closing=(async()=>{this.stop();if(this.job)await this.job;await this.persistQuietly();if(this.browser)await this.browser.close();this.browser=null;this.pendingAccount='';this.pausedTasks=[];this.state=initial();})();try{await this.closing;}finally{this.closing=null;}}
}
module.exports={Manager};
