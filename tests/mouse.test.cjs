const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BrowserMouse,motionPath}=require('../app/mouse.cjs');

test('cursor path reaches the exact target with curved, eased intermediate positions',()=>{
  const from={x:20,y:40},to={x:500,y:330},path=motionPath(from,to,()=>.8);
  assert.ok(path.length>=8&&path.length<=36);assert.deepEqual(path.at(-1),to);
  assert.ok(path.some(p=>Math.abs((p.x-from.x)*(to.y-from.y)-(p.y-from.y)*(to.x-from.x))>1));
  assert.ok(Math.hypot(path[0].x-from.x,path[0].y-from.y)<Math.hypot(path[10].x-path[9].x,path[10].y-path[9].y));
  assert.ok(path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

function fixture(options={}){
  const events=[],commands=[],controller=new AbortController(),pointer={};
  const browser={
    evaluate:async(fn,arg)=>{
      if(fn.name==='installCursor')return;
      if(fn.name==='pointerFeedback'){if(arg.arm){pointer[arg.kind]=null;return;}return pointer[arg.kind];}
      return {target:{x:200,y:120,width:800,height:600}};
    },
    command:async(method,event)=>{commands.push(method);if(method==='Page.bringToFront')return;assert.equal(method,'Input.dispatchMouseEvent');events.push(event);if(event.type==='mouseMoved')pointer.move={x:event.x,y:event.y};if(event.type==='mousePressed')pointer.press={x:event.x,y:event.y};}
  };
  const mouse=new BrowserMouse(browser,{durationScale:0,random:()=>.8,...options});
  return {mouse,events,commands,controller,browser};
}

test('click sends movement then left press and release; revalidates before pressing',async()=>{
  const f=fixture();let checked=false;
  await f.mouse.click(()=>null,null,{signal:f.controller.signal,beforePress:async()=>{
    checked=true;assert.ok(f.events.every(e=>e.type==='mouseMoved'));
  }});
  assert.equal(checked,true);assert.ok(f.events.length>=10);
  assert.equal(f.commands[0],'Page.bringToFront');
  assert.deepEqual(f.events.slice(-2).map(e=>e.type),['mousePressed','mouseReleased']);
  assert.deepEqual(f.events.slice(-2).map(({x,y})=>({x,y})),[{x:200,y:120},{x:200,y:120}]);
});

test('Stop during movement never presses a button',async()=>{
  const f=fixture({durationScale:1,sleep:async()=>f.controller.abort(new DOMException('Stop','AbortError'))});
  await assert.rejects(f.mouse.click(()=>null,null,{signal:f.controller.signal}),{name:'AbortError'});
  assert.ok(f.events.length>0);assert.ok(f.events.every(e=>e.type==='mouseMoved'));
});

test('Stop after pressing releases away from the target',async()=>{
  const f=fixture({durationScale:1,sleep:async(ms,signal)=>{
    if(f.events.at(-1)?.type==='mousePressed'){f.controller.abort(new DOMException('Stop','AbortError'));signal.throwIfAborted();}
  }});
  await assert.rejects(f.mouse.click(()=>null,null,{signal:f.controller.signal}),{name:'AbortError'});
  assert.equal(f.events.filter(e=>e.type==='mouseReleased').length,1);
  assert.deepEqual(f.events.at(-1),{type:'mouseReleased',x:0,y:0,button:'left',buttons:0,clickCount:1,pointerType:'mouse'});
});

test('changed target prevents pressing and an absent target is not clicked',async()=>{
  const f=fixture();
  await assert.rejects(f.mouse.click(()=>null,null,{beforePress:async()=>{throw new Error('Quiz changed');}}),/Quiz changed/);
  assert.ok(f.events.every(e=>e.type==='mouseMoved'));
  const absent=fixture();absent.browser.evaluate=async()=>null;
  assert.equal(await absent.mouse.click(()=>null,null),false);assert.deepEqual(absent.events,[]);
});
