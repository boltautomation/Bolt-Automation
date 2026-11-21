// A bounded built-in list of common analytics, advertising and session-replay hosts.
// This is not a complete tracker list or a guarantee of anonymous browsing.
const TRACKER_HOSTS=Object.freeze([
  'google-analytics.com','googletagmanager.com','doubleclick.net','googlesyndication.com','googleadservices.com','googletagservices.com',
  'connect.facebook.net','analytics.tiktok.com','bat.bing.com','snap.licdn.com','hotjar.com','hotjar.io','clarity.ms',
  'fullstory.com','mouseflow.com','crazyegg.com','mixpanel.com','amplitude.com','segment.io','segment.com',
  'heapanalytics.com','scorecardresearch.com','quantserve.com','adnxs.com','taboola.com','outbrain.com'
]);
const BLOCKED_URLS=Object.freeze(TRACKER_HOSTS.flatMap(host=>[
  `*://${host}/*`,`*://${host}:*/*`,`*://*.${host}/*`,`*://*.${host}:*/*`
]));
const AUTO_ATTACH={autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[
  {type:'page'},{type:'iframe'},{type:'worker'},{type:'shared_worker'},{type:'service_worker'},{exclude:true}
]};

class BrowserPrivacy{
  constructor(protocol,contextId,{strict=false}={}){Object.assign(this,{protocol,contextId,strict});this.sessions=new Map();this.errors=new Map();}
  async start(){
    if(!this.strict)return;
    // Only this app's private context is affected; normal browser profiles are untouched.
    await this.protocol.send('Browser.grantPermissions',{browserContextId:this.contextId,permissions:[]});
    this.unsubscribe=this.protocol.on('Target.attachedToTarget',event=>{
      const {sessionId,targetInfo,waitingForDebugger}=event;
      if(targetInfo.browserContextId!==this.contextId){
        if(waitingForDebugger)this.protocol.send('Runtime.runIfWaitingForDebugger',{},sessionId).catch(()=>{});
        return;
      }
      this.protect(sessionId,targetInfo,waitingForDebugger).catch(()=>{});
    });
    this.unsubscribeDetached=this.protocol.on('Target.detachedFromTarget',({sessionId})=>this.sessions.delete(sessionId));
    await this.protocol.send('Target.setAutoAttach',AUTO_ATTACH);
  }
  protect(sessionId,targetInfo,waitingForDebugger=false){
    if(!this.strict)return Promise.resolve();
    if(this.sessions.has(sessionId))return this.sessions.get(sessionId);
    const job=(async()=>{
      try{
        await this.protocol.send('Network.enable',{},sessionId);
        await this.protocol.send('Network.setBlockedURLs',{urls:BLOCKED_URLS},sessionId);
        await this.protocol.send('Network.setExtraHTTPHeaders',{headers:{DNT:'1','Sec-GPC':'1'}},sessionId);
        if(['page','iframe'].includes(targetInfo.type))await this.protocol.send('Network.setCookieControls',{enableThirdPartyCookieRestriction:true},sessionId);
        // Recursion includes child frames/workers, not just the original quiz tab.
        await this.protocol.send('Target.setAutoAttach',AUTO_ATTACH,sessionId);
        if(waitingForDebugger)await this.protocol.send('Runtime.runIfWaitingForDebugger',{},sessionId);
      }catch(error){
        // A research popup may close while its independent attachment finishes.
        const current=await this.protocol.send('Target.getTargetInfo',{targetId:targetInfo.targetId}).catch(()=>null);
        if(!current)return;
        const failure=new Error('Browser privacy controls could not be applied. Update Chrome or choose a current Brave/Chrome executable.',{cause:error});
        this.errors.set(targetInfo.targetId,failure);
        // Do not let a newly opened page proceed without its privacy controls.
        if(waitingForDebugger)await this.protocol.send('Target.closeTarget',{targetId:targetInfo.targetId}).catch(()=>{});
        throw failure;
      }
    })();
    this.sessions.set(sessionId,job);return job;
  }
  assert(){if(this.errors.size)throw this.errors.values().next().value;}
  close(){this.unsubscribe?.();this.unsubscribeDetached?.();this.sessions.clear();this.errors.clear();}
}
module.exports={BrowserPrivacy,TRACKER_HOSTS,BLOCKED_URLS};
