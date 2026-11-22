const {setTimeout:wait}=require('node:timers/promises');
const {readResearchPage}=require('./research-page.cjs');
const {publicUrl,sourceIssue}=require('./sources.cjs');

async function followResearchLinks(page,question,initial,signal,{maxPages=2,maxDepth=2,budgetMs=12000,validateUrl=publicUrl,onVisit=()=>{}}={}){
  const origin=new URL(initial.url).origin,visited=new Set([initial.url]),queue=[],sources=[],owned=new Set();
  const deadline=Date.now()+budgetMs,scope=AbortSignal.any([signal,AbortSignal.timeout(budgetMs)]);
  const safe=url=>{const value=validateUrl(url);if(value.origin!==origin)throw Error('Linked research left the source website.');return value.href;};
  const read=async(target,loaderId)=>{
    let loaded;
    for(let i=0;i<40&&Date.now()<deadline;i++){
      scope.throwIfAborted();const frame=(await target.command('Page.getFrameTree')).frameTree.frame,url=frame.url;
      if(!url||url==='about:blank'||loaderId&&frame.loaderId!==loaderId){await wait(100,undefined,{signal:scope});continue;}safe(url);
      loaded=await target.evaluate(readResearchPage,{prompt:question.prompt||question.text,options:question.options,expand:'focused',plan:true},{requireSite:false});
      if(loaded?.text?.length>80)break;
      await wait(100,undefined,{signal:scope});
    }
    for(const index of loaded?.mouseControls||[])await target.clickElement(i=>globalThis.__boltResearchControls?.[i],index,{signal:scope,requireSite:false});
    if(loaded?.mouseControls?.length){await wait(200,undefined,{signal:scope});loaded=await target.evaluate(readResearchPage,{prompt:question.prompt||question.text,options:question.options,plan:true},{requireSite:false});}
    if(loaded)safe(loaded.url);return loaded;
  };
  const enqueue=(parent,depth)=>{
    if(depth>maxDepth)return;
    for(const link of parent.navigation||[])if(!visited.has(link.url))queue.push({parent:parent.url,link,depth});
    queue.sort((a,b)=>b.link.score-a.link.score||a.depth-b.depth);
  };
  enqueue(initial,1);
  try{
    while(queue.length&&sources.length<maxPages&&Date.now()<deadline){
      scope.throwIfAborted();const item=queue.shift();if(visited.has(item.link.url))continue;visited.add(item.link.url);
      try{
        safe(item.parent);safe(item.link.url);
        if(await page.url()!==item.parent){
          const navigation=await page.command('Page.navigate',{url:safe(item.parent)});
          if(navigation.errorText)throw Error('The linked research page could not open.');
          await read(page,navigation.loaderId);
        }
        else await page.evaluate(readResearchPage,{prompt:question.prompt||question.text,options:question.options,plan:true},{requireSite:false});
        const before=new Set((await page.protocol.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
        const clicked=await page.clickElement(url=>globalThis.__boltResearchLinks?.find(item=>item.url===url)?.element,item.link.url,{signal:scope,requireSite:false});
        if(!clicked)continue;
        let target=page;
        for(let i=0;i<50;i++){
          scope.throwIfAborted();
          const opened=(await page.protocol.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&!before.has(t.targetId)&&(t.openerId===page.targetId||t.browserContextId===page.contextId));
          if(opened){
            owned.add(opened.targetId);
            const {sessionId}=await page.protocol.send('Target.attachToTarget',{targetId:opened.targetId,flatten:true});
            target=Object.assign(Object.create(Object.getPrototypeOf(page)),{protocol:page.protocol,sessionId,targetId:opened.targetId,contextId:page.contextId,origins:page.origins,mouseOptions:page.mouseOptions,privacy:page.privacy,strictPrivacy:page.strictPrivacy});
            await target.command('Page.bringToFront');break;
          }
          if(await page.url()!==item.parent)break;
          await wait(80,undefined,{signal:scope});
        }
        const loaded=await read(target);
        if(loaded?.text?.length>80&&!sourceIssue(loaded)&&loaded.url!==item.parent&&!sources.some(source=>source.url===loaded.url)){
          visited.add(loaded.url);sources.push(loaded);enqueue(loaded,item.depth+1);onVisit({url:loaded.url,status:'read'});
        }
      }catch(error){signal.throwIfAborted();onVisit({url:item.link.url,status:'unavailable',reason:error.message});if(error.code==='SESSION_EXPIRED')throw error;if(scope.aborted)break;}
    }
  }catch(error){signal.throwIfAborted();if(!scope.aborted)throw error;}
  finally{for(const targetId of owned)await page.protocol.send('Target.closeTarget',{targetId}).catch(()=>{});}
  return sources;
}
module.exports={followResearchLinks};
