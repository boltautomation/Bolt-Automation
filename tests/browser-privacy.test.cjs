const {test}=require('node:test');
const assert=require('node:assert/strict');
const {findBrowser}=require('../app/browser.cjs');
const {BrowserPrivacy,BLOCKED_URLS}=require('../app/browser-privacy.cjs');

test('browser selection prefers Chrome, supports Brave and never automatically selects Edge',()=>{
  const env={ProgramFiles:'C:/Programs','ProgramFiles(x86)':'C:/Programs32',LOCALAPPDATA:'C:/Local'};
  assert.equal(findBrowser({env,exists:()=>true}),'C:/Programs/Google/Chrome/Application/chrome.exe');
  assert.equal(findBrowser({env,exists:file=>file.includes('BraveSoftware')}),'C:/Programs/BraveSoftware/Brave-Browser/Application/brave.exe');
  assert.throws(()=>findBrowser({env,exists:file=>file.includes('Edge')}),/Install Google Chrome or Brave/);
  assert.equal(findBrowser({env:{...env,CHATTERHIGH_BROWSER:'C:/Custom/brave.exe'},exists:()=>true}),'C:/Custom/brave.exe');
});

function fixture(strict=true){
  const calls=[],listeners=new Map();
  const protocol={send:async(method,params,session)=>{calls.push({method,params,session});return {};},on:(method,fn)=>{listeners.set(method,fn);return ()=>listeners.delete(method);}};
  return {calls,listeners,protocol,privacy:new BrowserPrivacy(protocol,'account',{strict})};
}

test('browser defaults apply no custom headers, blocking, cookie or permission overrides',async()=>{
  const f=fixture(false);await f.privacy.start();
  assert.deepEqual(f.calls,[]);assert.equal(f.listeners.size,0);
  await f.privacy.protect('session',{type:'page',targetId:'quiz'});
  assert.deepEqual(f.calls,[]);
  const failed=fixture(false);failed.protocol.send=async()=>{throw new Error('unsupported command');};
  await failed.privacy.protect('session',{type:'page',targetId:'quiz'});
  assert.doesNotThrow(()=>failed.privacy.assert());
});

test('privacy applies blocking, opt-out headers, cookie restrictions and child attachment before resuming',async()=>{
  const f=fixture();await f.privacy.start();
  assert.deepEqual(f.calls[0],{method:'Browser.grantPermissions',params:{browserContextId:'account',permissions:[]},session:undefined});
  await f.privacy.protect('session',{type:'page',targetId:'quiz'},true);
  const commands=f.calls.filter(c=>c.session==='session');
  assert.deepEqual(commands.map(c=>c.method),['Network.enable','Network.setBlockedURLs','Network.setExtraHTTPHeaders','Network.setCookieControls','Target.setAutoAttach','Runtime.runIfWaitingForDebugger']);
  assert.deepEqual(commands[3].params,{enableThirdPartyCookieRestriction:true});
  assert.ok(commands[1].params.urls.includes('*://*.google-analytics.com:*/*'));
  assert.deepEqual(commands[2].params.headers,{DNT:'1','Sec-GPC':'1'});
  assert.equal(commands[4].params.waitForDebuggerOnStart,true);
  f.privacy.close();assert.equal(f.listeners.size,0);
});

test('workers receive network protection and privacy failures stop a new page',async()=>{
  const f=fixture();await f.privacy.protect('worker',{type:'worker',targetId:'worker'},true);
  assert.ok(!f.calls.some(c=>c.method==='Network.setCookieControls'));
  assert.equal(f.calls.at(-1).method,'Runtime.runIfWaitingForDebugger');
  const failed=fixture();failed.protocol.send=async(method,params)=>{
    failed.calls.push({method,params});if(method==='Network.setBlockedURLs')throw new Error('unsupported command');
    return method==='Target.getTargetInfo'?{targetInfo:{targetId:'popup'}}:{};
  };
  await assert.rejects(failed.privacy.protect('popup-session',{targetId:'popup',type:'page'},true),/privacy controls/);
  assert.ok(failed.calls.some(c=>c.method==='Target.closeTarget'));
  assert.ok(!failed.calls.some(c=>c.method==='Runtime.runIfWaitingForDebugger'));
  assert.throws(()=>failed.privacy.assert(),/privacy controls/);
});

test('tracker patterns are host-scoped instead of blocking essential research and login domains',()=>{
  for(const host of ['google-analytics.com','hotjar.com','clarity.ms'])assert.ok(BLOCKED_URLS.includes(`*://${host}/*`));
  assert.ok(!BLOCKED_URLS.some(pattern=>/chatterhigh|cloudflare|google\.com|canada\.ca/.test(pattern)));
});
