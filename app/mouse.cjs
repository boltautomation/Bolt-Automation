const {setTimeout:wait}=require('node:timers/promises');
const {randomUUID}=require('node:crypto');

function motionPath(from,to,random=Math.random){
  const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy);
  const bend=(random()-.5)*Math.min(70,distance*.22),nx=distance?-dy/distance:0,ny=distance?dx/distance:0;
  const a={x:from.x+dx*.3+nx*bend,y:from.y+dy*.3+ny*bend};
  const b={x:from.x+dx*.75+nx*bend,y:from.y+dy*.75+ny*bend};
  const steps=Math.max(8,Math.min(36,Math.ceil(distance/18)));
  return Array.from({length:steps},(_,i)=>{
    const t=(i+1)/steps,u=t*t*(3-2*t),v=1-u;
    return {x:v*v*v*from.x+3*v*v*u*a.x+3*v*u*u*b.x+u*u*u*to.x,y:v*v*v*from.y+3*v*v*u*a.y+3*v*u*u*b.y+u*u*u*to.y};
  });
}

// Runs in the page's isolated world. The overlay cannot intercept page input.
function installCursor(position){
  globalThis.__boltPointer ||= {token:null,move:null,press:null};
  if(!globalThis.__boltPointerListening){
    globalThis.__boltPointerListening=true;
    for(const [type,kind] of [['mousemove','move'],['mousedown','press']])document.addEventListener(type,event=>{
      if(event.isTrusted){const pointer=globalThis.__boltPointer;pointer[kind]={token:pointer.token,x:event.clientX,y:event.clientY};}
    },true);
  }
  if(!globalThis.__boltCursor||!globalThis.__boltCursor.isConnected){
    const host=document.createElement('span');host.dataset.boltCursor='';host.setAttribute('aria-hidden','true');
    host.style.cssText='position:fixed!important;left:0!important;top:0!important;width:22px!important;height:28px!important;z-index:2147483647!important;pointer-events:none!important;contain:layout style!important;';
    const shadow=host.attachShadow({mode:'closed'});
    shadow.innerHTML='<style>:host{pointer-events:none}svg{display:block;filter:drop-shadow(1px 2px 2px #0008)}:host([data-pressed]) svg{filter:drop-shadow(0 0 4px #9de8ff)}</style><svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg"><path d="M2 2v21l5-5 4 8 4-2-4-8h8Z" fill="#f5faff" stroke="#243442" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.append(host);globalThis.__boltCursor=host;
    document.addEventListener('mousemove',event=>{const cursor=globalThis.__boltCursor;if(cursor?.isConnected)cursor.style.transform=`translate(${event.clientX}px,${event.clientY}px)`;},true);
    document.addEventListener('mousedown',()=>globalThis.__boltCursor?.setAttribute('data-pressed',''),true);
    document.addEventListener('mouseup',()=>globalThis.__boltCursor?.removeAttribute('data-pressed'),true);
  }
  globalThis.__boltCursor.style.transform=`translate(${position.x}px,${position.y}px)`;
}

function pointerFeedback({token,kind='move',arm=false}){
  const pointer=globalThis.__boltPointer;
  if(!pointer)return null;
  if(arm){pointer.token=token;pointer[kind]=null;return null;}
  const point=pointer[kind];
  return point?.token===token?{x:point.x,y:point.y}:null;
}

