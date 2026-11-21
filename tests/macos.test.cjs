const {test}=require('node:test'),assert=require('node:assert/strict');
const {createMacVault}=require('../app/mac-vault.cjs');
const {findBrowser}=require('../app/browser.cjs');
test('macOS discovers Chrome and Brave in system and user Applications',()=>{
  const env={HOME:'/Users/fixture'},platform='darwin';
  assert.equal(findBrowser({platform,env,exists:()=>true}),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.equal(findBrowser({platform,env,exists:p=>p.startsWith('/Users/')&&p.includes('Brave')}),'/Users/fixture/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  assert.equal(findBrowser({platform,env:{...env,BOLT_BROWSER:'/custom/chrome'},exists:p=>p==='/custom/chrome'}),'/custom/chrome');
  assert.throws(()=>findBrowser({platform,env,exists:()=>false}),/Install Google Chrome or Brave/);
});
test('Mac vault stores only an encryption key in Keychain and authenticates ciphertext',async()=>{
  let stored='',writes=0;const calls=[];
  const run=async(args,input)=>{calls.push({args,input});if(args[0]==='-i'){writes++;stored=input.match(/-w ([0-9a-f]{64})/)[1];return{code:0,stdout:''};}return stored?{code:0,stdout:stored}:{code:44,stdout:''};};
  const vault=createMacVault({run}),plain=JSON.stringify({password:'test-Sëcret!🔒',cookie:'fixture-cookie'});
  const encrypted=await vault.protect(plain);assert.ok(!encrypted.includes('fixture-cookie'));assert.equal(await vault.unprotect(encrypted),plain);assert.equal(writes,1);
  assert.ok(calls.every(c=>!c.args.join(' ').includes(stored)));assert.ok(!JSON.stringify(calls).includes('fixture-cookie'));
  assert.equal(await createMacVault({run}).unprotect(encrypted),plain);
  const bytes=Buffer.from(encrypted.split(':')[1],'base64');bytes[bytes.length-1]^=1;
  await assert.rejects(vault.unprotect('mac-keychain-v1:'+bytes.toString('base64')),/Keychain/);
  await assert.rejects(vault.unprotect('windows-dpapi-blob'),/Keychain/);
});
test('locked or missing Mac Keychain fails closed without replacing a key',async()=>{
  let writes=0;const run=async(args)=>{if(args[0]==='-i')writes++;return{code:36,stdout:''};};
  await assert.rejects(createMacVault({run}).protect('secret'),/Keychain/);assert.equal(writes,0);
  const data='mac-keychain-v1:'+Buffer.alloc(40).toString('base64');
  await assert.rejects(createMacVault({run:async()=>({code:44,stdout:''})}).unprotect(data),/Keychain/);
});
