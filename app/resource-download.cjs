const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {setTimeout:wait}=require('node:timers/promises');
const {publicUrl}=require('./sources.cjs');
function pdfDownloadControl(){
  const button=[...document.querySelectorAll('button[type=submit]')].find(button=>{
    if(!/^download\s+pdf$/i.test((button.innerText||'').trim())||!button.form||!button.getClientRects().length)return false;
    const form=button.form;if(new URL(form.action,location.href).origin!==location.origin)return false;
    return !form.querySelector('input:not([type=hidden]):not([type=submit]),textarea,select');
  });
  return button||[...document.querySelectorAll('a[href]')].find(link=>/^(?:continue to publication|continuer vers la publication)\s*[→›»]?$/i.test((link.textContent||'').replace(/\s+/g,' ').trim())&&new URL(link.href).origin===location.origin&&/\.pdf$/i.test(new URL(link.href).pathname)&&link.getClientRects().length)||null;
}
async function browserPdfBytes(page,url,signal){
  publicUrl(url);const frame=(await page.command('Page.getFrameTree')).frameTree.frame;
  if(new URL(url).origin!==new URL(frame.url).origin)throw Error('The document is outside its source origin.');
  const {resource}=await page.command('Network.loadNetworkResource',{url,frameId:frame.id,options:{disableCache:false,includeCredentials:true}});
  if(!resource.success||!resource.stream)throw Error('The browser could not read this document.');
  const parts=[];let size=0;
  try{for(;;){signal.throwIfAborted();const part=await page.protocol.send('IO.read',{handle:resource.stream,size:1024*1024}),bytes=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');size+=bytes.length;if(size>32*1024*1024)throw Error('Research PDF is too large.');parts.push(bytes);if(part.eof)break;}}
  finally{await page.protocol.send('IO.close',{handle:resource.stream}).catch(()=>{});}
  return {url,content:Buffer.concat(parts)};
}
async function readDownloadedPdf(page,question,signal,{validateUrl=publicUrl,documentLoader=require('./document-sources.cjs').loadDocumentSources}={}){
  if(!await page.evaluate(pdfDownloadControl,null,{requireSite:false}))return [];
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bolt-research-pdf-')),downloads=new Map(),owned=new Set(),originalFrame=(await page.command('Page.getFrameTree')).frameTree.frame;
  const start=page.protocol.on('Browser.downloadWillBegin',data=>{try{validateUrl(data.url);if(data.frameId!==originalFrame.id||!/^[a-z\d-]{16,}$/i.test(data.guid))return;downloads.set(data.guid,{...data,state:'inProgress'});owned.add(data.guid);}catch{}});
  const progress=page.protocol.on('Browser.downloadProgress',data=>{if(downloads.has(data.guid))downloads.set(data.guid,{...downloads.get(data.guid),...data});});
  try{
    await page.protocol.send('Browser.setDownloadBehavior',{behavior:'allowAndName',browserContextId:page.contextId,downloadPath:directory,eventsEnabled:true});
    await page.command('Page.bringToFront');await page.clickElement(pdfDownloadControl,null,{signal,requireSite:false});
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){
      signal.throwIfAborted();
      const frame=(await page.command('Page.getFrameTree')).frameTree.frame;
      if(frame.mimeType==='application/pdf'){
        publicUrl(frame.url);
        const {resource}=await page.command('Network.loadNetworkResource',{url:frame.url,frameId:frame.id,options:{disableCache:false,includeCredentials:true}});
        if(resource.success&&resource.stream){
          const parts=[];let size=0;
          try{for(;;){signal.throwIfAborted();const part=await page.protocol.send('IO.read',{handle:resource.stream,size:1024*1024}),bytes=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');size+=bytes.length;if(size>32*1024*1024)throw Error('Research PDF is too large.');parts.push(bytes);if(part.eof)break;}}
          finally{await page.protocol.send('IO.close',{handle:resource.stream}).catch(()=>{});}
          return documentLoader({url:frame.url,document:true,title:'Publication PDF'},question,signal,{downloader:async()=>({url:frame.url,content:Buffer.concat(parts)})});
        }
      }
      for(const [guid,item]of downloads){
        if(item.receivedBytes>32*1024*1024||item.totalBytes>32*1024*1024){await page.protocol.send('Browser.cancelDownload',{guid,browserContextId:page.contextId}).catch(()=>{});return [];}
        if(item.state==='completed'){
          const bytes=await fs.readFile(path.join(directory,guid));
          return documentLoader({url:item.url,document:true,title:'Downloaded PDF'},question,signal,{downloader:async()=>({url:item.url,content:bytes})});
        }
        if(item.state==='canceled')return [];
      }
      await wait(100,undefined,{signal});
    }
    return [];
  }finally{
    start();progress();for(const guid of owned)await page.protocol.send('Browser.cancelDownload',{guid,browserContextId:page.contextId}).catch(()=>{});
    await page.protocol.send('Browser.setDownloadBehavior',{behavior:'default',browserContextId:page.contextId}).catch(()=>{});
    for(const guid of owned)for(const name of [guid,guid+'.crdownload']){const file=path.join(directory,name);if(path.dirname(file)===directory)await fs.unlink(file).catch(()=>{});}
    await fs.rmdir(directory).catch(()=>{});
  }
}
module.exports={pdfDownloadControl,readDownloadedPdf,browserPdfBytes};
