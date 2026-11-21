const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: wait } = require('node:timers/promises');
require('../extension/core.js');
const C = globalThis.ChatterCore;
const {SessionExpiredError,SessionRecoveryError}=require('./session.cjs');
const {BrowserMouse}=require('./mouse.cjs');
const {BrowserPrivacy}=require('./browser-privacy.cjs');
const {achievementCloseTarget,achievementStillOpen}=require('./achievements.cjs');
function disabledAccount(){const error=new SessionRecoveryError('ChatterHigh has disabled or suspended this account. Contact ChatterHigh to resolve it. Your remaining queue is saved.');error.accountDisabled=true;return error;}

function findBrowser({env=process.env,exists=require('node:fs').existsSync,platform=process.platform}={}) {
  const roots=[env.ProgramFiles||'C:/Program Files',env['ProgramFiles(x86)']||'C:/Program Files (x86)',env.LOCALAPPDATA].filter(Boolean);
  const applications=['/Applications',...(env.HOME?[`${env.HOME}/Applications`]:[])];
  const discovered=platform==='darwin'
    ? [...applications.map(root=>`${root}/Google Chrome.app/Contents/MacOS/Google Chrome`),...applications.map(root=>`${root}/Brave Browser.app/Contents/MacOS/Brave Browser`)]
    : [...roots.map(root=>`${root}/Google/Chrome/Application/chrome.exe`),...roots.map(root=>`${root}/BraveSoftware/Brave-Browser/Application/brave.exe`)];
  const candidates=[env.BOLT_BROWSER,env.CHATTERHIGH_BROWSER,...discovered].filter(Boolean);
  const browser = candidates.find(exists);
  if (!browser) throw new Error('Install Google Chrome or Brave, or set CHATTERHIGH_BROWSER to its executable. Edge is not selected automatically.');
  return browser;
}
class Protocol {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map();this.listeners=new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if(message.method){for(const listener of this.listeners.get(message.method)||[])listener(message.params,message.sessionId);return;}
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`Browser command failed: ${message.error.message}`));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => this.fail());
    socket.addEventListener('error', () => this.fail());
  }
  on(method,listener){if(!this.listeners.has(method))this.listeners.set(method,new Set());this.listeners.get(method).add(listener);return ()=>this.listeners.get(method)?.delete(listener);}
  fail() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The automation browser was closed. Sign in again to reconnect.')); }
    this.pending.clear();
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Browser connection timed out.')); }, 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to the automation browser.')); }, { once: true });
    });
    return new Protocol(socket);
  }
  send(method, params = {}, sessionId) {
    if(this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new Error('The automation browser connection is unavailable.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The automation browser did not respond.')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('The automation browser connection is unavailable.')); }
    });
  }
}
class Browser {
  constructor({ runtimeRoot = path.resolve(__dirname, '../.app-runtime'), headless = false, origins = ['https://chatterhigh.com', 'https://www.chatterhigh.com'], executable, mouseOptions = {}, launchArgs=[], strictPrivacy=process.env.CHATTERHIGH_STRICT_PRIVACY==='1' } = {}) {
    Object.assign(this, { runtimeRoot: path.resolve(runtimeRoot), headless, origins, executable, mouseOptions,launchArgs,strictPrivacy });
  }
  allowed(url) { try { return this.origins.includes(new URL(url).origin); } catch { return false; } }
  get alive() { return Boolean(this.protocol && this.protocol.socket.readyState === WebSocket.OPEN && this.child && this.child.exitCode === null); }
  async launch(signal) {
    await fs.mkdir(this.runtimeRoot, { recursive: true });
    this.profile = await fs.mkdtemp(path.join(this.runtimeRoot, 'browser-'));
    const args = [`--user-data-dir=${this.profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
      // Keep native input and layout updates running when another app covers Chrome.
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,CalculateNativeWinOcclusion',
      ...(this.headless ? ['--window-size=1040,760'] : ['--start-maximized']),
      ...(this.strictPrivacy?['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']:[]),
      ...(this.headless ? ['--headless', '--disable-gpu'] : []),...this.launchArgs, 'about:blank'];
    this.child = spawn(this.executable || findBrowser(), args, { stdio: 'ignore', windowsHide: this.headless });
    let launchError;
    this.child.on('error', () => { launchError = new Error('Could not launch the automation browser.'); });
    try {
      let address;
      for (let attempt = 0; attempt < 80; attempt++) {
        signal.throwIfAborted();
        if (launchError) throw launchError;
        if (this.child.exitCode !== null) throw new Error('The automation browser exited before it was ready.');
        try {
          const [port, endpoint] = (await fs.readFile(path.join(this.profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
          if (/^\d+$/.test(port) && endpoint?.startsWith('/devtools/browser/')) { address = `ws://127.0.0.1:${port}${endpoint}`; break; }
        } catch {}
        await wait(150, undefined, { signal });
      }
      if (!address) throw new Error('The automation browser did not start in time.');
      this.protocol = await Protocol.connect(address);
      signal.throwIfAborted();
      const { browserContextId } = await this.protocol.send('Target.createBrowserContext', { disposeOnDetach: true });
      this.contextId = browserContextId;
      this.privacy=new BrowserPrivacy(this.protocol,browserContextId,{strict:this.strictPrivacy});await this.privacy.start();
      const { targetId } = await this.protocol.send('Target.createTarget', { url: 'about:blank', browserContextId });
      this.targetId = targetId;
      // The isolated quiz context can open a different window from Chrome's first tab.
      if(!this.headless){
        const {windowId}=await this.protocol.send('Browser.getWindowForTarget',{targetId});
        await this.protocol.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'maximized'}});
      }
      const { sessionId } = await this.protocol.send('Target.attachToTarget', { targetId, flatten: true });
      this.sessionId = sessionId;
      await this.privacy.protect(sessionId,{targetId,type:'page'});
      await this.command('Page.enable');
      await this.command('Runtime.enable');
      return this;
    } catch (error) { await this.close(); throw error; }
  }
  command(method, params) { this.privacy?.assert();return this.protocol.send(method, params, this.sessionId); }
  async clickElement(find,argument,options={}) {
    this.mouse ||= new BrowserMouse(this,this.mouseOptions);
    const signal=options.signal||new AbortController().signal;
    await this.dismissAchievementPopups(signal);
    const deadline=Date.now()+6000;
    for(let attempt=0;;attempt++){
      try{return await this.mouse.click(find,argument,{...options,signal});}
      catch(error){
        signal.throwIfAborted();
        if(!['MOUSE_TARGET_OBSCURED','MOUSE_TARGET_MOVED','MOUSE_TARGET_CHANGED','MOUSE_COORDINATE_MISMATCH','MOUSE_TARGET_DISABLED'].includes(error.code))throw error;
        if(Date.now()>=deadline||attempt>=11){
          error.message+=' Automatic recovery could not clear it. Your remaining queue is saved.';throw error;
        }
        if(attempt===0)options.onRecovery?.(error.code);
        const dismissed=await this.dismissAchievementPopups(signal);
        if(!dismissed)await wait(Math.min(200+attempt*100,650),undefined,{signal});
        // Replan from the same fingerprint after a rerender; this also verifies
        // that a retry cannot submit a different question or undo a selection.
        if(options.beforeRetry&&await options.beforeRetry()===false)return false;
      }
    }
  }
  async dismissAchievementPopups(signal=new AbortController().signal){
    signal.throwIfAborted();
    if(!this.allowed(await this.url()))return 0;
    this.mouse ||= new BrowserMouse(this,this.mouseOptions);
    let dismissed=0;
    for(let attempt=0;attempt<8;attempt++){
      signal.throwIfAborted();
      const popup=await this.evaluate(achievementCloseTarget,{inspect:true});
      if(!popup)break;
      if(!await this.mouse.click(achievementCloseTarget,{key:popup.key},{signal}))break;
      dismissed++;
      let open=true;
      for(let frame=0;frame<25;frame++){
        signal.throwIfAborted();
        open=await this.evaluate(achievementStillOpen,popup.key);
        if(!open)break;
        await wait(50,undefined,{signal});
      }
      if(open)throw new Error(`The achievement popup did not close: ${popup.title}`);
    }
    return dismissed;
  }
  async rejectOptionalCookies(signal){
    if(!this.strictPrivacy)return;
    const {declineCookies}=require('./research-privacy.cjs');
    const choice=await this.evaluate(declineCookies,{plan:true},{requireSite:false});
    if(choice?.available)await this.clickElement(()=>globalThis.__boltCookieReject,null,{signal,requireSite:false});
  }
  async url() { return (await this.command('Page.getFrameTree')).frameTree.frame.url; }
  async evaluate(fn, argument, { requireSite = true } = {}) {
    const { frameTree } = await this.command('Page.getFrameTree');
    if (requireSite && !this.allowed(frameTree.frame.url)) throw new Error('The browser is outside ChatterHigh. Finish signing in, then continue.');
    const { executionContextId } = await this.command('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'ChatterHighLocalApp' });
    const expression = typeof fn === 'function' ? `(${fn.toString()})(${JSON.stringify(argument)})` : fn;
    const result = await this.command('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error('The page changed or its controls could not be read. Check the automation browser and try again.');
    return result.result.value;
  }
  async navigate(url, signal) {
    signal.throwIfAborted();
    if (!this.allowed(url)) throw new Error('Only ChatterHigh activity links can be opened.');
    this.researchVisits?.clear();
    const result = await this.command('Page.navigate', { url });
    if (result.errorText) throw new Error('Could not open the ChatterHigh page. Check your connection.');
    for (let attempt = 0; attempt < 60; attempt++) {
      signal.throwIfAborted();
      try {
        const frame = (await this.command('Page.getFrameTree')).frameTree.frame;
        if ((!result.loaderId || frame.loaderId === result.loaderId) && await this.evaluate(() => document.readyState !== 'loading')) return;
      } catch {}
      await wait(250, undefined, { signal });
    }
    throw new Error('ChatterHigh took too long to load. Check the browser, then continue.');
  }
  async info() {
    return this.evaluate(() => {
      const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const links = [...document.querySelectorAll('a[href]')].filter(visible).map(anchor => ({
        text: clean(anchor.innerText || anchor.getAttribute('aria-label') || anchor.title), url: anchor.href,
        card: clean(anchor.closest('article,.card,.module,.module-card,[data-module]')?.innerText || '').slice(0, 1500),
        heading: clean(anchor.closest('article,.card,.module,.module-card,[data-module]')?.querySelector('h1,h2,h3,h4,h5,h6')?.textContent)
      }));
      const hasPassword = [...document.querySelectorAll('input[type=password]')].some(visible);
      const signedOutLink = links.some(link => /sign.?out|log.?out|déconnexion/i.test(link.text + ' ' + link.url));
      const bodyText = document.body.innerText.slice(0, 16000);
      const notices=[...document.querySelectorAll('.alert,.flash,.error,[role=alert],.toast-message')].filter(visible).map(element=>element.textContent).join(' ');
      const loginPage=hasPassword||/^\/(?:en|fr)?\/?$/.test(location.pathname)||/sign_in|\/login/i.test(location.pathname);
      const accountDisabled=/(?:your|this|the) (?:user )?account (?:has been |is |was )(?:disabled|suspended|deactivated|blocked)|(?:disabled|suspended|deactivated) account/i.test(loginPage?bodyText:notices);
      return { url: location.href, title: document.title, links, hasPassword, signedOutLink,accountDisabled,
        buttons: [...document.querySelectorAll('button,input[type=submit],[role=button]')].filter(element => visible(element) && !element.disabled).map(element => clean(element.innerText || element.value)),
        challenge: /captcha|verify you are human|verification code|two.factor|access denied|just a moment/i.test(bodyText),
        loginError: hasPassword && (/invalid (email|login|username|password)|incorrect (email|login|username|password)|email or password (is |are )?(invalid|incorrect)|invalid email or password/i.test(bodyText) || [...document.querySelectorAll('.alert,.v2-alert,.flash,.error,[role=alert],.toast-message')].filter(visible).some(element => /invalid|incorrect|not found|unconfirmed|verify your email|locked|expired|try again/i.test(element.textContent)))
      };
    });
  }
  async login(email, password, signal, signInUrl = 'https://chatterhigh.com/en/users/sign_in') {
    await this.navigate(signInUrl, signal);
    await this.rejectOptionalCookies(signal);
    signal.throwIfAborted();
    const filled = await this.evaluate(({ email, password }) => {
      const visible = element => element.getClientRects().length > 0;
      const forms = [...document.forms].filter(form => [...form.querySelectorAll('input[type=password]')].some(visible));
      // The site has a hidden login modal and a separate visible sign-in form.
      const form = forms.find(candidate => [...candidate.querySelectorAll('input[type=email],input[name*="email"]')].some(visible));
      if (!form) return false;
      const emailInput = [...form.querySelectorAll('input[type=email],input[name*="email"]')].find(visible);
      const passwordInput = [...form.querySelectorAll('input[type=password]')].find(visible);
      if (!emailInput || !passwordInput) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [input, value] of [[emailInput, email], [passwordInput, password]]) {
        setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (const input of form.querySelectorAll('input[type=checkbox][name*="remember"]')) input.checked = false;
      return true;
    }, { email, password });
    if (!filled) throw new Error('Could not locate the sign-in form. Complete sign-in in the automation browser, then use Continue in app.');
    const clicked=await this.clickElement(()=>{
      const visible=element=>element.getClientRects().length>0;
      const form=[...document.forms].find(form=>[...form.querySelectorAll('input[type=password]')].some(visible)&&[...form.querySelectorAll('input[type=email],input[name*="email"]')].some(visible));
      return form&&[...form.querySelectorAll('button[type=submit],input[type=submit],button:not([type])')].find(visible);
    },null,{signal});
    if(!clicked)throw new Error('Could not locate the sign-in button. Complete sign-in in the automation browser.');
    // One sign-in attempt only. Do not retry credentials on failure.
    for (let attempt = 0; attempt < 60; attempt++) {
      await wait(500, undefined, { signal }); signal.throwIfAborted();
      let info; try { info = await this.info(); } catch { continue; }
      if(info.accountDisabled)throw disabledAccount();
      if (info.challenge) throw new Error('Finish the verification step in the automation browser, then use Continue in app.');
      if (info.loginError) throw new Error('ChatterHigh did not accept this sign-in. Check your email/password and account verification.');
      if (this.authenticated(info, signInUrl)) return;
    }
    throw new Error('Sign-in is waiting for your input. Check the automation browser, then use Continue in app.');
  }
  authenticated(info, signInUrl = 'https://chatterhigh.com/en/users/sign_in') {
    if (info.hasPassword || info.challenge||info.accountDisabled) return false;
    if (info.signedOutLink) return true;
    const route = new URL(info.url).pathname;
    return info.url !== signInUrl && !/^\/(en|fr)?\/?$/.test(route) && !/sign_in|sign_up|daily_quiz$|mindful_modules$/i.test(route);
  }
  async assertSession(signInUrl) {
    const info=await this.info();
    if(info.accountDisabled)throw disabledAccount();
    if(!this.authenticated(info,signInUrl))throw new SessionExpiredError(info.challenge?'ChatterHigh requires a verification step.':'Your ChatterHigh session expired. Reconnecting…');
    return info;
  }
  async quiz(message,signal=new AbortController().signal,onRecovery=()=>{}) {
    signal.throwIfAborted();
    await this.assertSession();
    await this.dismissAchievementPopups(signal);
    await this.rejectOptionalCookies(signal);
    if (!this.sources) this.sources = (await Promise.all(['core.js', 'content.js'].map(name => fs.readFile(path.join(__dirname, '../extension', name), 'utf8')))).join('\n');
    const version = require('node:crypto').createHash('sha256').update(this.sources).digest('hex');
    const dispatch=async action=>{
      signal.throwIfAborted();
      const expression = `(() => { if (!globalThis.ChatterDOM || globalThis.ChatterDOMVersion !== ${JSON.stringify(version)}) { ${this.sources}\n globalThis.ChatterDOMVersion = ${JSON.stringify(version)}; } try { return {ok:true,result:globalThis.ChatterDOM.dispatch(${JSON.stringify(action)})}; } catch(error) { return {ok:false,error:error.message}; } })()`;
      const result=await this.evaluate(expression);
      if(!result?.ok)throw new Error(result?.error||'The question could not be read.');
      return result.result;
    };
    if(message.action==='scan')return dispatch(message);
    for(let step=0;step<401;step++){
      let plan=await dispatch({...message,plan:true});
      if(!plan.target)return plan;
      if(message.action!=='fill'){
        let repairedResearch=false;const waitingSince=Date.now();
        for(let attempt=0;;attempt++){
          if(plan.ready)break;
          if(attempt===0)onRecovery('CONTROL_NOT_READY');
          if(Date.now()-waitingSince>=750&&!repairedResearch&&message.action==='submit'){
            repairedResearch=true;
            const current=await dispatch({...message,action:'scan'});
            const questions=current.questions.filter(q=>q.links?.length);
            if(questions.length){
              onRecovery('RESEARCH_RECHECK');
              for(const question of questions){
                await dispatch({...message,verifyOnly:true});
                await this.prepareResearch(question,signal,()=>wait(message.pacingComplete?0:message.config?.answerDelayMs||0,undefined,{signal}),{force:true});
              }
              if(message.answers)await this.quiz({...message,action:'fill'},signal,onRecovery);
              plan=await dispatch({...message,plan:true});if(plan.ready)break;
            }
          }
          if(attempt>=31){const error=new Error('The page has not enabled this control after waiting and rechecking its prerequisites. Your queue is saved.');error.code='MOUSE_TARGET_DISABLED';throw error;}
          await wait(Math.min(250,50*(attempt+1)),undefined,{signal});
          plan=await dispatch({...message,plan:true});
        }
      }
      const clicked=await this.clickElement(()=>globalThis.ChatterDOM.mouseTarget(),null,{
        signal,onRecovery,beforePress:async()=>{const verified=await dispatch({...message,verifyOnly:true});if(verified.ready===false){const error=new Error('The page disabled the control while the mouse was moving.');error.code='MOUSE_TARGET_DISABLED';throw error;}},
        beforeRetry:async()=>{plan=await dispatch({...message,plan:true});return Boolean(plan.target);}
      });
      if(!clicked){if(message.action==='fill')continue;throw new Error('The mouse target disappeared. Scan the quiz again.');}
      if(message.action!=='fill')return {ok:true};
      for(let attempt=0;attempt<16;attempt++){
        signal.throwIfAborted();
        const selected=await this.evaluate(()=>{
          const e=globalThis.ChatterDOM.mouseTarget();
          if(!e?.isConnected)return null;
          return e.matches('input')?e.checked:e.getAttribute('aria-checked')==='true'||e.getAttribute('aria-selected')==='true';
        });
        if(selected===null||selected===plan.desired)break;
        if(attempt===15){const error=new Error('The page did not register the selected answer. Refreshing from saved progress is required.');error.code='ANSWER_SELECTION_STALLED';throw error;}
        await wait(100,undefined,{signal});
      }
    }
    throw new Error('The answer choices did not settle after mouse selection. Review the browser.');
  }
  async catalog(signal) {
    signal.throwIfAborted();
    await this.assertSession();
    const info = await this.info();
    const link = info.links.find(link => /^(mindful\s+modules|modules)$/i.test(link.text) && this.allowed(link.url));
    if (!link) throw new Error('The signed-in module catalog could not be found. Open Modules in the browser and try Reload.');
    const context = this.contextId || (await this.protocol.send('Target.getTargetInfo', { targetId: this.targetId })).targetInfo.browserContextId;
    const { targetId } = await this.protocol.send('Target.createTarget', { url: 'about:blank', browserContextId: context, background: true });
    try {
      const { sessionId } = await this.protocol.send('Target.attachToTarget', { targetId, flatten: true });
      const page = Object.assign(Object.create(Browser.prototype), { protocol: this.protocol, sessionId, origins: this.origins,privacy:this.privacy,strictPrivacy:this.strictPrivacy });
      await page.command('Page.enable'); await page.navigate(link.url, signal);
      const result = await page.evaluate(async () => {
        const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
        const read = (root, course = '') => [...root.querySelectorAll('a[href]')].flatMap(anchor => {
          const url = new URL(anchor.getAttribute('href'), location.href);
          if (url.origin !== location.origin || !/\/(modules|courses|lessons)\/\d+(\/|$)/.test(url.pathname)) return [];
          const row = anchor.closest('.mod,.module-wrapper,.module-card,article,.card,[data-module]') || anchor.parentElement;
          const name = row.querySelector('.name,h1,h2,h3,h4,h5,h6')?.textContent;
          const title = clean(name || anchor.textContent);
          if (!title || /^(start|continue|resume|view)$/i.test(title)) return [];
          const stats = clean(row.querySelector('.mod-stats')?.textContent||row.textContent).match(/(\d+)\s*\/\s*(\d+)\s*answered/i);
          const answered = stats ? Number(stats[1]) : null, total = stats ? Number(stats[2]) : null;
          return [{ id: url.href, url: url.href, title, course, answered, total, completed: stats ? total > 0 && answered >= total : /\bcompleted\b/i.test(row.textContent) }];
        });
        const result = read(document), controls = [...document.querySelectorAll('.drill-down-course[data-url]')];
        let cursor = 0, failed = 0;
        await Promise.all(Array.from({ length: Math.min(4, controls.length) }, async () => {
          while (cursor < controls.length) {
            const control = controls[cursor++];
            try {
              const url = new URL(control.dataset.url, location.href);
              if (url.origin !== location.origin || !/\/modules_in_course$/.test(url.pathname)) continue;
              const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } });
              if (!response.ok) throw new Error('Catalog request failed');
              const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
              const course = clean(control.closest('.course')?.querySelector('.drill-down-course-name,.name')?.textContent);
              result.push(...read(doc, course));
            } catch { failed++; }
          }
        }));
        return { modules: [...new Map(result.map(module => [module.id, module])).values()].sort((a,b) => a.course.localeCompare(b.course) || a.title.localeCompare(b.title, undefined, { numeric: true })), failed };
      });
      signal.throwIfAborted();
      this.catalogPartial = result.failed > 0;
      if (result.failed && !result.modules.length) throw new Error('The module groups could not load. Check the browser connection and try Reload.');
      return result.modules;
    } finally { await this.protocol.send('Target.closeTarget', { targetId }).catch(() => {}); }
  }
  researchVisitKey(question){return JSON.stringify([question.prompt||question.text,(question.links||[]).map(link=>link.url)]);}
  async closeResearchTarget(targetId){
    try{
      await this.protocol.send('Target.closeTarget',{targetId});
      // Chrome may acknowledge the close before removing the target. Check
      // immediately and wait only when it is actually still being destroyed.
      for(let attempt=0;attempt<10;attempt++){
        if(!(await this.protocol.send('Target.getTargets')).targetInfos.some(target=>target.targetId===targetId))return;
        await wait(Math.min(50,10*(attempt+1)));
      }
    }catch{}
  }
  async openResearchLink(question,link,signal){
    signal.throwIfAborted();
    const url=require('./sources.cjs').publicUrl(link.url).href;
    const before=new Set((await this.protocol.send('Target.getTargets')).targetInfos.map(target=>target.targetId));
    const clicked=await this.clickElement(url=>[...document.querySelectorAll('button[data-ref],button[data-url],a[data-ref]')].find(element=>{
      if(!element.getClientRects().length||!/research|resource|recherche/i.test(element.innerText))return false;
      try{return new URL(element.dataset.ref?atob(element.dataset.ref):element.dataset.url,location.href).href===url;}catch{return false;}
    }),url,{signal});
    if(clicked){
      (this.researchVisits||=new Set()).add(this.researchVisitKey(question));
      for(let attempt=0;attempt<15;attempt++){
        if(attempt)await wait(100,undefined,{signal});
        const opened=(await this.protocol.send('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&!before.has(target.targetId)&&(target.openerId===this.targetId||target.browserContextId===this.contextId));
        if(opened)return opened.targetId;
      }
    }
    return (await this.protocol.send('Target.createTarget',{url,browserContextId:this.contextId,background:true})).targetId;
  }
  async prepareResearch(question,signal,onOpened=async()=>{},{force=false}={}){
    signal.throwIfAborted();
    if(!question.links?.length)return;
    await this.assertSession();
    if(!force&&this.researchVisits?.has(this.researchVisitKey(question))){await onOpened();return;}
    let targetId;
    try{
      targetId=await this.openResearchLink(question,question.links[0],signal);
      const {sessionId}=await this.protocol.send('Target.attachToTarget',{targetId,flatten:true});
      await this.protocol.send('Page.bringToFront',{},sessionId);
      await onOpened();signal.throwIfAborted();
    }finally{if(targetId)await this.closeResearchTarget(targetId);}
  }
  async researchSources(question, signal, {refresh=false,onOpened=async()=>{}}={}) {
    await this.assertSession();
    const { publicUrl, excerpts, normalize } = require('./sources.cjs');
    const {readResearchPage}=require('./research-page.cjs');
    const sources = [];
    let lastError;
    for (const link of (question.links || []).slice(0, 4)) {
      signal.throwIfAborted();
      let targetId;
      try {
        targetId=await this.openResearchLink(question,link,signal);
        const { sessionId } = await this.protocol.send('Target.attachToTarget', { targetId, flatten: true });
        const page = Object.assign(Object.create(Browser.prototype), { protocol: this.protocol, sessionId, origins: this.origins,mouseOptions:this.mouseOptions,privacy:this.privacy,strictPrivacy:this.strictPrivacy });
        await page.command('Page.bringToFront');
        await onOpened();
        signal.throwIfAborted();
        let loaded;
        for (let attempt = 0; attempt < 60; attempt++) {
          if(attempt)await wait(Math.min(250,50*attempt),undefined,{signal});
          try {
            const currentUrl = await page.url(); if(currentUrl==='about:blank')continue; publicUrl(currentUrl);
            if(this.allowed(currentUrl))await page.assertSession();
            await page.rejectOptionalCookies(signal);
            loaded = await page.evaluate(readResearchPage, {prompt:question.prompt||question.text,expand:refresh?true:'focused',plan:true}, { requireSite: false });
            if (loaded?.text?.length > 80) break;
          } catch(error) {signal.throwIfAborted();if(error.code==='SESSION_EXPIRED')throw error;lastError=error;}
        }
        if(loaded&&(loaded.mouseControls?.length||refresh)){
          for(const index of loaded.mouseControls||[])await page.clickElement(index=>globalThis.__boltResearchControls?.[index],index,{signal,requireSite:false});
          await wait(500,undefined,{signal});loaded=await page.evaluate(readResearchPage,{prompt:question.prompt||question.text},{requireSite:false});
        }
        if (loaded?.text?.length > 80) sources.push({ id: `s${sources.length}`, url: loaded.url, title: loaded.title || new URL(loaded.url).hostname, text: excerpts(normalize(loaded.text), question, 12000), sections:loaded.sections, focused:loaded.focused });
        if (sources.length === 3) break;
      } catch(error) { signal.throwIfAborted();if(error.code==='SESSION_EXPIRED')throw error;lastError=error; }
      finally { if (targetId) await this.closeResearchTarget(targetId); }
    }
    if(!sources.length&&lastError)throw new Error(`Research page could not be loaded: ${lastError.message}`,{cause:lastError});
    return sources;
  }
  async clickButton(label, signal) {
    signal.throwIfAborted();
    return this.clickElement(label => {
      const buttons = [...document.querySelectorAll('button,input[type=submit],[role=button]')].filter(element => element.getClientRects().length && !element.disabled && (element.innerText || element.value || '').replace(/\s+/g, ' ').trim() === label);
      return buttons.length===1?buttons[0]:null;
    }, label,{signal});
  }
  async followLink(url,signal){
    if(!this.allowed(url))throw new Error('Only ChatterHigh activity links can be opened.');
    const previous=await this.url();
    const clicked=await this.clickElement(url=>[...document.querySelectorAll('a[href]')].find(anchor=>anchor.href===url&&anchor.getClientRects().length),url,{signal});
    if(!clicked){await this.navigate(url,signal);return;}
    for(let attempt=0;attempt<60;attempt++){
      if(attempt)await wait(Math.min(250,50*attempt),undefined,{signal});
      if(await this.url()!==previous&&await this.evaluate(()=>document.readyState!=='loading'))return;
    }
    throw new Error('The activity link did not finish opening. Review the automation browser.');
  }
  async show() { await this.command('Page.bringToFront'); }
  async snapshotSession() {
    const {cookies}=await this.command('Network.getCookies',{urls:this.origins.map(origin=>`${origin}/`)});
    const hosts=this.origins.map(origin=>new URL(origin).hostname);
    return {url:await this.url(),cookies:cookies.filter(cookie=>hosts.includes(cookie.domain.replace(/^\./,''))).map(cookie=>({name:cookie.name,value:cookie.value,domain:cookie.domain,path:cookie.path,secure:cookie.secure,httpOnly:cookie.httpOnly,...(cookie.sameSite?{sameSite:cookie.sameSite}:{}),...(cookie.expires>0?{expires:cookie.expires}:{})}))};
  }
  async restoreSession(session,signal) {
    if(!session?.cookies?.length||!this.allowed(session.url))return false;
    const hosts=this.origins.map(origin=>new URL(origin).hostname);
    const cookies=session.cookies.filter(cookie=>hosts.includes(String(cookie.domain).replace(/^\./,'')));
    if(!cookies.length)return false;
    await this.command('Network.setCookies',{cookies});await this.navigate(session.url,signal);
    return this.authenticated(await this.info());
  }
  async screenshot() {
    const { cssContentSize } = await this.command('Page.getLayoutMetrics');
    return Buffer.from((await this.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } })).data, 'base64');
  }
  async close() {
    this.privacy?.close();this.privacy=null;
    if (this.protocol) {
      try { await this.protocol.send('Browser.close'); } catch {}
      this.protocol.socket.close(); this.protocol = null;
    }
    const child = this.child; this.child = null;
    if (child && child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(1500)]);
      if (child.exitCode === null) child.kill();
    }
    if (this.profile && path.dirname(path.resolve(this.profile)) === this.runtimeRoot && path.basename(this.profile).startsWith('browser-')) {
      await fs.rm(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
      this.profile = null;
    }
  }
}
module.exports = { Browser, Protocol, findBrowser };
