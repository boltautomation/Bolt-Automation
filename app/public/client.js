/* A view-only first-launch tour. It never submits a form or changes preferences. */
(() => {
  const key='bolt-onboarding-v1';
  globalThis.BoltTour={init({navigate,getState,setSidebar}){
    const $=id=>document.getElementById(id),dialog=$('quick-tour'),card=$('tour-card'),main=document.querySelector('.workspace > main');
    const steps=[
      {title:'Find your flow.',eyebrow:'WELCOME TO BOLT',description:'Bolt is a personal study and research workspace. Explore your settings, review sources, and use automation only where you have permission.',art:true,tip:'About a minute · Skip anytime · Replay from Quick tour'},
      {title:'Your account, ready when you are.',eyebrow:'YOUR WORKSPACE',tab:'accounts',target:'#add-account',icon:'♙',description:'Add your site login here once. Your saved accounts, progress, and history stay separate, so switching is simple.',details:[['Accounts','Add or manage a saved login.'],['Sidebar','Hover over the icons to expand it and switch accounts.']],tip:'You can explore this tour without signing in.'},
      {title:'Choose what to finish.',eyebrow:'AUTO BOT',tab:'autobot',target:'.modes',icon:'◈',description:'Run the Daily Quiz, or choose Modules to build a queue. Bolt works through the selected activities one after another.',details:[['Start','Begin your selected activity or queue.'],['Stop & Resume','Pause safely, then continue unfinished work.']],tip:'The tour will never start or stop a run.'},
      {title:'Set your own pace.',eyebrow:'SETTINGS · TIMING',tab:'settings',target:'#timing-settings',compactTarget:'#timing-settings .inline',icon:'◷',description:'Answer speed is the minimum wait after Research opens. Loading and AI work happen during that time. Interest question cooldown is a separate pause for interest and survey pages.',timing:true,tip:'Changes apply the next time you Start or Resume.'},
      {title:'Surveys, your way.',eyebrow:'SETTINGS · RESPONSES',tab:'settings',target:'#survey-settings',compactTarget:'#surveyMode',icon:'≋',description:'Choose fixed No / lowest-interest answers, or let Bolt pick random survey responses. Turn automatic surveys off whenever you want to answer them yourself.',details:[['Fixed defaults','No for awareness, lowest rating for interest.'],['Random responses','A choice from the displayed survey options.']],tip:'Opinion questions have their own option just below.'},
      {title:'You choose how much to automate.',eyebrow:'SETTINGS · CONTROL',tab:'settings',target:'#automation-settings',compactTarget:'#automation-settings .check',icon:'✧',description:'Keep automatic submission on for a hands-off run, or turn it off to review filled answers first. Random opinions and Guess when stuck are separate options.',details:[['Random opinions','Picks a displayed response for personal opinions.'],['Guess when stuck','Uses a labeled, unverified guess after recovery attempts.']],tip:'A guess can be wrong. You can switch this option off.'},
      {title:'Make it yours. Then save.',eyebrow:'SETTINGS · ALL SET',tab:'settings',target:'#save-settings',icon:'✓',description:'Save settings keeps your preferences on this computer. Your saved choices apply on the next Start or Resume, and carry across app restarts.',details:[['Local model','At the top of Settings, check or choose your Ollama model.'],['Advanced tools','Page controls and PDFs & saved answers live below.']],tip:'Saving settings does not start an activity.'},
      {title:'Keep the whole picture in view.',eyebrow:'PROGRESS & HISTORY',tab:'autobot',target:'.metrics',icon:'◷',description:'Follow the queue here and open Answer details for sources and explanations. History in the sidebar keeps finished activities and anything needing attention.',details:[['Run progress','What is running, waiting, or finished.'],['History','Progress for the selected account.']],tip:'You’re ready. Quick tour is always in the top bar.'}
    ];
    let index=0,sessionSeen=false,autoTimer=null,layoutFrame=null,returnTab='autobot',returnScroll=0,returnFocus=null,revision=0;
    const text=(tag,className,value)=>{const e=document.createElement(tag);e.className=className;e.textContent=value;return e;};
    const hasSeen=()=>{try{return Boolean(localStorage.getItem(key));}catch{return sessionSeen;}};
    const markSeen=status=>{sessionSeen=true;try{if(localStorage.getItem(key)!=='completed'||status==='completed')localStorage.setItem(key,status);}catch{}};
    function configureCompact(){
      const step=steps[index],base=step.target?document.querySelector(step.target):null,vw=document.documentElement.clientWidth;
      const r=base?.getBoundingClientRect(),width=Math.min(386,vw-32);
      const sideRoom=r?Math.max(r.left-16,vw-r.right-16):Infinity;
      dialog.dataset.compact=String(Boolean(step.target)&&(vw<780||window.innerHeight<680||Boolean(step.compactTarget&&sideRoom<width+20)));
    }
    function activeTarget(){const step=steps[index];return document.querySelector(dialog.dataset.compact==='true'&&step.compactTarget?step.compactTarget:step.target||'#no-tour-target');}
    function layout(){
      if(!dialog.open)return;
      configureCompact();const target=activeTarget();
      const vw=document.documentElement.clientWidth,vh=window.innerHeight,pad=16,gap=20;
      let rect=null;
      if(target&&target.getClientRects().length){
        const r=target.getBoundingClientRect(),viewport=main.getBoundingClientRect();
        const left=Math.max(viewport.left+8,r.left-7),top=Math.max(viewport.top+6,r.top-7),right=Math.min(viewport.right-8,r.right+7),bottom=Math.min(vh-pad,r.bottom+7);
        if(right>left&&bottom>top)rect={left,top,right,bottom,width:right-left,height:bottom-top};
      }
      const hole=$('tour-hole'),ring=$('tour-focus-ring');
      ring.hidden=!rect;
      for(const [name,value]of Object.entries(rect?{x:rect.left,y:rect.top,width:rect.width,height:rect.height}:{width:0,height:0}))hole.setAttribute(name,String(value));
      if(rect)Object.assign(ring.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
      let bounds=card.getBoundingClientRect(),w=bounds.width,h=bounds.height;
      let x=(vw-w)/2,y=(vh-h)/2,maxHeight=vh-pad*2;
      if(rect){
        if(vw>=760&&rect.right+gap+w<=vw-pad){x=rect.right+gap;y=rect.top;}
        else if(vw>=760&&rect.left-gap-w>=pad){x=rect.left-gap-w;y=rect.top;}
        else {
          const below=vh-pad-rect.bottom-gap,above=rect.top-gap-pad;
          const useBelow=below>=h||above<h&&below>=above;
          maxHeight=Math.max(0,Math.min(maxHeight,useBelow?below:above));
          card.style.maxHeight=`${maxHeight}px`;h=card.getBoundingClientRect().height;
          x=(vw-w)/2;y=useBelow?rect.bottom+gap:rect.top-gap-h;
        }
      }
      card.style.maxHeight=`${maxHeight}px`;h=card.getBoundingClientRect().height;
      if(!rect)y=(vh-h)/2;
      card.style.left=`${Math.max(pad,Math.min(x,vw-w-pad))}px`;
      card.style.top=`${Math.max(pad,Math.min(y,vh-h-pad))}px`;
    }
    function queueLayout(){if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;layout();});}
    function revealTarget(){
      configureCompact();const target=activeTarget();
      document.querySelectorAll('.tour-anchor').forEach(e=>e.classList.remove('tour-anchor'));
      target?.classList.add('tour-anchor');
      target?.scrollIntoView({block:dialog.dataset.compact==='true'?'start':'center',inline:'nearest',behavior:'instant'});
    }
    function renderStep(){
      const step=steps[index],version=++revision;
      if(step.tab)navigate(step.tab);
      setSidebar(false);
      dialog.dataset.step=String(index);
      $('tour-eyebrow').textContent=step.eyebrow;$('tour-counter').textContent=index===0?'YOUR QUICK START':`${index} of ${steps.length-1}`;
      $('tour-title').textContent=step.title;$('tour-description').textContent=step.description;$('tour-tip').textContent=index===1&&getState().busy?'A run is active. Account controls become available when it finishes or stops.':step.tip;
      const art=$('tour-art');art.replaceChildren();art.classList.toggle('welcome-art',Boolean(step.art));
      if(step.art){
        const orbit=text('div','tour-orbit','');const logo=document.createElement('img');logo.src='/assets/bolt.png?v=logo-lime-v2';logo.alt='';orbit.append(logo);
        for(const [i,label]of ['Your workspace','Your pace','Your progress'].entries()){const chip=text('span',`tour-orbit-chip chip-${i}`,label);orbit.append(chip);}art.append(orbit);
      }else art.append(text('span','tour-step-icon',step.icon));
      const details=$('tour-details');details.replaceChildren();
      for(const [title,description]of step.details||[]){const row=text('div','tour-detail','');row.append(text('strong','',title),text('span','',description));details.append(row);}
      if(step.timing){for(const [title,id]of [['After Research','answerDelayMs'],['Interest questions','interestDelayMs']]){const row=text('div','tour-timing',''),seconds=Number($(id).value)/1000;row.append(text('span','',title),text('strong','',seconds?`${seconds}s`:'No pause'));details.append(row);}}
      const progress=$('tour-progress');progress.replaceChildren();
      for(let i=0;i<steps.length;i++){const dot=text('span',i===index?'current':i<index?'complete':'','');dot.setAttribute('aria-hidden','true');progress.append(dot);}
      progress.setAttribute('aria-label',`Step ${index+1} of ${steps.length}`);
      $('tour-back').hidden=index===0;$('tour-skip').hidden=index===steps.length-1;
      $('tour-next').replaceChildren(document.createTextNode(index===0?'Let’s explore':index===steps.length-1?'Got it, let’s go':'Next'),text('span','',index===steps.length-1?'✓':'→'));
      $('tour-body').scrollTop=0;
      revealTarget();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(!dialog.open||version!==revision)return;
        layout();$('tour-title').focus({preventScroll:true});
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:.65,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'});
      }));
    }
    function close(status='skipped'){
      if(!dialog.open)return;
      document.querySelectorAll('.tour-anchor').forEach(e=>e.classList.remove('tour-anchor'));
      markSeen(status);revision++;dialog.close();setSidebar(false);navigate(returnTab);main.scrollTop=returnScroll;
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    }
    function open(){
      clearTimeout(autoTimer);autoTimer=null;if(dialog.open)return;
      returnTab=document.querySelector('[data-tab][aria-current=page]')?.dataset.tab||'autobot';returnScroll=main.scrollTop;returnFocus=document.activeElement;
      index=0;dialog.showModal();renderStep();
    }
    $('open-tour').addEventListener('click',open);$('replay-tour').addEventListener('click',open);
    $('tour-close').addEventListener('click',()=>close());$('tour-skip').addEventListener('click',()=>close());
    $('tour-back').addEventListener('click',()=>{if(index){index--;renderStep();}});
    $('tour-next').addEventListener('click',()=>{if(index===steps.length-1)close('completed');else{index++;renderStep();}});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='ArrowRight'){event.preventDefault();$('tour-next').click();}
      if(event.key==='ArrowLeft'&&index){event.preventDefault();$('tour-back').click();}
    });
    window.addEventListener('resize',()=>{if(dialog.open)revealTarget();queueLayout();});main.addEventListener('scroll',queueLayout,{passive:true});
    new ResizeObserver(queueLayout).observe(card);
    return {maybeStart(){if(sessionSeen||hasSeen()||autoTimer||dialog.open||getState().busy)return;autoTimer=setTimeout(()=>{autoTimer=null;if(sessionSeen||hasSeen()||getState().busy)return;open();},350);}};
  }};
})();

