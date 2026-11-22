const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {download,publicUrl}=require('./sources.cjs');
async function recognizeImage(bytes,signal,{pdfPage=0}={}){
 signal.throwIfAborted();if(process.platform!=='win32')return '';
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bolt-source-ocr-')),file=path.join(directory,'source-image');
 try{
  await fs.writeFile(file,bytes,{mode:0o600});
  return await new Promise((resolve,reject)=>{
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'ocr-windows.ps1'),'-ImagePath',file,...(pdfPage?['-PdfPage',String(pdfPage)]:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']}),scope=AbortSignal.any([signal,AbortSignal.timeout(7000)]);let out='',error='';
   const abort=()=>child.kill();if(scope.aborted)abort();else scope.addEventListener('abort',abort,{once:true});
   child.stdout.on('data',chunk=>{if(out.length<120000)out+=chunk.toString('utf8');});child.stderr.on('data',chunk=>{if(error.length<1000)error+=chunk.toString('utf8');});
   child.on('error',()=>{scope.removeEventListener('abort',abort);reject(new Error('Local image reading is unavailable.'));});
   child.on('close',code=>{scope.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(code===0?out.trim():'');});
  });
 }finally{await fs.unlink(file).catch(()=>{});await fs.rmdir(directory).catch(()=>{});}
}
async function loadImageSources(page,question,signal,{downloader=(url,s)=>download(url,s,0,'image'),recognizer=recognizeImage,cache=new Map(),maxSources=3}={}){
 signal.throwIfAborted();const hint=(question.prompt||question.text||'').match(/\bpage\s*(\d+)\b/i),number=Number(hint?.[1]);
 const images=(page.media?.images||[]).filter(item=>!number||!item.page||Math.abs(item.page-number)<=1).map((item,index)=>({...item,index})).sort((a,b)=>(number&&b.page===number?10:0)-(number&&a.page===number?10:0)||a.index-b.index);
 const scope=AbortSignal.any([signal,AbortSignal.timeout(9000)]);
 const result=await Promise.all(images.slice(0,maxSources).map(async image=>{
  try{const url=publicUrl(new URL(image.url,page.url).href).href;let text=cache.get(url);if(!text){const file=await downloader(url,scope);text=await recognizer(file.content,scope);if(text){if(cache.size>=48)cache.delete(cache.keys().next().value);cache.set(url,text);}}return text?.length>30?{url,title:(image.title||page.title||'Source image')+(image.page?' · page '+image.page:'')+' · image text (OCR)',text,kind:'image-ocr'}:null;}catch{signal.throwIfAborted();return null;}
 }));
 signal.throwIfAborted();return result.filter(Boolean);
}
module.exports={recognizeImage,loadImageSources};
