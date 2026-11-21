const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {createMacVault}=require('../app/mac-vault.cjs');
const {testPdf}=require('./pdf-fixture.cjs');
(async()=>{
  assert.equal(process.platform,'darwin');
  const service='com.boltautomation.Bolt.test.'+randomUUID(),vault=createMacVault({service});
  try{
    const plain=JSON.stringify({password:'Fixture-🔒-not-a-real-login',session:{cookies:[{value:'fixture-session'}]}});
    const encrypted=await vault.protect(plain);
    assert.ok(!encrypted.includes('Fixture'));assert.equal(await createMacVault({service}).unprotect(encrypted),plain);
    console.log('Native macOS Keychain encryption and reopening passed.');
  }finally{execFileSync('/usr/bin/security',['delete-generic-password','-a','local-encryption-key','-s',service],{stdio:'ignore'});}
  const project=path.resolve(__dirname,'..'),root=path.join(project,'test-results');await fs.mkdir(root,{recursive:true});
  const temp=await fs.mkdtemp(path.join(root,'mac package with spaces '));
  try{
    const zip=path.join(project,'releases',require('../package.json').artifacts[process.arch]);
    const checksum=(await fs.readFile(zip+'.sha256','utf8')).split(/\s/)[0];assert.equal(createHash('sha256').update(await fs.readFile(zip)).digest('hex'),checksum);
    execFileSync('/usr/bin/ditto',['-x','-k',zip,temp]);
    const bundle=path.join(temp,'Bolt'),resources=path.join(bundle,'resources');
    const manifest=JSON.parse(await fs.readFile(path.join(bundle,'package-manifest.json'),'utf8'));
    assert.equal(manifest.platform,'darwin');assert.equal(manifest.architecture,process.arch);
    assert.equal(manifest.versionName,require('../package.json').versionName);
    for(const file of manifest.files){assert.ok(!file.path.split('/').includes('..'));assert.ok(!/(^|\/)(\.app-runtime|tests|test-results)(\/|$)/.test(file.path));const data=await fs.readFile(path.join(bundle,file.path));assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,file.path);}
    const checked=execFileSync('/bin/bash',[path.join(bundle,'Start Bolt.command'),'--check'],{cwd:temp,encoding:'utf8',env:{...process.env,PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},timeout:15000});assert.equal(JSON.parse(checked.trim()).ok,true);
    const fixture=path.join(temp,'fixture.pdf');await fs.writeFile(fixture,testPdf(['Bolt macOS PDF package test with searchable local study evidence.']));
    const exercise=String.raw`
      const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
      (async()=>{const root=process.argv[1],{createApp}=require(path.join(root,'app/server.cjs')),{Browser}=require(path.join(root,'app/browser.cjs'));const app=await createApp({port:0}),browser=new Browser({runtimeRoot:path.join(root,'.app-runtime/smoke'),headless:true,origins:[app.origin]});try{
        const html=await(await fetch(app.origin)).text();assert.ok(html.includes('https://ollama.com/download/mac'));assert.ok(html.includes('macOS login Keychain'));assert.ok(html.includes('Version '+require(path.join(root,'package.json')).versionName));assert.ok(!html.includes('__APP_VERSION__'));
        const response=await fetch(app.origin+'/api/study/import?name=fixture.pdf',{method:'POST',headers:{'X-App-Token':app.token,'Content-Type':'application/pdf'},body:await fs.readFile(process.argv[2])});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.document.pages,1);
        const signal=AbortSignal.timeout(60000);await browser.launch(signal);await browser.navigate(app.origin,signal);assert.ok(await browser.evaluate(()=>document.getElementById('run')));console.log('Packaged Mac runtime, PDF worker, setup UI and real Chrome passed.');
      }finally{await browser.close();await app.close();}})().catch(error=>{console.error(error);process.exitCode=1});`;
    console.log(execFileSync(path.join(resources,'runtime/node'),['-e',exercise,resources,fixture],{encoding:'utf8',timeout:90000}).trim());
    console.log('Mac archive hashes, executable launcher, no Node on PATH, and extraction path with spaces passed.');
  }finally{assert.equal(path.dirname(temp),root);await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
