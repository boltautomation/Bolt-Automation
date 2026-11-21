/* Real browser end-to-end checks against a local simulated ChatterHigh site. No real credentials or paid API calls. */
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Browser } = require('../app/browser.cjs');
const { Manager } = require('../app/manager.cjs');
const { createApp } = require('../app/server.cjs');
const { setTimeout: wait } = require('node:timers/promises');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
const credentials = { email: 'sample@example.test', password: 'sample-password' };
const answer = { optionIds: ['o1'], confidence: .98, personal: false, explanation: 'The source identifies Ottawa.', sources: [{ url: 'https://www.canada.ca/', title: 'Government of Canada' }] };
async function main() {
  let origin, submittedLogin = 0, solverCalls = 0;
  const awarenessRow = (name, prompt) => `<fieldset><legend>${prompt}</legend><label><input type="radio" name="${name}">Yes</label><label><input type="radio" name="${name}">No</label></fieldset>`;
  const interestRow = (name, prompt) => `<fieldset><legend>${prompt}</legend>${['4 - Very Interesting','3 - Interesting','2 - Somewhat Interesting','1 - Not Interesting'].map(text => `<label><input type="radio" name="${name}">${text}</label>`).join('')}</fieldset>`;
  const surveyHTML = `<form>${awarenessRow('heard', 'Have you heard of this organization before?')}${interestRow('organization-interest', 'How interesting is this organization to you?')}${awarenessRow('career', 'Did you know you could study this or do this as a job?')}${interestRow('career-interest', 'How interesting is this career to you?')}<button type="button" id="survey-next">Next Question</button></form>`;
  const fixture = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/login') {
      let body = ''; for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      if (form.get('password') === 'wrong-password') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><p class="site-specific-notice">Invalid email or password</p><form action="/login" method="post"><input name="email" type="email"><input name="password" type="password"><button type="submit">Sign In</button></form>'); return;
      }
      submittedLogin++;
      assert.ok([credentials.email, 'another@example.test'].includes(form.get('email'))); assert.equal(form.get('password'), credentials.password);
      assert.equal(req.headers.cookie, undefined, 'new account login reused session cookies');
      res.writeHead(302, { Location: '/dashboard', 'Set-Cookie': `account=${encodeURIComponent(form.get('email'))}; HttpOnly; SameSite=Lax` }); res.end(); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/login') return res.end('<!doctype html><form action="/login" method="post"><label>Email<input name="email" type="email"></label><label>Password<input name="password" type="password"></label><button type="submit">Sign In</button></form>');
    const cookieAccount=decodeURIComponent((req.headers.cookie||'').match(/(?:^|;\s*)account=([^;]+)/)?.[1]||'');
    if(![credentials.email,'another@example.test'].includes(cookieAccount)){res.writeHead(302,{Location:'/login'});res.end();return;}
    const nav = `<nav><a href="/quiz">Daily Quiz</a><a href="/modules">Mindful Modules</a><a href="/sign_out">Log out</a></nav><span id="fixture-account">${cookieAccount}</span>`;
    if (req.url === '/dashboard') return res.end(`<!doctype html>${nav}<h1>Your dashboard</h1>`);
    if (req.url === '/modules') return res.end(`<!doctype html>${nav}<div class="course"><div class="name drill-down-course-name">Sample course</div><a class="drill-down-course" data-url="/modules/modules_in_course?course_id=1" href="#" aria-label="Expand modules">Expand modules</a></div>`);
    if (req.url.startsWith('/modules/modules_in_course?')) return res.end('<div class="modules"><div class="mod"><span class="name">Financial literacy</span><span class="mod-stats">0/1 answered <a href="/modules/1/question">Start</a></span></div><div class="mod"><span class="name">Mental health</span><span class="mod-stats">0/1 answered <a href="/modules/2/question">Start</a></span></div></div>');
    if(req.url==='/opinion')return res.end(`<!doctype html>${nav}<main><form><fieldset><legend>In your opinion, which career interests you most?</legend>${['Artist','Engineer','Scientist'].map(label=>`<label><input type="radio" name="answer">${label}</label>`).join('')}</fieldset><button id="opinion-submit" type="button">Submit</button></form></main><script>document.getElementById('opinion-submit').onclick=()=>{if(document.querySelector('input:checked'))document.querySelector('main').innerHTML='<h1>Quiz completed.</h1>';};</script>`);
    if (req.url === '/long-task') return res.end(`<!doctype html>${nav}<main></main><script>let answered=0;function render(){document.querySelector('main').innerHTML='<form><fieldset><legend>Question '+(answered+1)+' of 25: Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input type="radio" name="answer">Ottawa</label></fieldset><button type="button" id="answer">Submit Answer</button></form>';document.getElementById('answer').onclick=()=>{if(!document.querySelectorAll('input')[1].checked)return;answered++;if(answered===25)document.querySelector('main').innerHTML='You have completed the module.';else render();};}render();</script>`);
    if (req.url === '/delayed-task') return res.end(`<!doctype html>${nav}<main>Loading question…</main><script>setTimeout(()=>{document.querySelector('main').innerHTML='<p>What is the duration of this program?</p><p class="hint">Hint: Use the Research button.</p><form><input type="hidden" name="authenticity_token" value="not-question-text"><div><label><input type="checkbox" name="answer">Eight-months full-time</label><label><input type="checkbox" name="answer">Six-semesters part-time</label><label><input type="checkbox" name="answer">Four semesters</label><label><input type="checkbox" name="answer">Both A &amp; B</label></div><button id="submit" type="button">Submit</button></form>';document.getElementById('submit').onclick=()=>{const selected=[...document.querySelectorAll('input[type=checkbox]:checked')];if(selected.length===1&&selected[0]===document.querySelectorAll('input[type=checkbox]')[3])document.querySelector('main').innerHTML='You have completed all the questions for this module. Course Complete. Great Job!';};},1100);</script>`);
    const afterAnswer = req.url === '/survey-flow' ? `document.querySelector('main').innerHTML=${JSON.stringify(surveyHTML)}; document.getElementById('survey-next').onclick=()=>{const selected=[...document.querySelectorAll('input:checked')].map(input=>input.parentElement.textContent); if(selected.join('|')==='No|1 - Not Interesting|No|1 - Not Interesting')document.querySelector('main').innerHTML='You have completed the Daily Quiz.';};` : "document.querySelector('main').innerHTML='You have completed the Daily Quiz.';";
    res.end(`<!doctype html>${nav}<main><form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer">Toronto</label><label><input type="radio" name="answer">Ottawa</label></fieldset><button type="button" id="quiz-submit">Submit Answer</button></form></main><script>document.getElementById('quiz-submit').onclick=()=>{if(document.querySelectorAll('input')[1].checked){${afterAnswer}}};</script>`);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${fixture.address().port}`;
  const browsers = [];
  const manager = new Manager({ accountStore:new MemoryAccounts(),progressStore:new MemoryProgress(),browserFactory: () => { const browser = new Browser({ headless: true, mouseOptions:{durationScale:0}, origins: [origin] }); browsers.push(browser); return browser; }, signInUrl: `${origin}/login`, solverFactory: () => ({ solve: async (question,signal,onResearch,repair,onResearchOpened) => { solverCalls++; await onResearchOpened(); return question.prompt?.includes('duration of this program') ? {...answer,optionIds:['o0','o1']} : answer; } }) });
  let app, ui;
  try {
    manager.connect({ ...credentials, mode: 'modules' }); await manager.job;
    assert.equal(manager.state.account, credentials.email, manager.state.message);
    assert.equal(submittedLogin, 1); assert.deepEqual(manager.state.modules.map(module => module.title), ['Financial literacy', 'Mental health']);
    console.log('PASS real browser automatically signs in and loads named modules');
    manager.run({ email: credentials.email, mode: 'modules', moduleId: `${origin}/modules/2/question`, settings: { maxQuestions: 2 } }); await manager.job;
    assert.equal(manager.state.phase, 'complete', manager.state.message); assert.equal(manager.state.count, 1);
    assert.equal(await manager.browser.url(), `${origin}/modules/2/question`);
    console.log('PASS selected module is opened, answered, submitted and completed through real DOM controls');
    const callsBeforeSurvey = solverCalls;
    manager.run({ email: credentials.email, mode: 'daily', activityUrl: `${origin}/survey-flow`, settings: { maxQuestions: 1 } }); await manager.job;
    assert.equal(manager.state.phase, 'complete', manager.state.message); assert.equal(manager.state.count, 1);
    assert.equal(solverCalls - callsBeforeSurvey, 1);
    console.log('PASS question → four survey presets → Next → completion works at the question limit without extra model calls');
    manager.run({ email: credentials.email, mode: 'daily', activityUrl: `${origin}/long-task`, settings: { maxQuestions: 1, finishActivity: true } }); await manager.job;
    assert.equal(manager.state.phase, 'complete', manager.state.message); assert.equal(manager.state.count, 25);
    console.log('PASS finish-activity mode completes all 25 questions instead of stopping at a question cap');
    manager.run({email:credentials.email,mode:'daily',activityUrl:`${origin}/delayed-task`,settings:{finishActivity:true}});await manager.job;
    assert.equal(manager.state.phase,'complete',manager.state.message);assert.equal(manager.state.count,1);
    console.log('PASS delayed page + A-and-B checkbox output + native completion recover automatically without Continue');
    manager.connect({ ...credentials, email: 'sample@example.test', mode: 'daily' }); await manager.job;
    manager.run({ email: credentials.email, mode: 'daily', settings: { maxQuestions: 2 } }); await manager.job;
    assert.equal(manager.state.phase, 'complete', manager.state.message); assert.equal(await manager.browser.url(), `${origin}/quiz`);
    console.log('PASS Daily Quiz selection navigates and completes without signing in again');
    const old = manager.browser; await manager.disconnect(); assert.equal(old.profile, null);
    manager.connect({ ...credentials, mode: 'daily' }); await manager.job; assert.equal(submittedLogin, 2); assert.equal(browsers.length, 2);
    console.log('PASS disconnect destroys the account browser; a new sign-in creates a fresh session');
    const rejectedBrowser = new Browser({ headless: true, mouseOptions:{durationScale:0}, origins: [origin] });
    try {
      await rejectedBrowser.launch(new AbortController().signal);
      await assert.rejects(rejectedBrowser.login(credentials.email, 'wrong-password', new AbortController().signal, `${origin}/login`), /did not accept this sign-in/);
      console.log('PASS a site-specific invalid-login banner is detected without waiting or retrying credentials');
    } finally { await rejectedBrowser.close(); }
    app = await createApp({ manager, port: 0 });
    ui = new Browser({ headless: true, mouseOptions:{durationScale:0}, origins: [app.origin] }); await ui.launch(new AbortController().signal); await ui.navigate(app.origin, new AbortController().signal);
    await wait(500);
    await ui.evaluate(()=>{localStorage.setItem('bolt-onboarding-v1','skipped');if(document.getElementById('quick-tour').open)document.getElementById('tour-skip').click();});
    const dashboard = await ui.evaluate(() => ({ title: document.title, email: document.getElementById('email').value, password: document.getElementById('password').value, connected: document.getElementById('connected').textContent, token: document.querySelector('meta[name=app-token]').content.length }));
    assert.equal(dashboard.title, 'Bolt · '+require('../package.json').versionName); assert.equal(dashboard.password, ''); assert.ok(dashboard.connected.includes(credentials.email)); assert.equal(dashboard.token, 64);
    assert.equal(await ui.evaluate(() => document.getElementById('autoSurvey').checked), true);
    assert.equal(await ui.evaluate(() => document.getElementById('guessWhenStuck').checked), false);
    assert.equal(await ui.evaluate(() => document.getElementById('doubleCheck').checked), true);
    assert.equal(await ui.evaluate(() => document.getElementById('randomOpinions').checked), true);
    await ui.evaluate(() => { document.querySelector('input[value=modules]').click(); });
    assert.equal(await ui.evaluate(() => document.getElementById('module-section').hidden), false);
    const until = async predicate => {
      for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await wait(150); }
      throw new Error(`UI operation timed out: ${manager.state.message}`);
    };
    await ui.evaluate(()=>{
      document.querySelector('[data-tab=settings]').click();
      const speed=document.getElementById('answerDelayMs');speed.value='3000';speed.dispatchEvent(new Event('input'));
      const interest=document.getElementById('interestDelayMs');interest.value='2000';interest.dispatchEvent(new Event('input'));
      document.getElementById('guessWhenStuck').checked=false;
      document.getElementById('randomOpinions').checked=false;
      document.getElementById('surveyMode').value='random';
      document.getElementById('settings-form').requestSubmit();
    });
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).answerDelayMs),3000);
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).interestDelayMs),2000);
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).guessWhenStuck),false);
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).randomOpinions),false);
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).surveyMode),'random');
    await ui.navigate(app.origin+'/#settings',new AbortController().signal);
    await until(async()=>await ui.evaluate(()=>document.getElementById('answerDelayMs').value==='3000'&&document.getElementById('answer-speed-value').value==='3s pause'));
    assert.equal(await ui.evaluate(()=>document.getElementById('answerDelayMs').getAttribute('aria-valuetext')),'3 second minimum after opening research');
    assert.equal(await ui.evaluate(()=>document.getElementById('interestDelayMs').value),'2000');
    assert.equal(await ui.evaluate(()=>document.getElementById('interest-delay-value').value),'2s');
    assert.equal(await ui.evaluate(()=>document.getElementById('guessWhenStuck').checked),false);
    assert.equal(await ui.evaluate(()=>document.getElementById('randomOpinions').checked),false);
    assert.equal(await ui.evaluate(()=>document.getElementById('surveyMode').value),'random');
    await ui.evaluate(()=>{
      const speed=document.getElementById('answerDelayMs');speed.value='1000';speed.dispatchEvent(new Event('input'));
      const interest=document.getElementById('interestDelayMs');interest.value='0';interest.dispatchEvent(new Event('input'));
      document.getElementById('guessWhenStuck').checked=true;
      document.getElementById('randomOpinions').checked=true;
      document.getElementById('surveyMode').value='preset';
      document.querySelector('[data-tab=autobot]').click();document.querySelector('input[value=modules]').click();
    });
    console.log('PASS answer speed saves, reloads, and displays the selected pause accessibly');
    manager.state.modules = []; manager.state.modulesStatus = 'loading';
    await until(async () => await ui.evaluate(() => document.getElementById('module').options[0].textContent.includes('Loading')));
    manager.state.modulesStatus = 'error'; manager.state.modulesError = 'Could not load catalog.';
    await until(async () => await ui.evaluate(() => document.getElementById('module').options[0].textContent.includes('Could not load')));
    assert.equal(await ui.evaluate(() => document.getElementById('module').options[0].textContent.includes('Sign in')), false);
    manager.refreshModules(); await manager.job;
    await until(async () => await ui.evaluate(() => document.getElementById('module').options.length === 3));
    console.log('PASS signed-in module UI distinguishes loading, errors, and available modules');
    await ui.evaluate(moduleId => {
      document.getElementById('module').value = moduleId;
      document.getElementById('run-form').requestSubmit();
    }, `${origin}/modules/2/question`);
    await until(async () => await ui.evaluate(() => document.getElementById('status').textContent.includes('Quiz completed')));
    assert.equal(await manager.browser.url(), `${origin}/modules/2/question`);
    assert.equal(await ui.evaluate(() => document.querySelector('#log .answer').textContent.includes('Ottawa')), true);
    assert.ok(manager.state.events.some(event=>event.type==='pacing'&&event.delayMs===1000));
    await ui.evaluate(()=>{
      document.querySelector('[data-tab=settings]').click();
      const speed=document.getElementById('answerDelayMs');speed.value='0';speed.dispatchEvent(new Event('input'));
      document.getElementById('settings-form').requestSubmit();document.querySelector('[data-tab=autobot]').click();
    });
    assert.equal(await ui.evaluate(()=>document.getElementById('answer-speed-value').value),'Fastest');
    console.log('PASS Start applies the selected answer speed to the runner');
    console.log('PASS module selection and Start work through the standalone UI and render the answer');
    manager.refreshModules();await manager.job;
    await until(async()=>await ui.evaluate(()=>document.querySelectorAll('#module-list input[data-module-id]:not(:disabled)').length===2));
    await ui.evaluate(()=>{document.getElementById('select-all').click();document.getElementById('run-form').requestSubmit();});
    await until(async()=>manager.state.queue.length===2&&manager.state.queue.every(item=>item.status==='completed')&&!manager.job);
    await until(async()=>await ui.evaluate(()=>document.querySelectorAll('#queue-list .completed').length===2));
    await ui.evaluate(()=>document.querySelector('[data-tab=history]').click());
    assert.equal(await ui.evaluate(()=>document.getElementById('history-list').textContent.includes('Financial literacy')&&document.getElementById('history-list').textContent.includes('Mental health')),true);
    console.log('PASS check-all starts a multi-module queue and both completions appear in account history');
    await ui.evaluate(()=>document.querySelector('[data-tab=autobot]').click());
    await ui.evaluate(() => document.getElementById('switch').click());
    await until(async () => manager.browser === null && !manager.state.account && await ui.evaluate(() => document.getElementById('email').value === ''));
    await ui.evaluate(({ password }) => {
      document.getElementById('email').value = 'another@example.test'; document.getElementById('password').value = password;
      document.querySelector('input[value=daily]').click(); document.getElementById('run-form').requestSubmit();
    }, credentials);
    await until(async () => manager.state.account === 'another@example.test' && manager.state.phase === 'complete');
    await until(async () => await ui.evaluate(() => document.getElementById('password').value === '' && document.getElementById('status').textContent.includes('Quiz completed')));
    assert.equal(submittedLogin, 3);
    const stored = await ui.evaluate(() => JSON.stringify(localStorage));
    assert.ok(!stored.includes(credentials.password));
    console.log('PASS UI account switching runs the other account without exposing credentials in local storage');
    const loginsBeforeRestore=submittedLogin;
    const firstSaved=(await manager.accountStore.list()).find(account=>account.email===credentials.email);
    await ui.evaluate(id=>{const select=document.getElementById('account-profile');select.value=id;select.dispatchEvent(new Event('change'));},firstSaved.id);
    await until(async()=>manager.state.account===credentials.email&&!manager.job);
    assert.equal(submittedLogin,loginsBeforeRestore);
    assert.equal(await manager.browser.evaluate(()=>document.getElementById('fixture-account').textContent),credentials.email);
    assert.equal(await ui.evaluate(()=>document.getElementById('password').value),'');
    console.log('PASS saved-account selector restores the correct real browser session without password entry');
    let markResearch;
    await manager.browser.navigate(`${origin}/quiz`, new AbortController().signal);
    const researching = new Promise(resolve => { markResearch = resolve; });
    manager.solverFactory = () => ({ solve: (question, signal) => new Promise((resolve, reject) => { markResearch(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
    await until(async () => await ui.evaluate(() => !document.getElementById('run').disabled));
    await ui.evaluate(() => document.getElementById('run-form').requestSubmit());
    await Promise.race([researching, wait(12000).then(async () => { throw new Error(`Research did not start: ${await ui.evaluate(() => document.getElementById('status').textContent)}`); })]);
    await until(async () => await ui.evaluate(() => !document.getElementById('stop').disabled));
    await ui.evaluate(() => document.getElementById('stop').click());
    await until(async () => manager.state.phase === 'paused' && !manager.job);
    assert.equal((await manager.browser.quiz({ action: 'scan', config: {} })).questions.length, 1);
    manager.solverFactory = () => ({ solve: async () => answer });
    await until(async () => await ui.evaluate(() => !document.getElementById('resume').disabled));
    await ui.evaluate(() => document.getElementById('resume').click());
    await until(async () => manager.state.phase === 'complete' && !manager.job);
    await until(async () => await ui.evaluate(() => document.getElementById('status').textContent.includes('Quiz completed')));
    console.log('PASS UI Stop cancels research, and Continue resumes the same signed-in account');
    manager.solverFactory=()=>({solve:async()=>{throw new Error('No research page could be read.');},guess:async()=>({...answer,confidence:.65,sources:[],canAnswer:true,basis:'general-knowledge'})});
    await manager.browser.navigate(origin+'/dashboard',new AbortController().signal);
    await ui.evaluate(()=>{document.querySelector('input[value=daily]').click();document.getElementById('run-form').requestSubmit();});
    await until(async()=>manager.state.phase==='complete'&&!manager.job&&manager.state.events.some(e=>e.type==='answer'&&e.answer.guessed));
    await until(async()=>await ui.evaluate(()=>document.querySelector('#log .answer')?.textContent.includes('unverified educated guess')));
    assert.equal(await ui.evaluate(()=>document.querySelector('#log .answer').textContent.includes('confidence')),false);
    assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).guessWhenStuck),true);
    console.log('PASS Guess when stuck saves its preference, submits a valid best-effort choice after research fails, and labels it unverified');
    let opinionModelCalls=0;manager.solverFactory=()=>({solve:async()=>{opinionModelCalls++;throw new Error('Opinion should use no model');}});
    await ui.evaluate(url=>{document.getElementById('activityUrl').value=url;document.getElementById('run-form').requestSubmit();},origin+'/opinion');
    await until(async()=>manager.state.phase==='complete'&&!manager.job&&manager.state.events.some(e=>e.type==='answer'&&e.answer.randomOpinion));
    await until(async()=>await ui.evaluate(()=>document.querySelector('#log .answer')?.textContent.includes('random opinion response')));
    assert.equal(opinionModelCalls,0);assert.equal(await ui.evaluate(()=>JSON.parse(localStorage.getItem('chatterhigh-local-settings')).randomOpinions),true);
    await ui.evaluate(()=>document.getElementById('activityUrl').value='');
    console.log('PASS opinion setting persists, chooses a valid random response without research, submits by mouse, and labels the answer');
    await fs.mkdir('test-results', { recursive: true }); await fs.writeFile('test-results/app.png', await ui.screenshot());
    for(const name of ['autobot','accounts','history','settings']){
      await ui.evaluate(name=>document.querySelector(`[data-tab=${name}]`).click(),name);
      const layout=await ui.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+1}));
      assert.equal(layout.overflow,false,`${name} window overflow`);assert.equal(layout.contentOverflow,false,`${name} content overflow`);
      await fs.writeFile(`test-results/tab-${name}.png`,await ui.screenshot());
    }
    await ui.command('Emulation.setDeviceMetricsOverride',{width:430,height:760,deviceScaleFactor:1,mobile:true});
    await ui.evaluate(()=>document.querySelector('[data-tab=autobot]').click());
    assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await fs.writeFile('test-results/tabs-mobile.png',await ui.screenshot());
    await ui.evaluate(()=>document.querySelector('[data-tab=settings]').click());
    assert.equal(await ui.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+1),false);
    await fs.writeFile('test-results/settings-mobile.png',await ui.screenshot());
    console.log('PASS all sidebar tabs fit the compact desktop window and narrow-screen layout without horizontal overflow');
    console.log('PASS standalone app renders, connects to backend, switches activity controls and keeps password blank');
  } finally {
    if (ui) await ui.close();
    if (app) await app.close(); else await manager.disconnect();
    await new Promise(resolve => fixture.close(resolve));
  }
}
const watchdog = setTimeout(() => { console.error('Browser integration test timed out.'); process.exit(1); }, 90000);
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
