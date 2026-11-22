const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {testPdf}=require('./pdf-fixture.cjs');
const execute=promisify(execFile);
(async()=>{
  const project=path.resolve(__dirname,'..'),zip=path.join(process.env.BOLT_PACKAGE_DIR||path.join(project,'releases'),require('../package.json').artifacts.windows);
  const temporary=path.join(project,'test-results',`package smoke ${randomUUID()}`);
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  await fs.mkdir(temporary,{recursive:true});
  try{
    const expected=(await fs.readFile(zip+'.sha256','utf8')).trim().split(/\s+/)[0];
    assert.equal(createHash('sha256').update(await fs.readFile(zip)).digest('hex'),expected);
    await execute(powershell,['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:BOLT_TEST_ZIP, $env:BOLT_TEST_OUT)"],{windowsHide:true,env:{...process.env,BOLT_TEST_ZIP:zip,BOLT_TEST_OUT:temporary},timeout:60000});
    const bundle=path.join(temporary,'Bolt'),resources=path.join(bundle,'resources');
    const manifest=JSON.parse((await fs.readFile(path.join(bundle,'package-manifest.json'),'utf8')).replace(/^\uFEFF/,''));
    assert.equal(manifest.versionName,require('../package.json').versionName);
    for(const file of manifest.files){
      assert.ok(!path.isAbsolute(file.path)&&!file.path.split(/[\\/]/).includes('..'));
      assert.ok(!/(^|\/)(?:\.app-runtime|\.browser-test-profile|tests|test-results|archives|previous)(\/|$)|\.(?:log|zip)$/.test(file.path),file.path);
      const bytes=await fs.readFile(path.join(bundle,file.path));assert.equal(bytes.length,file.bytes,file.path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
    }
    const strippedEnvironment=Object.fromEntries(Object.entries(process.env).filter(([name])=>!['path','node_path','node_options'].includes(name.toLowerCase())));
    strippedEnvironment.Path=path.join(process.env.SystemRoot,'System32');
    const check=await execute(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(bundle,'tools/Start-Bolt.ps1'),'-CheckOnly'],{cwd:temporary,windowsHide:true,env:strippedEnvironment,timeout:15000});
    const checked=JSON.parse(check.stdout.trim());assert.equal(checked.ok,true);assert.equal(checked.bundledRuntime,true);assert.equal(checked.resourceRoot,resources);
    const fixture=path.join(temporary,'practice.pdf');await fs.writeFile(fixture,testPdf(['Bolt package fixture: personal study and reliable source review.']));
    const exercise=String.raw`
      const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
      (async()=>{const root=process.argv[1],{createApp}=require(path.join(root,'app/server.cjs'));const app=await createApp({port:0});try{
        const health=await(await fetch(app.origin+'/health')).json();assert.ok(health.app.endsWith('local-app'));
        const html=await(await fetch(app.origin)).text();assert.match(html,/id="setup-guide"/);assert.match(html,/id="intended-use"/);assert.ok(html.includes('Version '+require(path.join(root,'package.json')).versionName));assert.ok(!html.includes('__APP_VERSION__'));
        for(const route of ['/core.js','/client.js','/app.css','/assets/bolt.png'])assert.equal((await fetch(app.origin+route)).status,200,route);
        const state=await(await fetch(app.origin+'/api/state',{headers:{'X-App-Token':app.token}})).json();assert.deepEqual(state.accounts,[]);assert.deepEqual(state.queue,[]);
        const response=await fetch(app.origin+'/api/study/import?name=practice.pdf',{method:'POST',headers:{'X-App-Token':app.token,'Content-Type':'application/pdf'},body:await fs.readFile(process.argv[2])});
        const imported=await response.json();assert.equal(response.status,200,JSON.stringify(imported));assert.equal(imported.document.pages,1);
        console.log('Packaged server, interface, engine, empty private stores, and real PDF worker passed.');
      }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});`;
    const runtime=path.join(resources,'runtime/node.exe');
    const exercised=await execute(runtime,['-e',exercise,resources,fixture],{cwd:temporary,windowsHide:true,env:strippedEnvironment,timeout:30000});
    console.log(`PASS ${manifest.files.length} package hashes; launcher with no Node on PATH; extraction path with spaces; ${exercised.stdout.trim()}`);
  }finally{
    assert.equal(path.dirname(temporary),path.join(project,'test-results'));assert.ok(path.basename(temporary).startsWith('package smoke '));
    await fs.rm(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
