const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Manager } = require('../app/manager.cjs');
const { createApp } = require('../app/server.cjs');
const { moduleLinks, navigationLink, activityUrl } = require('../app/activities.cjs');
const C = globalThis.ChatterCore;
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
const q = { id: 'q0', text: 'Capital of Canada?', multiple: false, options: [{ id: 'o0', text: 'Toronto' }, { id: 'o1', text: 'Ottawa' }] };
const good = { optionIds: ['o1'], confidence: .98, personal: false, explanation: 'Verified.', sources: [{ title: 'Source', url: 'https://www.canada.ca/' }] };
class FakeBrowser {
  constructor() { this.actions = []; this.currentUrl = 'https://chatterhigh.com/dashboard'; this.complete = false; }
  allowed(url) { return C.isChatterHigh(url); }
  async launch(signal) { signal.throwIfAborted(); this.launched = true; }
  async login(email, password, signal) { this.loginEmail = email; this.loginAttempts = (this.loginAttempts || 0) + 1; if (password === 'wrong') throw new Error('Sign-in was not accepted.'); signal.throwIfAborted(); }
  async close() { this.closed = true; }
  async show() {}
  async url() { return this.currentUrl; }
  authenticated() { return true; }
  async info() { return { url: this.currentUrl, buttons: [], links: [
    { text: 'Daily Quiz', url: 'https://chatterhigh.com/quiz' },
    { text: 'Mindful Modules', url: 'https://chatterhigh.com/modules' },
    { text: 'Financial literacy', url: 'https://chatterhigh.com/modules/1', card: '' },
    { text: 'Mental health', url: 'https://chatterhigh.com/modules/2', card: '' }
  ] }; }
  async navigate(url, signal) { signal.throwIfAborted(); this.currentUrl = url; this.complete = false; this.actions.push({ navigate: url }); }
  async quiz(message) {
    this.actions.push({ action: message.action });
    if (message.action === 'submit') this.complete = true;
    return { fingerprint: this.complete ? 'done' : this.currentUrl, questions: this.complete ? [] : [q], complete: this.complete, nextCount: 0 };
  }
}
function manager() {
  const browsers = [];
  const m = new Manager({ accountStore:new MemoryAccounts(),progressStore:new MemoryProgress(),browserFactory: () => { const b = new FakeBrowser(); browsers.push(b); return b; }, solverFactory: () => ({ solve: async () => good }) });
  return { m, browsers };
}
const credentials = () => ({ email: 'first@example.com', password: 'test-password' });
const runData = () => ({ ...credentials(), mode: 'daily', settings: C.settings({ model: 'qwen3:4b' }) });

test('account connect signs in once and does not expose credentials in state', async () => {
  const { m, browsers } = manager(); const data = credentials();
  m.connect(data); await m.job;
  assert.equal(m.snapshot().account, 'first@example.com'); assert.equal(browsers[0].loginAttempts, 1);
  assert.ok(!JSON.stringify(m.snapshot()).includes('test-password')); assert.equal(data.password, '');
});
test('switching logins closes the previous account session before creating another', async () => {
  const { m, browsers } = manager();
  m.connect(credentials()); await m.job;
  m.connect({ email: 'second@example.com', password: 'second-password' }); await m.job;
  assert.equal(browsers.length, 2); assert.ok(browsers[0].closed); assert.equal(m.state.account, 'second@example.com');
  await m.disconnect(); assert.ok(browsers[1].closed); assert.equal(m.state.account, ''); assert.equal(m.browser, null);
});
test('incorrect password is attempted once and never marks the account connected', async () => {
  const { m, browsers } = manager(); m.connect({ email: 'first@example.com', password: 'wrong' }); await m.job;
  assert.equal(m.state.phase, 'paused'); assert.equal(m.state.account, ''); assert.equal(browsers[0].loginAttempts, 1);
});
test('Daily Quiz run automatically signs in, navigates, solves and submits', async () => {
  const { m, browsers } = manager(); m.run(runData()); await m.job;
  assert.equal(m.state.phase, 'complete'); assert.equal(m.state.count, 1);
  assert.equal(m.snapshot().runTiming.questions,1);assert.equal(m.snapshot().runTiming.running,false);assert.ok(m.snapshot().runTiming.startedAt);
  assert.ok(browsers[0].actions.some(action => action.navigate === 'https://chatterhigh.com/quiz'));
  assert.equal(browsers[0].actions.filter(action => action.action === 'submit').length, 1);
  assert.ok(!JSON.stringify(m.snapshot()).includes('fake-api-key'));
});
test('module list comes from the account and selected module is opened', async () => {
  const { m, browsers } = manager(); m.connect({ ...credentials(), mode: 'modules' }); await m.job;
  assert.equal(m.state.modules.length, 2);
  m.run({ ...runData(), password: '', mode: 'modules', moduleId: 'https://chatterhigh.com/modules/2' }); await m.job;
  assert.equal(m.state.phase, 'complete'); assert.equal(browsers.length, 1);
  assert.ok(browsers[0].actions.some(action => action.navigate === 'https://chatterhigh.com/modules/2'));
});

