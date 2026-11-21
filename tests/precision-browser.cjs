// Mouse accuracy checks use a local page shaped like the site's answer rows.
const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs');
const {BrowserMouse}=require('../app/mouse.cjs');
(async()=>{
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><style>
      body{margin:0;font:18px system-ui}main{margin:150px auto;width:640px}input{float:left;opacity:0;width:28px;height:13px;margin:0}
      label{display:flex;min-height:24px;margin-left:28px;margin-bottom:8px;cursor:pointer}button{padding:16px}
      #cover{position:fixed;inset:0;z-index:100;background:#0005}[hidden]{display:none!important}
    </style><main><fieldset><legend>Choose an answer.</legend><div><input id="first" type="radio" name="answer"><label for="first"><em>First answer</em></label></div><div><input id="second" type="radio" name="answer"><label for="second"><em>Second answer</em></label></div></fieldset><button id="moving">Moving target</button></main><div id="cover" hidden></div><pre id="events" hidden>[]</pre>
    <script>
    document.documentElement.dataset.scrollCalls='0';
    const scroll=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(...args){document.documentElement.dataset.scrollCalls=Number(document.documentElement.dataset.scrollCalls)+1;return scroll.apply(this,args);};
    document.addEventListener('click',e=>{const log=document.getElementById('events'),clicks=JSON.parse(log.textContent);clicks.push({id:e.target.id,tag:e.target.tagName,trusted:e.isTrusted,x:e.clientX,y:e.clientY});log.textContent=JSON.stringify(clicks);},true);
    </script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,signal=AbortSignal.timeout(45000);
  const browser=new Browser({headless:!process.argv.includes('--headed'),origins:[origin]});
  try{
    await browser.launch(signal);await browser.navigate(origin,signal);
    const mouse=new BrowserMouse(browser);
    // A wide answer row should be clicked on its text, without unnecessary scroll.
    await mouse.click(()=>document.getElementById('second'),null,{signal});
    assert.equal(await browser.evaluate(()=>document.getElementById('second').checked),true);
    const accuracy=await browser.evaluate(()=>{
      const hit=JSON.parse(document.getElementById('events').textContent).find(e=>e.tag==='EM'),rect=document.querySelector('label[for=second] em').getBoundingClientRect();
      return {hit,rect:rect.toJSON(),scrolls:Number(document.documentElement.dataset.scrollCalls)};
    });
    assert.ok(accuracy.hit);assert.equal(accuracy.hit.trusted,true);assert.equal(accuracy.scrolls,0);
    assert.ok(accuracy.hit.x>=accuracy.rect.left&&accuracy.hit.x<accuracy.rect.right);

    // Reflow after the initial measurement must be corrected before any press.
    const sleep=mouse.sleep;let shifted=false;
    mouse.sleep=async(ms,s)=>{
      if(!shifted){shifted=true;await browser.evaluate(()=>document.getElementById('moving').style.marginTop='130px');}
      await sleep(ms,s);
    };
    await mouse.click(()=>document.getElementById('moving'),null,{signal});
    const moving=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).filter(e=>e.id==='moving'));
    assert.equal(moving.length,1);assert.equal(moving[0].trusted,true);

    // Resizing/zooming changes CSS coordinates; the text hit remains accurate.
    mouse.sleep=sleep;mouse.durationScale=0;
    await browser.command('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1.5,mobile:false});
    await browser.evaluate(()=>document.querySelector('main').style.zoom='1.2');
    await mouse.click(()=>document.getElementById('first'),null,{signal});
    assert.equal(await browser.evaluate(()=>document.getElementById('first').checked),true);
    assert.ok((await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent))).every(e=>e.trusted));

    // A genuinely covered target still cannot be pressed.
    await browser.evaluate(()=>document.getElementById('cover').hidden=false);
    const before=await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).length);
    await assert.rejects(mouse.click(()=>document.getElementById('moving'),null,{signal}),error=>error.code==='MOUSE_TARGET_OBSCURED');
    assert.equal(await browser.evaluate(()=>JSON.parse(document.getElementById('events').textContent).length),before);
    console.log('PASS answer-text accuracy, no scrolling of visible rows, re-aiming after reflow before pressing, scaled/resized coordinates, trusted clicks, and genuine-overlay protection');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
