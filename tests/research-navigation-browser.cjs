const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
const {readResearchPage}=require('../app/research-page.cjs');
const {followResearchLinks}=require('../app/research-navigation.cjs');
(async()=>{
  const visits=[],server=http.createServer((req,res)=>{
    visits.push(req.url);res.setHeader('Content-Type','text/html');
    const pages={
      '/':'<main><h1>Student learning resources</h1><p>Choose a topic to read the details for your research question. This introduction has no application deadline.</p><div hidden><input type=password value="PRIVATE-PASSWORD"></div><a href="/education" target="_blank">Education application deadlines</a><a href="/housing">Housing support</a><a href="/logout">Education logout</a><a href="http://external.invalid/education">Education external</a><form><button data-url="/submit">Education submit</button></form><button onclick="fetch(\'/delete\')">Delete education</button></main>',
      '/education':'<main><h1>Education</h1><p>The scholarship page has the current application deadline. Follow the deadline details link to read it.</p><button data-url="/deadline" onclick="location.href=\'/deadline\'">Scholarship application deadline details</button></main>',
      '/deadline':'<main><h1>Scholarship deadline details</h1><p>Applications for the example scholarship close on October 15. This is the exact date used in the controlled research fixture.</p><a href="/education">Education application deadlines</a></main>',
      '/housing':'<main><h1>Housing support</h1><p>This page provides general housing support information and is unrelated to scholarship dates or deadlines.</p></main>',
      '/fragmented':'<main><h1>A tiny widget</h1></main><section><p>Real education information lives outside the first main tag on this layout. Scholarship application information and deadlines are available on the education page.</p><a href="/education">Education application deadlines</a></section>',
      '/login':'<main><h1>Sign in</h1><input type=password></main>'
    };
    res.end('<!doctype html><title>Research navigation</title><style>a,button{display:block;margin:12px}</style>'+ (pages[req.url]||'<main>Missing</main>')+'<script>document.addEventListener("click",e=>{if(!e.isTrusted)e.preventDefault();},true);</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=new Browser({headless:true,origins:[origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(25000);
  const q={prompt:'What is the education scholarship application deadline?',options:[{text:'October 15'},{text:'September 10'}]};
  const read=()=>browser.evaluate(readResearchPage,{...q,plan:true});
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);const initial=await read();
    assert.ok(initial.text.length>80,'hidden login fields do not block public research');
    assert.ok(!initial.text.includes('PRIVATE-PASSWORD'));
    assert.equal(initial.navigation[0].url,origin+'/education');
    assert.ok(initial.navigation.every(link=>!link.url.includes('/logout')&&!link.url.includes('external.invalid')&&!link.url.includes('/submit')));
    const before=new Set((await browser.protocol.send('Target.getTargets')).targetInfos.map(target=>target.targetId));
    const linked=await followResearchLinks(browser,q,initial,signal,{validateUrl:value=>new URL(value)});
    assert.equal(linked.length,2);assert.equal(linked[1].url,origin+'/deadline');assert.match(linked[1].text,/October 15/);
    assert.ok(!visits.some(url=>/logout|submit|delete/.test(url)));
    assert.ok((await browser.protocol.send('Target.getTargets')).targetInfos.every(target=>before.has(target.targetId)),'linked popup tabs are closed');
    await browser.navigate(origin+'/fragmented',signal);const fragmented=await read();assert.match(fragmented.text,/Real education information/);assert.ok(fragmented.navigation.some(link=>link.url===origin+'/education'));
    await browser.navigate(origin+'/login',signal);assert.equal(await read(),null,'visible sign-in forms remain gated');
    await browser.navigate(origin,signal);const controller=new AbortController();controller.abort();
    await assert.rejects(followResearchLinks(browser,q,await read(),controller.signal,{validateUrl:value=>new URL(value)}),{name:'AbortError'});
    console.log('PASS hidden-login handling, ranked same-site mouse navigation, second-level content, page limit, unsafe-control exclusion and Stop');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