test('run settings report the model actually passed to the solver and change on restart',async()=>{
  const {m}=manager(),models=[];
  m.solverFactory=options=>{models.push(options.model);return {solve:async()=>good};};
  const data=runData();m.run(data);
  data.settings.model='qwen3.8:27b';
  await m.job;
  assert.equal(m.snapshot().runSettings.model,'qwen3:4b');
  assert.deepEqual(Object.keys(m.snapshot().runSettings).sort(),['answerDelayMs','confidence','doubleCheck','humanizedMouse','interestDelayMs','model','visionResearch','webResearch']);
  m.run(data);await m.job;
  assert.equal(m.snapshot().runSettings.model,'qwen3.8:27b');
  assert.deepEqual(models,['qwen3:4b','qwen3.8:27b']);
});
test('successful sign-in loads modules even when Daily Quiz is selected', async () => {
  const { m } = manager(); m.connect({ ...credentials(), mode: 'daily' }); await m.job;
  assert.equal(m.state.modulesStatus, 'loaded'); assert.equal(m.state.modules.length, 2); assert.equal(m.snapshot().connected, true);
});

test('mouse preferences apply on Start and update an existing browser on the next run',async()=>{
  const {m,browsers}=manager(),make=m.browserFactory;
  m.browserFactory=()=>{const b=make();b.setMousePreferences=options=>{b.humanizedMouse=options.humanizedMouse===true;};return b;};
  const data=runData();data.settings.humanizedMouse=true;m.run(data);await m.job;
  assert.equal(browsers[0].humanizedMouse,true);assert.equal(m.snapshot().runSettings.humanizedMouse,true);
  data.settings.humanizedMouse=false;m.run(data);await m.job;
  assert.equal(browsers.length,1);assert.equal(browsers[0].humanizedMouse,false);
});
test('module loading failure keeps the account connected and exposes a catalog error', async () => {
  const { m } = manager();
  m.browserFactory = () => Object.assign(new FakeBrowser(), { info: async () => { throw new Error('Catalog unavailable'); } });
  m.connect({ ...credentials(), mode: 'modules' }); await m.job;
  assert.equal(m.snapshot().connected, true); assert.equal(m.state.modulesStatus, 'error'); assert.equal(m.state.modulesError, 'Catalog unavailable');
});
test('unknown module selection loads choices without solving any question', async () => {
  const { m, browsers } = manager(); m.run({ ...runData(), mode: 'modules', moduleId: 'unknown' }); await m.job;
  assert.equal(m.state.phase, 'ready'); assert.equal(m.state.modules.length, 2);
  assert.ok(!browsers[0].actions.some(action => action.action === 'fill'));
});
test('Continue cannot run under an email different from the current session', async () => {
  const { m } = manager(); m.connect(credentials()); await m.job;
  assert.throws(() => m.run({ ...runData(), email: 'second@example.com', resume: true }), /account already in the browser/);
});
test('busy manager rejects simultaneous account and run operations', async () => {
  const { m } = manager(); m.connect(credentials()); assert.throws(() => m.connect(credentials()), /already running/); await m.job;
});
test('Stop cancels research without submitting and preserves session for continuation', async () => {
  const { m, browsers } = manager(); let researching;
  const started = new Promise(resolve => { researching = resolve; });
  m.solverFactory = () => ({ solve: (question, signal) => new Promise((resolve, reject) => { researching(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
  m.run(runData()); await started; m.stop(); await m.job;
  assert.equal(m.state.phase, 'paused'); assert.ok(m.browser); assert.ok(!browsers[0].actions.some(action => action.action === 'submit'));
});
test('activity navigation rejects external links and logout routes', () => {
  const browser = new FakeBrowser();
  assert.throws(() => activityUrl(browser, 'https://evil.test/modules/1'));
  assert.throws(() => activityUrl(browser, 'https://chatterhigh.com/users/sign_out'));
  const info = { links: [{ text: 'Mindful Modules', url: 'https://chatterhigh.com/modules' }, { text: 'Start', heading: 'A real module', url: 'https://chatterhigh.com/modules/12' }, { text: 'Bad module', url: 'https://evil.test/modules/1' }] };
  assert.deepEqual(moduleLinks(info, browser).map(item => item.title), ['A real module']);
  assert.equal(navigationLink(info, 'modules', browser).url, 'https://chatterhigh.com/modules');
});
test('local app requires a session token and rejects cross-origin requests', async t => {
  const { m } = manager(); const app = await createApp({ manager: m, port: 0 }); t.after(() => app.close());
  const root = await fetch(app.origin); const html = await root.text();
  assert.equal(root.status, 200); assert.ok(html.includes(app.token)); assert.ok(root.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await fetch(`${app.origin}/api/state`)).status, 403);
  const auth = { 'X-App-Token': app.token };
  assert.equal((await fetch(`${app.origin}/api/state`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${app.origin}/api/state`, { headers: { ...auth, Origin: 'https://evil.test' } })).status, 403);
  const hostileHost = await new Promise((resolve, reject) => {
    const request = http.get(`${app.origin}/api/state`, { headers: { ...auth, Host: 'evil.test' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject);
  });
  assert.equal(hostileHost, 403);
  const wrongType = await fetch(`${app.origin}/api/connect`, { method: 'POST', headers: auth, body: 'email=x' }); assert.equal(wrongType.status, 415);
  const login = await fetch(`${app.origin}/api/connect`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(credentials()) });
  assert.equal(login.status, 202); await m.job;
  const state = await (await fetch(`${app.origin}/api/state`, { headers: auth })).text(); assert.ok(!state.includes('test-password')); assert.ok(state.includes('first@example.com'));
});
test('saved accounts switch without re-entering passwords and keep sessions separate',async()=>{
  const {m,browsers}=manager();
  m.browserFactory=()=>{const browser=new FakeBrowser();browser.snapshotSession=async()=>({url:browser.currentUrl,cookies:[{name:'fixture',value:browser.loginEmail}]});browser.restoreSession=async session=>{browser.loginEmail=session.cookies[0].value;return true;};browsers.push(browser);return browser;};
  m.connect({...credentials(),remember:true});await m.job;const first=m.state.accountId;
  m.connect({email:'second@example.com',password:'second-fixture',remember:true});await m.job;const second=m.state.accountId;
  assert.notEqual(first,second);assert.equal((await m.accountStore.list()).length,2);
  m.connect({accountId:first});await m.job;
  assert.equal(m.state.account,'first@example.com');assert.equal(browsers[2].loginAttempts,undefined);assert.ok(browsers[1].closed);
  assert.ok(!JSON.stringify(m.snapshot()).includes('test-password'));
});
test('failed login is never added to saved accounts',async()=>{
  const {m}=manager();m.connect({email:'first@example.com',password:'wrong',remember:true});await m.job;
  assert.equal((await m.accountStore.list()).length,0);
});
test('checked module queue completes both tasks and persists completion per account',async()=>{
  const {m,browsers}=manager();m.connect(credentials());await m.job;
  m.run({...runData(),mode:'modules',moduleIds:['https://chatterhigh.com/modules/1','https://chatterhigh.com/modules/2']});await m.job;
  assert.equal(m.state.phase,'complete');assert.equal(m.state.count,2);assert.deepEqual(m.state.queue.map(item=>item.status),['completed','completed']);
  const history=await m.progressStore.get('first@example.com');assert.equal(Object.values(history.items).filter(item=>item.status==='completed').length,2);
  assert.equal(Object.keys((await m.progressStore.get('second@example.com')).items).length,0);
});

test('completed module scores come from the site and persist in queue, modules and history',async()=>{
  const {m,browsers}=manager();m.connect(credentials());await m.job;
  const browser=browsers[0],quiz=browser.quiz.bind(browser);
  browser.quiz=async message=>{const result=await quiz(message);return {...result,...(result.complete?{score:{correct:0,total:10,source:'site'}}:{})};};
  m.run({...runData(),mode:'modules',moduleIds:[m.state.modules[0].id]});await m.job;
  const score={correct:0,total:10,source:'site'};
  assert.equal(m.state.phase,'complete');assert.deepEqual(m.state.queue[0].score,score);assert.deepEqual(m.state.modules[0].score,score);assert.equal(m.state.queue[0].answered,10);
  assert.deepEqual(m.state.history.find(item=>item.id===m.state.modules[0].id).score,score);
  const saved=await m.progressStore.get(credentials().email);assert.deepEqual(saved.queue[0].score,score);assert.deepEqual(saved.items[m.state.modules[0].id].score,score);
});

test('outside research follows the saved run preference and can be completely disabled',async()=>{
  const {m}=manager();const configurations=[];
  m.solverFactory=options=>{configurations.push(options);return{solve:async()=>good};};
  m.run({...runData(),settings:{webResearch:false}});await m.job;
  assert.equal(configurations[0].webSourceLoader,null);assert.equal(m.state.runSettings.webResearch,false);
  m.run({...runData(),settings:{webResearch:true}});await m.job;
  assert.equal(typeof configurations[1].webSourceLoader,'function');assert.equal(m.state.runSettings.webResearch,true);
});
test('queue moves past a failed module and can retry it from the right task',async()=>{
  const {m}=manager();m.connect(credentials());await m.job;
  m.solverFactory=()=>({solve:async()=>{if(m.browser.currentUrl.endsWith('/1'))throw new Error('Could not quote supporting evidence');return good;}});
  m.run({...runData(),mode:'modules',moduleIds:['https://chatterhigh.com/modules/1','https://chatterhigh.com/modules/2']});await m.job;
  assert.deepEqual(m.state.queue.map(item=>item.status),['needs-attention','completed']);assert.equal(m.state.phase,'paused');
  const failure=m.state.queue[0].failure;assert.equal(failure.code,'RESEARCH_FAILED');assert.deepEqual(failure.question,q);
  assert.deepEqual((await m.progressStore.get(credentials().email)).items['https://chatterhigh.com/modules/1'].failure,failure);
  m.solverFactory=()=>({solve:async()=>good});m.run({...runData(),mode:'modules',resume:true});await m.job;
  assert.equal(m.state.phase,'complete');assert.equal(m.browser.currentUrl,'https://chatterhigh.com/modules/1');
  assert.equal((await m.progressStore.get(credentials().email)).items['https://chatterhigh.com/modules/1'].failure,null);
});

test('educated guessing pauses when the local model is unavailable instead of submitting random answers',async()=>{
  const {m}=manager();m.solverFactory=()=>({check:async()=>{throw new Error('Ollama is not reachable.');},solve:async()=>{throw new Error('Should not call an unavailable model');}});
  m.run({...runData(),settings:{guessWhenStuck:true}});await m.job;
  assert.equal(m.state.phase,'paused');
  assert.ok(!m.state.events.some(e=>e.type==='answer'));
});

test('recognized opinions can be randomized without a local model even when factual guessing is off',async()=>{
  const {m}=manager();
  m.browserFactory=()=>{const b=new FakeBrowser(),quiz=b.quiz.bind(b);b.quiz=async message=>{const page=await quiz(message);if(message.action==='scan')page.questions=page.questions.map(question=>({...question,prompt:'In your opinion, which option is most interesting?'}));return page;};return b;};
  m.solverFactory=()=>({check:async()=>{throw new Error('Ollama is not reachable.');},solve:async()=>{throw new Error('Opinion should use no model');}});
  m.run({...runData(),settings:{randomOpinions:true,guessWhenStuck:false}});await m.job;
  assert.equal(m.state.phase,'complete');assert.equal(m.state.events.find(e=>e.type==='answer').answer.randomOpinion,true);
});
