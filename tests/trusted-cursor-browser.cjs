const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"require-trusted-types-for 'script'; trusted-types 'none'");res.end('<!doctype html><button id="show">Show transcript</button><script>document.getElementById("show").onclick=e=>{document.body.dataset.clicked=String(e.isTrusted);};</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,b=new Browser({headless:true,origins:[origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(15000);
 try{await b.launch(signal);await b.navigate(origin,signal);await b.clickElement(()=>document.getElementById('show'),null,{signal});assert.equal(await b.evaluate(()=>document.body.dataset.clicked),'true');assert.equal(await b.evaluate(()=>!!document.querySelector('[data-bolt-cursor]')),true);console.log('PASS visible cursor and trusted mouse clicks work with strict Trusted Types without changing site security policy');}
 finally{await b.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
