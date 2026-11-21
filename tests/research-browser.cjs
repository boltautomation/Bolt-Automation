const http=require('node:http');
const assert=require('node:assert/strict');
const {setTimeout:wait}=require('node:timers/promises');
const {Browser}=require('../app/browser.cjs');
const {readResearchPage}=require('../app/research-page.cjs');
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><style>.collapse{display:none}[hidden]{display:none}</style><header><button aria-expanded="false" aria-controls="menu" onclick="document.body.dataset.badClick='true'">Account settings</button><div id="menu" hidden>Private navigation</div></header><main><h1>Research veterinarian</h1><p>I do research to help improve the health of dairy cattle.</p><input type="hidden" value="DO-NOT-READ-INPUT-VALUES"><script>window.badClick=false</script><button aria-expanded="false" data-bs-target="#effect">How I affect peoples’ lives</button><div id="effect" class="collapse"><p>I help understand how bacteria respond to antibiotics. This helps us keep antibiotics effective for humans and animals.</p></div><button id="lazy-button" aria-expanded="false" aria-controls="lazy" onclick="this.setAttribute('aria-expanded','true');setTimeout(()=>document.getElementById('lazy').innerHTML='<p>Delayed research evidence is now available.</p>',100)">My research methods</button><div id="lazy" hidden></div><a href="/delete" onclick="document.body.dataset.badClick='true'">Delete content</a><details><summary>Career path</summary><p>I studied veterinary medicine at university.</p></details></main>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=new Browser({headless:true,origins:[origin]});
  try{
    const signal=AbortSignal.timeout(30000);await browser.launch(signal);await browser.navigate(origin,signal);
    const prompt='Why does she feel her work is important? Hint: see the “How I affect people’s lives” section.';
    const initial=await browser.evaluate(readResearchPage,{prompt});
    assert.match(initial.text,/I help understand how bacteria respond to antibiotics/);
    assert.match(initial.text,/studied veterinary medicine/);
    assert.ok(initial.text.startsWith('How I affect peoples’ lives:'));
    assert.deepEqual(initial.focused,['How I affect peoples’ lives']);
    assert.ok(!initial.text.includes('DO-NOT-READ-INPUT-VALUES'));
    assert.equal(await browser.evaluate(()=>document.body.dataset.badClick==='true'),false);
    await browser.evaluate(readResearchPage,{prompt,expand:true});await wait(200);
    const refreshed=await browser.evaluate(readResearchPage,{prompt});
    assert.match(refreshed.text,/Delayed research evidence is now available/);
    assert.equal(await browser.evaluate(()=>document.body.dataset.badClick==='true'),false);
    assert.equal(await browser.url(),origin+'/');
    console.log('PASS research reader finds collapsed sections, follows the hint, expands lazy evidence, and avoids unrelated controls and form values');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
