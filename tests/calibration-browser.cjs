// Reproduce a Research click landing on an answer because input coordinates
// have an offset/scale. The simulated mismatch affects real trusted CDP input.
const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/research')return res.end('<h1>Research source</h1>');
    res.end(`<!doctype html><style>body{margin:0;font:18px system-ui}#research{position:absolute;left:120px;top:120px;width:160px;height:48px}label{position:absolute;left:120px;top:200px;width:300px;height:48px;background:#eee}label+label{top:260px}</style>
    <button id="research">Research</button><label><input type="radio" name="answer" id="a">First answer</label><label><input type="radio" name="answer" id="b">Second answer</label><pre id="events" hidden>[]</pre>
    <script>document.addEventListener('mousedown',e=>{const log=document.getElementById('events'),events=JSON.parse(log.textContent);events.push({id:e.target.id,tag:e.target.tagName,x:e.clientX,y:e.clientY,trusted:e.isTrusted});log.textContent=JSON.stringify(events);},true);document.getElementById('research').onclick=e=>{if(e.isTrusted)window.open('/research','_blank');};</script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,signal=AbortSignal.timeout(45000);
  const browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin],mouseOptions:{durationScale:0}});
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);
    const command=browser.command.bind(browser);
    let mismatch={sx:1,sy:1,ox:0,oy:80};
    browser.command=(method,params)=>{
      if(method==='Input.dispatchMouseEvent')params={...params,x:params.x*mismatch.sx+mismatch.ox,y:params.y*mismatch.sy+mismatch.oy};
      return command(method,params);
    };
    for(const transform of [mismatch,{sx:.8,sy:1.2,ox:35,oy:90},{sx:1.4,sy:.7,ox:20,oy:75}]){
      mismatch=transform;
      await browser.clickElement(()=>document.getElementById('research'),null,{signal});
      assert.equal(await browser.evaluate(()=>document.querySelectorAll('input:checked').length),0,'Research must never select an answer');
    }
    const presses=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent));
    assert.equal(presses.length,3);assert.ok(presses.every(e=>e.id==='research'&&e.trusted));
    const tabs=(await browser.protocol.send('Target.getTargets')).targetInfos.filter(t=>t.openerId===browser.targetId);
    assert.equal(tabs.length,3,'every Research click must open exactly one source tab');
    for(const tab of tabs)await browser.protocol.send('Target.closeTarget',{targetId:tab.targetId});

    // Missing feedback must stop before pressing, and report a coordinate error.
    const evaluate=browser.evaluate.bind(browser);
    browser.evaluate=(fn,arg,options)=>fn.name==='pointerFeedback'&&!arg.arm?Promise.resolve(null):evaluate(fn,arg,options);
    await assert.rejects(browser.mouse.click(()=>document.getElementById('research'),null,{signal}),error=>error.code==='MOUSE_COORDINATE_MISMATCH'&&!/covered/.test(error.message));
    assert.equal((await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent))).length,3);
    console.log('PASS Research offset/scale mismatches recalibrate from trusted movement; no answer presses or selections; one source tab per click; missing feedback prevents pressing with an accurate error');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