(() => {
  const C=globalThis.ChatterCore,$=id=>document.getElementById(id),token=document.querySelector('meta[name=app-token]').content;
  const labels={autobot:'Auto Bot',accounts:'Accounts',history:'History',settings:'Settings'};
  const sidebar=document.querySelector('.sidebar'),sidebarToggle=$('sidebar-toggle');
  let sidebarHovered=false,sidebarPinned=false,sidebarTourOpen=false;
  function syncSidebar(){
    const open=sidebarTourOpen||sidebarHovered||sidebarPinned||Boolean(sidebar.querySelector(':focus-visible'));
    sidebar.dataset.expanded=String(open);sidebarToggle.setAttribute('aria-expanded',String(open));
    sidebarToggle.setAttribute('aria-label',open?'Collapse sidebar':'Expand sidebar');
    sidebar.querySelector('.sidebar-bottom').inert=!open;
  }
  sidebar.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){sidebarHovered=true;syncSidebar();}});
  sidebar.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch'){sidebarHovered=false;sidebarPinned=false;syncSidebar();}});
  sidebar.addEventListener('focusin',syncSidebar);
  sidebar.addEventListener('focusout',()=>requestAnimationFrame(syncSidebar));
  sidebarToggle.onclick=()=>{sidebarPinned=!sidebarPinned;syncSidebar();};
  document.addEventListener('pointerdown',event=>{if(!sidebar.contains(event.target)){sidebarPinned=false;syncSidebar();}});
  syncSidebar();
  let current={connected:false,busy:false,account:'',accounts:[],modules:[],history:[],queue:[],events:[]};
  let localError='',firstRender=true,pendingNavigation=false,editingAccount=false,formAccountId='',selectionAccount='',restoredActivityFor='',pendingModule='',selectionTimer;
  let selected=new Set(),openCourses=new Map(),signatures={};
  const node=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=text;return element;};
  function tab(name){if(!labels[name])name='autobot';for(const button of document.querySelectorAll('[data-tab]'))button.setAttribute('aria-current',button.dataset.tab===name?'page':'false');for(const key of Object.keys(labels))$(`tab-${key}`).hidden=key!==name;$('page-title').textContent=labels[name];history.replaceState(null,'',`#${name}`);}
  for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>tab(button.dataset.tab);
  const initialTab=location.hash.slice(1);tab(initialTab==='study'?'settings':initialTab||'autobot');if(initialTab==='study')$('pdf-tools').open=true;
  let settings;try{
    const saved=JSON.parse(localStorage.getItem('chatterhigh-local-settings')||'{}');
    const upgraded=Object.hasOwn(saved,'doubleCheck')?{}:{doubleCheck:true,guessWhenStuck:false,confidence:Math.max(.9,Number(saved.confidence)||.9)};
    settings=C.settings({model:'qwen3:4b',doubleCheck:true,confidence:.9,guessWhenStuck:false,randomOpinions:true,...saved,...upgraded});
  }catch{settings=C.settings({model:'qwen3:4b',doubleCheck:true,confidence:.9,guessWhenStuck:false,randomOpinions:true});}
  for(const [key,value]of Object.entries(settings)){if(!$(key))continue;if(['autoSubmit','autoSurvey','guessWhenStuck','randomOpinions','doubleCheck'].includes(key))$(key).checked=value;else $(key).value=key==='confidence'?value*100:value;}
  $('confidence-value').value=`${$('confidence').value}%`;
  function updateAnswerSpeed(){const seconds=Number($('answerDelayMs').value)/1000;const text=seconds?`${seconds}s pause`:'Fastest';$('answer-speed-value').value=text;$('answerDelayMs').setAttribute('aria-valuetext',seconds?`${seconds} second minimum after opening research`:'Fastest, no added pause');}
  updateAnswerSpeed();
  $('answerDelayMs').oninput=updateAnswerSpeed;
  function updateInterestDelay(){const seconds=Number($('interestDelayMs').value)/1000;$('interest-delay-value').value=seconds?`${seconds}s`:'No pause';$('interestDelayMs').setAttribute('aria-valuetext',`${seconds} second cooldown before interest questions`);}
  updateInterestDelay();$('interestDelayMs').oninput=updateInterestDelay;
  // Keep native range input behavior; only its decorative track and thumb animate.
  for(const input of document.querySelectorAll('input[type=range]')){
    const control=document.createElement('span');control.className='range-control';
    const track=document.createElement('span');track.className='range-track';track.setAttribute('aria-hidden','true');
    const fill=document.createElement('span');fill.className='range-fill';
    const thumb=document.createElement('span');thumb.className='range-thumb';
    track.append(fill,thumb);input.before(control);control.append(track,input);
    const update=()=>{const min=Number(input.min||0),max=Number(input.max||100);control.style.setProperty('--range-position',`${max>min?Math.max(0,Math.min(1,(Number(input.value)-min)/(max-min)))*100:0}%`);};
    input.addEventListener('input',update);input.addEventListener('change',update);update();
    input.form?.addEventListener('reset',()=>requestAnimationFrame(update));
  }
  const mode=()=>document.querySelector('input[name=mode]:checked').value;
  const config=()=>C.settings({model:$('model').value,finishActivity:true,doubleCheck:$('doubleCheck').checked,confidence:Number($('confidence').value)/100,answerDelayMs:Number($('answerDelayMs').value),interestDelayMs:Number($('interestDelayMs').value),autoSubmit:$('autoSubmit').checked,autoSurvey:$('autoSurvey').checked,surveyMode:$('surveyMode').value,guessWhenStuck:$('guessWhenStuck').checked,randomOpinions:$('randomOpinions').checked,...Object.fromEntries(['questionSelector','optionSelector','submitSelector','nextSelector'].map(id=>[id,$(id).value]))});
  // Keep legacy server notices and saved errors consistent with neutral interface copy.
  const interfaceMessage=value=>String(value??'').replace(/\bCHATTERHIGH_BROWSER\b/g,'the browser executable setting').replace(/\byour ChatterHigh\b/gi,'your site').replace(/\bChatterHigh\b/gi,'the connected site');
  function status(message,error=false){$('status').textContent=interfaceMessage(message);$('status').dataset.error=String(error);}
  async function api(route,data){const response=await fetch(route,{method:data===undefined?'GET':'POST',headers:{'X-App-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();if(!response.ok)throw new Error(result.error||'The operation failed.');return result;}
  async function action(route,data={}){localError='';try{await api(route,data);await poll();return true;}catch(error){localError=error.message;status(localError,true);return false;}}
  function accountPayload(){return {accountId:formAccountId||undefined,email:$('email').value.trim(),password:$('password').value,remember:$('remember-account').checked,mode:mode()};}
  function runPayload(resume=false){const settings=config();localStorage.setItem('chatterhigh-local-settings',JSON.stringify(settings));const ids=selected.size?[...selected]:$('module').value?[$('module').value]:[];return {accountId:current.accountId||undefined,email:current.account||$('email').value.trim(),password:current.connected?'':$('password').value,remember:$('remember-account').checked,mode:mode(),moduleIds:ids,moduleId:ids[0]||'',ollamaUrl:$('ollamaUrl').value,settings,activityUrl:$('activityUrl').value.trim(),resume};}
  function editAccount(record){editingAccount=true;formAccountId=record?.id||'';$('account-editor').hidden=false;$('account-editor-title').textContent=record?'Update saved login':'Add an account';$('email').value=record?.email||'';$('password').value='';$('remember-account').checked=true;$('cancel-account').hidden=!(current.accounts.length||current.connected);tab('accounts');$('email').focus();}
  $('add-account').onclick=()=>editAccount();
  $('cancel-account').onclick=()=>{editingAccount=false;formAccountId='';$('password').value='';$('email').value=current.account||'';renderAccountControls();};
  function renderAccountControls(){
    const saved=current.accounts||[];
    $('account-editor').hidden=!editingAccount&&(saved.length>0||current.connected);
    $('account-editor').parentElement.classList.toggle('editor-closed',$('account-editor').hidden);
    $('account-fields').disabled=current.busy;$('connect').disabled=current.busy;$('add-account').disabled=current.busy;
    $('cancel-account').hidden=!(saved.length||current.connected);$('switch').hidden=!current.connected;$('switch').disabled=current.busy;
    $('connected').hidden=!current.connected;$('connected').textContent=current.account?`Signed in as ${current.account}`:'';
    $('save-current').hidden=!current.connected||Boolean(current.accountId);$('save-current').disabled=current.busy;
    $('verify').hidden=!current.browserOpen||current.connected;$('verify').disabled=current.busy;
    $('account-warning').textContent=interfaceMessage(current.accountWarning||current.accountsError);
    $('sidebar-account').textContent=current.connected?current.account:'Not signed in';$('account-profile').disabled=current.busy;
    const signature=JSON.stringify([saved,current.accountId,current.account,current.busy]);if(signature===signatures.accounts)return;signatures.accounts=signature;
    $('account-profile').replaceChildren();const placeholder=node('option','',saved.length?'Choose an account…':'No saved accounts');placeholder.value='';$('account-profile').append(placeholder);
    $('saved-accounts').replaceChildren();
    for(const record of saved){
      const option=node('option','',record.label||record.email);option.value=record.id;$('account-profile').append(option);
      const active=current.connected&&record.email.toLowerCase()===current.account.toLowerCase();
      const card=node('div',`saved-account${active?' active':''}`);card.append(node('strong','',record.email));card.append(node('p','',`${active?'Signed in · ':''}${record.hasPassword?'Saved login':'Saved session'}`));
      const buttons=node('div','account-buttons'),use=node('button','secondary',active?'Using this account':'Switch to account');use.type='button';use.disabled=current.busy||active;use.onclick=()=>chooseAccount(record.id);
      const edit=node('button','text-button',record.hasPassword?'Update login':'Add password');edit.type='button';edit.disabled=current.busy;edit.onclick=()=>editAccount(record);
      const remove=node('button','text-button remove','Remove');remove.type='button';remove.disabled=current.busy;remove.onclick=()=>action('/api/accounts/remove',{id:record.id});buttons.append(use,edit,remove);card.append(buttons);$('saved-accounts').append(card);
    }
    if(!saved.length)$('saved-accounts').append(node('div','card empty-small','No saved accounts yet. Add a login once, then switch without retyping it.'));
    const activeId=current.accountId||saved.find(record=>record.email.toLowerCase()===current.account.toLowerCase())?.id;$('account-profile').value=activeId||'';
  }
  function chooseAccount(id){pendingNavigation=true;editingAccount=false;formAccountId='';$('password').value='';return action('/api/connect',{accountId:id,mode:mode()});}
  $('account-profile').onchange=()=>{if($('account-profile').value)chooseAccount($('account-profile').value);};
  $('account-form').onsubmit=async event=>{event.preventDefault();const data=accountPayload();pendingNavigation=true;
    const updateCurrent=formAccountId&&current.connected&&current.accounts.some(record=>record.id===formAccountId&&record.email.toLowerCase()===current.account.toLowerCase());
    const accepted=await action(updateCurrent?'/api/accounts/save-current':'/api/connect',updateCurrent?{password:data.password}:data);
    if(accepted&&updateCurrent){$('password').value='';editingAccount=false;formAccountId='';}
  };
  $('save-current').onclick=()=>action('/api/accounts/save-current');
  $('switch').onclick=async()=>{clearTimeout(selectionTimer);await action('/api/disconnect');selected.clear();selectionAccount='';editingAccount=false;formAccountId='';$('email').value='';$('password').value='';$('activityUrl').value='';tab('accounts');};
  $('verify').onclick=()=>{pendingNavigation=true;action('/api/verify-login',{mode:mode()});};
  $('reveal').onclick=()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('reveal').textContent=show?'Hide':'Show';};
  function filteredModules(){const search=$('module-search').value.trim().toLowerCase();return current.modules.filter(module=>(!$('hide-completed').checked||!module.completed)&&`${module.title} ${module.course||''}`.toLowerCase().includes(search));}
  function rememberSelection(){clearTimeout(selectionTimer);const email=current.account;selectionTimer=setTimeout(()=>{if(current.account===email&&current.connected)api('/api/modules/selection',{ids:[...selected]}).catch(error=>status(error.message,true));},300);}
  function selectionChanged(){updateSelectionControls();for(const input of $('module-list').querySelectorAll('input[data-module-id]'))input.checked=selected.has(input.dataset.moduleId);for(const group of $('module-list').querySelectorAll('.course-group')){const ids=JSON.parse(group.dataset.ids);group.querySelector('summary small').textContent=`${ids.filter(id=>selected.has(id)).length}/${ids.length} selected`;}rememberSelection();}
  function updateSelectionControls(){const visible=filteredModules().filter(module=>!module.completed),checked=visible.filter(module=>selected.has(module.id)).length;$('select-all').checked=visible.length>0&&checked===visible.length;$('select-all').indeterminate=checked>0&&checked<visible.length;$('select-all').disabled=current.busy||!visible.length;
    $('selection-count').textContent=mode()==='modules'?`${selected.size} modules selected · completed modules are skipped`:'Runs until the daily quiz is complete.';
    const hasSelection=selected.size>0||Boolean($('module').value)||Boolean($('activityUrl').value.trim());$('run').disabled=current.busy||(current.connected&&mode()==='modules'&&!hasSelection);
    $('run').replaceChildren(node('span','',!current.connected?'Choose an account':mode()==='modules'?`Start ${selected.size||($('module').value?1:0)} module${selected.size===1?'':'s'}`:'Start daily quiz'),node('span','','↑'));
  }
  function renderModules(){
    const mirrorSelected=$('module').value||pendingModule;$('module').replaceChildren();const placeholder=node('option','',!current.connected?'Sign in to see modules':current.modulesStatus==='loading'?'Loading modules…':current.modulesStatus==='error'?'Could not load modules — Refresh':current.modules.length?'Select a module…':'No modules available');placeholder.value='';$('module').append(placeholder);
    for(const module of current.modules){const option=node('option','',module.title);option.value=module.id;$('module').append(option);}if(current.modules.some(module=>module.id===mirrorSelected)){$('module').value=mirrorSelected;pendingModule='';}
    $('module-total').textContent=`${current.modules.length}`;$('module-hint').textContent=interfaceMessage(current.modulesError)||(!current.connected?'Sign in on the Accounts tab to load your modules.':current.modulesStatus==='loading'?'Loading your courses and modules…':'');
    $('module-list').replaceChildren();const items=filteredModules();
    const groups=new Map();for(const module of items){const course=module.course||'Modules';if(!groups.has(course))groups.set(course,[]);groups.get(course).push(module);}
    for(const [course,modules]of groups){const details=node('details','course-group');details.dataset.ids=JSON.stringify(modules.filter(module=>!module.completed).map(module=>module.id));details.open=Boolean($('module-search').value.trim())||current.modules.length<20||openCourses.get(course)||modules.some(module=>module.id===current.activity?.id&&current.busy);
      const summary=node('summary');summary.append(document.createTextNode(course),node('small','',`${modules.filter(module=>selected.has(module.id)).length}/${modules.length} selected`));details.append(summary);details.ontoggle=()=>openCourses.set(course,details.open);
      for(const module of modules){const item=current.queue?.find(item=>item.id===module.id),label=node('label',`module-row${module.completed?' completed':''}${item?.status==='running'?' running':''}`),input=node('input');input.type='checkbox';input.dataset.moduleId=module.id;input.checked=selected.has(module.id)&&!module.completed;input.disabled=current.busy||module.completed;input.onchange=()=>{input.checked?selected.add(module.id):selected.delete(module.id);$('module').value=selected.size===1?[...selected][0]:'';selectionChanged();};
        const content=node('span');content.append(node('span','module-title',module.title),node('span','module-progress',module.completed?'✓ Completed':`${module.answered||0}${module.total?` / ${module.total}`:''} answered${module.lastStatus==='needs-attention'?' · Needs attention':''}`));label.append(input,content);details.append(label);
      }$('module-list').append(details);
    }
    if(!items.length)$('module-list').append(node('div','empty-small',!current.connected?'Choose an account to see its modules.':current.modulesStatus==='loading'?'Loading modules…':current.modulesStatus==='error'?'Could not load this catalog. Use Refresh to retry.':current.modules.length?'No modules match these filters.':'No modules loaded yet. Use Refresh.'));
    updateSelectionControls();updateActivityName();
  }
  function updateActivityName(){const task=current.busy?current.activity?.title:null;$('activity-name').textContent=task||(mode()==='daily'?'Daily Quiz':selected.size===1?current.modules.find(module=>selected.has(module.id))?.title||'Selected module':`${selected.size} selected modules`);}
  $('module-search').oninput=renderModules;$('hide-completed').onchange=renderModules;$('module').onchange=()=>{selected=new Set($('module').value?[$('module').value]:[]);selectionChanged();updateActivityName();};
  $('select-all').onchange=()=>{for(const module of filteredModules().filter(module=>!module.completed))$('select-all').checked?selected.add(module.id):selected.delete(module.id);selectionChanged();};
  $('clear-selection').onclick=()=>{selected.clear();$('module').value='';selectionChanged();};
  $('reload-modules').onclick=()=>action('/api/modules');$('refresh-history').onclick=()=>action('/api/modules');
  for(const radio of document.querySelectorAll('input[name=mode]'))radio.onchange=()=>{const modules=mode()==='modules';$('module-section').hidden=!modules;$('daily-section').hidden=modules;$('activityUrl').value='';renderModules();if(modules&&current.connected&&!current.busy&&current.modulesStatus!=='loaded')action('/api/modules');};
  $('run-form').onsubmit=event=>{event.preventDefault();if(!current.connected&&!($('email').value.includes('@')&&$('password').value)){tab('accounts');return;}if(!current.connected)pendingNavigation=true;try{action('/api/run',runPayload());}catch(error){status(error.message,true);}};
  $('resume').onclick=()=>{try{action('/api/run',runPayload(true));}catch(error){status(error.message,true);}};$('stop').onclick=()=>action('/api/stop');$('show-browser').onclick=()=>action('/api/show-browser');
  function renderQueue(){const queue=current.queue||[];$('count').textContent=current.runTiming?.questions??current.count??0;const finished=queue.filter(item=>item.status==='completed').length;$('queue-completed').textContent=finished;$('queue-summary').textContent=queue.length?`${finished} / ${queue.length} complete`:'No queue yet';$('queue-list').replaceChildren();
    const icons={completed:'✓',running:'◉',pending:'○',paused:'Ⅱ','needs-attention':'!'};const names={completed:'Completed',running:'Running',pending:'Waiting',paused:'Paused','needs-attention':'Needs attention'};
    for(const item of queue){const li=node('li',`queue-item ${item.status}`),content=node('div');content.append(node('strong','',item.title),node('p','',`${names[item.status]||item.status}${item.total?` · ${item.answered||0}/${item.total}`:''}`));if(item.error){const detail=node('details','queue-error');detail.append(node('summary','','Why it needs review'),node('p','',interfaceMessage(item.error)));content.append(detail);}li.append(node('span','',icons[item.status]||'○'),content);$('queue-list').append(li);}if(!queue.length)$('queue-list').append(node('li','empty-small','Select the modules you want to finish, then start the queue.'));
    $('resume').hidden=!current.browserOpen||!(current.phase==='paused'||queue.some(item=>['pending','paused','needs-attention'].includes(item.status)));$('resume').disabled=current.busy||!current.browserOpen;$('stop').disabled=!current.busy;$('show-browser').disabled=!current.browserOpen;updateActivityName();
  }
  function renderHistory(){const filter=$('history-filter').value,records=(current.history||[]).filter(item=>filter==='all'||item.status===filter).sort((a,b)=>(b.completedAt||b.updatedAt||'').localeCompare(a.completedAt||a.updatedAt||''));$('history-list').replaceChildren();$('history-count').textContent=current.modules.filter(module=>module.completed).length;
    for(const record of records){const row=node('div','history-item'),text=node('div');text.append(node('h3','',record.title||record.id));if(record.course)text.append(node('p','',record.course));text.append(node('p','',`${record.answered||0}${record.total?` / ${record.total}`:''} answered`));if(record.error)text.append(node('p','',interfaceMessage(record.error)));if(record.completedAt)text.append(node('p','',new Date(record.completedAt).toLocaleString()));row.append(text,node('span','history-status',record.status==='completed'?'✓ Completed':record.status==='needs-attention'?'Needs attention':record.status));$('history-list').append(row);}if(!records.length)$('history-list').append(node('div','card empty-small',current.connected?'No activities in this view yet.':'Select an account to view its history.'));
  }
  $('history-filter').onchange=renderHistory;
  function renderRunTiming(){
    const timing=current.runTiming||{},seconds=Math.floor(Math.max(0,Number(timing.elapsedMs)||0)/1000);
    const minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60),pad=value=>String(value).padStart(2,'0');
    $('run-elapsed').value=hours?hours+':'+pad(minutes%60)+':'+pad(seconds%60):pad(minutes)+':'+pad(seconds%60);
    const rate=timing.questionsPerMinute;$('run-qpm').value=Number.isFinite(rate)?(rate>0&&rate<.1?'<0.1':'~'+rate.toFixed(1)):'—';
  }
  function renderQuality(){
    const answers=(current.events||[]).filter(e=>e.type==='answer'&&e.answer&&!e.answer.survey&&!e.answer.randomOpinion);
    const latest=new Map(answers.map(e=>[C.fingerprint(e.question),e.answer]));
    $('quality-checked').textContent=[...latest.values()].filter(a=>a.crossChecked&&!a.guessed).length;
    $('quality-guesses').textContent=[...latest.values()].filter(a=>a.guessed).length;
    $('quality-review').textContent=(current.queue||[]).filter(q=>q.status==='needs-attention').length;
  }
  function renderEvents(){const signature=JSON.stringify(current.events);if(signature===signatures.events)return;signatures.events=signature;const rows=new Map();for(const event of current.events||[]){if(!event.question)continue;const key=C.fingerprint(event.question);if(!rows.has(key))rows.set(key,{question:event.question});Object.assign(rows.get(key),event.type==='answer'?{answer:event.answer}:event.type==='evidence'?{evidence:event.evidence,sources:event.sources}:{});}$('log').replaceChildren();
    for(const row of [...rows.values()].reverse()){const li=node('li','entry');li.append(node('h3','',row.question.prompt||row.question.text));const answer=row.answer;if(answer){li.append(node('p','answer',`${row.question.options.filter(option=>answer.optionIds?.includes(option.id)).map(option=>option.text).join('; ')||'Needs input'} · ${answer.randomOpinion?'random opinion response':answer.guessed?(answer.guessMethod==='random'?'unverified random guess':'unverified guess'):answer.survey?(answer.randomSurvey?'random survey response':'survey preset'):`${answer.crossChecked?'source cross-checked · ':''}${Math.round(answer.confidence*100)}% confidence (model estimate)`}`),node('p','',answer.explanation));}else li.append(node('p','',row.evidence?'Checking answer…':'Researching…'));
      if(answer?.reviewExplanation&&!answer.guessed){const detail=node('details','answer-review');detail.append(node('summary','','Second source check'),node('p','',answer.reviewExplanation));li.append(detail);}
      if(answer?.evidenceQuote&&!answer.guessed)li.append(node('blockquote','answer-quote',answer.evidenceQuote));
      if(row.evidence){const details=node('details'),summary=node('summary','','Research notes'),pre=node('pre','',row.evidence.replace(/\uE200[^\uE201]*\uE201/g,' [source]'));details.append(summary,pre);li.append(details);}const list=node('ul');for(const source of answer?.sources||row.sources||[]){const url=C.safeUrl(source.url);if(!url)continue;const link=node('a','',source.title||url);link.href=url;link.target='_blank';link.rel='noreferrer noopener';const item=node('li');item.append(link);list.append(item);}li.append(list);$('log').append(li);
    }
    if(!rows.size)$('log').append(node('li','empty-small','Answers and research sources appear here during a run.'));
  }
  function render(state){const previous=current;current={...state,accounts:state.accounts||[],history:state.history||[],queue:state.queue||[],events:state.events||[]};
    if(current.account!==previous.account){clearTimeout(selectionTimer);selected.clear();selectionAccount='';restoredActivityFor='';$('password').value='';if(!editingAccount)$('email').value=current.account||current.loginEmail||'';}
    if(current.connected&&current.modulesStatus==='loaded'&&selectionAccount!==current.account){selected=new Set(current.selectedModuleIds||[]);selectionAccount=current.account;}
    for(const id of [...selected])if(current.modules.find(module=>module.id===id)?.completed)selected.delete(id);
    if(current.activity&&current.account&&restoredActivityFor!==current.account){document.querySelector(`input[name=mode][value="${current.activity.mode==='modules'?'modules':'daily'}"]`).checked=true;pendingModule=current.activity.moduleId||'';restoredActivityFor=current.account;}
    if(current.connected&&pendingNavigation&&!current.busy){pendingNavigation=false;editingAccount=false;formAccountId='';$('password').value='';$('email').value=current.account;tab('autobot');}
    if(firstRender){firstRender=false;if(!location.hash||location.hash==='#autobot')tab(current.connected?'autobot':'accounts');}
    $('module-section').hidden=mode()!=='modules';$('daily-section').hidden=mode()==='modules';$('run-fields').disabled=current.busy;
    for(const id of ['reload-modules','refresh-history'])$(id).disabled=current.busy||!current.connected;
    $('clear-selection').disabled=current.busy;$('module-search').disabled=current.busy;$('hide-completed').disabled=current.busy;
    $('setup-download').disabled=current.busy;$('download-model').disabled=current.busy;
    if(previous.phase==='downloading'&&current.phase!=='downloading')checkOllama();
    const phaseNames={idle:'Ready',ready:'Connected','signing-in':'Signing in','saving-account':'Saving','loading-modules':'Loading',opening:'Opening',running:'Working',recovering:'Retrying',reconnecting:'Reconnecting',paused:'Paused',complete:'Complete',downloading:'Downloading'};$('badge').textContent=phaseNames[current.phase]||current.phase;$('badge').dataset.busy=String(current.busy);status(localError||current.message,Boolean(localError)||current.error);
    renderAccountControls();const moduleSignature=JSON.stringify([current.account,current.connected,current.modulesStatus,current.modulesError,current.modules,current.busy,pendingModule]);if(moduleSignature!==signatures.modules){signatures.modules=moduleSignature;renderModules();}else updateSelectionControls();
    renderQuality();renderRunTiming();
    const queueSignature=JSON.stringify([current.queue,current.count,current.runTiming?.questions,current.activity,current.phase,current.busy]);if(queueSignature!==signatures.queue){signatures.queue=queueSignature;renderQueue();}
    const historySignature=JSON.stringify([current.account,current.history,current.modules.filter(module=>module.completed).length]);if(historySignature!==signatures.history){signatures.history=historySignature;renderHistory();}renderEvents();
    if(previous.phase==='downloading'&&current.phase!=='downloading'&&!current.busy)checkOllama();
  }
  async function poll(){try{render(await api('/api/state'));tour.maybeStart();}catch(error){status(error.message.includes('app session')?'App updated. Refresh this window to reconnect.':'The local app is offline. Reopen Start Bolt.',true);}}
  let checkingOllama=false,installedModels=[];
  $('use-larger-model').onclick=()=>{const candidate=installedModels.slice().sort((a,b)=>b.size-a.size)[0];if(!candidate)return;$('model').value=candidate.name;localStorage.setItem('chatterhigh-local-settings',JSON.stringify(config()));$('use-larger-model').hidden=true;status('Selected '+candidate.name+'. Larger models can take more memory and time. Applies on Start or Resume.');};
  async function checkOllama(){
    if(checkingOllama)return;checkingOllama=true;$('check-ollama').disabled=true;$('setup-check').disabled=true;
    try{
      const {models}=await api('/api/ollama',{url:$('ollamaUrl').value});$('models').replaceChildren();
      installedModels=models;const largest=models.slice().sort((a,b)=>b.size-a.size)[0],active=models.find(m=>m.name===$('model').value);$('use-larger-model').hidden=!largest||!active||largest.size<=active.size;$('use-larger-model').textContent=largest?'Try installed '+largest.name:'Try a larger installed model';
      for(const model of models){const option=node('option');option.value=model.name;$('models').append(option);}
      $('ollama-status').textContent=models.length?'Ollama connected · '+models.length+' local model(s)':'Download a model to begin.';
      $('download-model').hidden=models.length>0;$('model-setup').hidden=true;
      $('setup-guide').hidden=models.length>0;$('setup-guide').dataset.state=models.length?'ready':'model';$('setup-install').hidden=true;$('setup-download').hidden=models.length>0;
      $('setup-message').textContent='Ollama is ready. Choose Download model to add the local AI once, or choose another model in Settings.';
      if(models.length&&!models.some(model=>model.name===$('model').value))$('model').value=models.find(model=>model.name==='qwen3:4b')?.name||models[0].name;
    }catch(error){
      $('use-larger-model').hidden=true;$('ollama-status').textContent=error.message;$('model-setup').hidden=false;$('download-model').hidden=true;
      $('setup-guide').hidden=false;$('setup-guide').dataset.state='service';$('setup-install').hidden=false;$('setup-download').hidden=true;
      $('setup-message').textContent='Install or open Ollama, then choose Check again. Bolt runs AI on your computer.';
    }finally{checkingOllama=false;$('check-ollama').disabled=false;$('setup-check').disabled=false;}
  }
  $('check-ollama').onclick=checkOllama;$('setup-check').onclick=checkOllama;
  const downloadModel=()=>action('/api/pull',{model:$('model').value,url:$('ollamaUrl').value});
  $('download-model').onclick=downloadModel;$('setup-download').onclick=downloadModel;
  $('setup-settings').onclick=()=>{tab('settings');$('model').scrollIntoView({block:'center'});$('model').focus({preventScroll:true});};
  $('confidence').oninput=()=>{$('confidence-value').value=$('confidence').value+'%';};
  $('settings-form').onsubmit=event=>{event.preventDefault();try{localStorage.setItem('chatterhigh-local-settings',JSON.stringify(config()));localError='';status('Settings saved.');}catch(error){status(error.message,true);}};
  $('shutdown').onclick=async()=>{try{await api('/api/shutdown',{});clearInterval(pollTimer);status('App closed. You can close this window.');for(const button of document.querySelectorAll('button'))button.disabled=true;}catch(error){status(error.message,true);}};
  for(const input of document.querySelectorAll('input,select'))input.addEventListener('input',()=>{localError='';});
  const tour=globalThis.BoltTour.init({navigate:tab,getState:()=>current,setSidebar:open=>{sidebarTourOpen=open;sidebar.dataset.tourOpen=String(open);syncSidebar();}});
  poll();checkOllama();const pollTimer=setInterval(poll,900);
})();