function locateTarget(find,argument,token,checkPoint){
  const targets=globalThis.__boltMouseTargets||=new Map();
  const original=find(argument),saved=targets.get(token);
  let lastPoint=checkPoint,lastCandidate=null;
  const describe=element=>element?.isConnected?{tag:element.tagName,id:element.id,class:typeof element.className==='string'?element.className:'',rect:element.getBoundingClientRect().toJSON(),pointerEvents:getComputedStyle(element).pointerEvents}:null;
  const fail=(message,code)=>{
    const error=new Error(message);error.code=code;
    const point=lastPoint&&Number.isFinite(lastPoint.x)&&Number.isFinite(lastPoint.y)?{x:lastPoint.x,y:lastPoint.y}:null;
    error.details={phase:checkPoint?.phase||'locating',point,target:describe(original),labels:[...(original?.labels||[])].slice(0,3).map(describe),candidate:describe(lastCandidate||saved?.element),hit:point?describe(document.elementFromPoint(point.x,point.y)):null,stack:point?document.elementsFromPoint(point.x,point.y).slice(0,4).map(describe):[]};
    throw error;
  };
  if(!original){if(checkPoint)fail('The mouse target disappeared. Scan the page again.','MOUSE_TARGET_CHANGED');return null;}
  const visible=element=>element?.isConnected&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none'&&Number(getComputedStyle(element).opacity)!==0;
  if(original.matches(':disabled')||original.closest('[inert],[aria-disabled=true]')||(!original.matches('input[type=radio],input[type=checkbox]')&&getComputedStyle(original).pointerEvents==='none'))fail('This control is disabled by the page. Complete its required Research or page step before submitting.','MOUSE_TARGET_DISABLED');
  if(original.closest('[hidden]'))throw new Error('The mouse target is hidden.');
  const state=JSON.stringify([original.checked,original.getAttribute('aria-checked'),original.getAttribute('aria-selected')]);
  const accepts=(element,x,y)=>{
    lastPoint={x,y};lastCandidate=element;
    const hit=document.elementFromPoint(x,y);
    if(!hit||!(hit===element||element.contains(hit)||hit===original))return false;
    // A nested link or another form control does not activate this answer.
    const control=hit.closest('a,button,input,select,textarea,label,[role=button],[role=radio],[role=checkbox]');
    return !control||control===original||control===element||control.contains(element);
  };
  const inside=(element,x,y)=>x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&[...element.getClientRects()].some(rect=>x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.bottom);
  let element,x,y;
  if(checkPoint){
    if(!saved||saved.original!==original||!visible(saved.element)||saved.url!==location.href||saved.state!==state)fail('The mouse target changed while the cursor was moving. Scan the page again.','MOUSE_TARGET_CHANGED');
    element=saved.element;({x,y}=checkPoint);
    if(!checkPoint.refresh&&!inside(element,x,y))fail('The mouse target moved. Retrying its new position.','MOUSE_TARGET_MOVED');
  }
  if(!checkPoint||checkPoint.refresh&&(!inside(element,x,y)||!accepts(element,x,y))){
    // Styled radios can have a clipped 1px input that still has a client rect.
    // Its associated label is the actual visible mouse target.
    const candidates=checkPoint?[saved.element]:[...new Set([...(original.labels||[]),original])].filter(visible);
    if(!candidates.length)fail('The mouse target is not visible yet.','MOUSE_TARGET_MOVED');
    const pick=()=>{
      for(const candidate of candidates){
        // Wide flex labels include a lot of empty space. Aim at their visible
        // text first, while keeping the associated label as the click guard.
        const textRects=[],walker=document.createTreeWalker(candidate,NodeFilter.SHOW_TEXT);
        let node;
        while((node=walker.nextNode())&&textRects.length<40){
          if(!node.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(node);textRects.push(...range.getClientRects());
        }
        for(const rect of [...textRects,...candidate.getClientRects()]){
          const left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
          if(right<=left||bottom<=top)continue;
          for(const [fx,fy] of [[.5,.5],[.2,.5],[.8,.5],[.5,.2],[.5,.8],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){
            const px=left+(right-left)*fx,py=top+(bottom-top)*fy;
            if(inside(candidate,px,py)&&accepts(candidate,px,py)){element=candidate;x=px;y=py;return true;}
          }
        }
      }
      return false;
    };
    element=null;
    if(!pick()&&!checkPoint){
      // Scrolling an already-clickable row can trigger sticky-header reflows
      // and scroll anchoring on the site. Only scroll when it is necessary.
      candidates[0].scrollIntoView({block:'center',inline:'center',behavior:'instant'});
      pick();
    }
    if(!element&&!candidates.some(candidate=>[...candidate.getClientRects()].some(r=>r.width>0&&r.height>0)))fail('The answer control layout is not ready yet.','MOUSE_TARGET_MOVED');
    if(element){targets.clear();targets.set(token,{original,element,url:location.href,state});}
  }
  if(!element||!accepts(element,x,y))fail('The mouse target is covered by another control.','MOUSE_TARGET_OBSCURED');
  return {x,y,width:innerWidth,height:innerHeight};
}

class BrowserMouse{
  constructor(browser,{durationScale=1,random=Math.random,sleep=(ms,signal)=>wait(ms,undefined,{signal})}={}){
    Object.assign(this,{browser,durationScale,random,sleep});this.position={x:24,y:24};
  }
  async click(find,argument,{signal=new AbortController().signal,requireSite=true,beforePress=async()=>{}}={}){
    signal.throwIfAborted();
    // In headed Chrome, mouse events can stall on an inactive/occluded tab.
    // Activate the target before measuring it or dispatching the movement path.
    await this.browser.command('Page.bringToFront');
    signal.throwIfAborted();
    const token=randomUUID();
    const locate=async point=>{
      const result=await this.browser.evaluate(`(() => { try { return {target:(${locateTarget.toString()})(${find.toString()},${JSON.stringify(argument)??'null'},${JSON.stringify(token)},${JSON.stringify(point)??'null'})}; } catch(error) { return {error:error.message,code:error.code,details:error.details}; } })()`,undefined,{requireSite});
      if(result?.error){const error=new Error(String(result.error).slice(0,400));error.code=result.code;error.details=result.details;throw error;}
      return result?.target||null;
    };
    const target=await locate();if(!target)return false;
    this.position={x:Math.max(0,Math.min(target.width-1,this.position.x)),y:Math.max(0,Math.min(target.height-1,this.position.y))};
    await this.browser.evaluate(installCursor,this.position,{requireSite});
    let mapping={sx:1,sy:1,ox:0,oy:0},inputPosition,actual,desired=target,calibrations=0;
    const mapped=point=>({x:point.x*mapping.sx+mapping.ox,y:point.y*mapping.sy+mapping.oy});
    const feedback=async(kind,arm=false)=>{
      signal.throwIfAborted();
      return this.browser.evaluate(pointerFeedback,{token,kind,arm},{requireSite});
    };
    const coordinateError=()=>{const error=new Error('Chrome placed the mouse away from the intended control. No click was completed; retrying mouse calibration.');error.code='MOUSE_COORDINATE_MISMATCH';return error;};
    const observe=async kind=>{
      const point=await feedback(kind);
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw coordinateError();
      return point;
    };
    const moveInput=async point=>{
      await feedback('move',true);
      await this.browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0,pointerType:'mouse'});
      inputPosition=point;
      return observe('move');
    };
    const moveTo=async destination=>{
      const path=motionPath(this.position,destination,this.random);
      const duration=Math.min(280,100+Math.sqrt(Math.hypot(destination.x-this.position.x,destination.y-this.position.y))*5)*this.durationScale;
      const started=performance.now();
      let observed;
      for(let index=0;index<path.length;index++){
        const point=path[index],input=mapped(point);
        signal.throwIfAborted();
        if(index===path.length-1)observed=await moveInput(input);
        else await this.browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...input,button:'none',buttons:0,pointerType:'mouse'});
        this.position=point;
        const remaining=started+duration*(index+1)/path.length-performance.now();
        if(remaining>0)await this.sleep(remaining,signal);
      }
      return observed;
    };
    const calibrate=async observed=>{
      // Learn the actual input-to-CSS transform from trusted movement events.
      // Both probes are movement only; no button is pressed during calibration.
      const first={...inputPosition},probe={
        x:Math.max(1,Math.min(target.width-2,first.x+(first.x<target.width/2?128:-128))),
        y:Math.max(1,Math.min(target.height-2,first.y+(first.y<target.height/2?128:-128)))
      };
      const path=motionPath(first,probe,this.random);
      let second;const started=performance.now();
      for(let index=0;index<path.length;index++){
        signal.throwIfAborted();
        if(index===path.length-1)second=await moveInput(path[index]);
        else await this.browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...path[index],button:'none',buttons:0,pointerType:'mouse'});
        const remaining=started+100*this.durationScale*(index+1)/path.length-performance.now();
        if(remaining>0)await this.sleep(remaining,signal);
      }
      const sx=(probe.x-first.x)/(second.x-observed.x),sy=(probe.y-first.y)/(second.y-observed.y);
      if(![sx,sy].every(scale=>Number.isFinite(scale)&&scale>=.1&&scale<=10))throw coordinateError();
      mapping={sx,sy,ox:probe.x-sx*second.x,oy:probe.y-sy*second.y};
      this.position=second;
    };
    actual=await moveTo(target);
    // Remeasure after the page has reacted to scrolling/hover and after quiz
    // validation. A correction stays on this same DOM control and question.
    for(let correction=0;;correction++){
      await beforePress();signal.throwIfAborted();
      if(Math.hypot(actual.x-desired.x,actual.y-desired.y)>2){
        if(calibrations++>=2)throw coordinateError();
        await calibrate(actual);actual=await moveTo(desired);continue;
      }
      const current=await locate({...actual,refresh:true,phase:'aiming'});
      if(Math.hypot(current.x-actual.x,current.y-actual.y)<.5)break;
      if(correction>=5){const error=new Error('The mouse target keeps moving. Retrying after the layout settles.');error.code='MOUSE_TARGET_MOVED';throw error;}
      desired=current;actual=await moveTo(current);
    }
    await locate({...actual,phase:'before-press'});signal.throwIfAborted();
    let pressed=false;
    try{
      await feedback('press',true);signal.throwIfAborted();
      pressed=true;
      await this.browser.command('Input.dispatchMouseEvent',{type:'mousePressed',...inputPosition,button:'left',buttons:1,clickCount:1,pointerType:'mouse'});
      if(this.durationScale>0)await this.sleep((35+this.random()*20)*this.durationScale,signal);
      signal.throwIfAborted();
      await locate({...await observe('press'),phase:'after-press'});signal.throwIfAborted();
      await this.browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',...inputPosition,button:'left',buttons:0,clickCount:1,pointerType:'mouse'});
      pressed=false;return true;
    }finally{
      if(pressed){
        // Release away from the pressed control so Stop does not activate it.
        this.position={x:0,y:0};
        const cancel=mapped(this.position);
        await this.browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...cancel,button:'left',buttons:1,pointerType:'mouse'}).catch(()=>{});
        await this.browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',...cancel,button:'left',buttons:0,clickCount:1,pointerType:'mouse'}).catch(()=>{});
      }
    }
  }
}
module.exports={BrowserMouse,motionPath};
