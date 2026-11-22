const {download,publicUrl,excerpts}=require('./sources.cjs');

async function loadDocumentSources(page,question,signal,{downloader=(url,s)=>download(url,s,0,'research-pdf'),extractor=(bytes,options)=>require('./study.cjs').extractPdf(bytes,{...options,maxBytes:32*1024*1024}),cache=new Map(),maxSources=1,budgetMs=18000,onError=()=>{}}={}){
  signal.throwIfAborted();
  const scope=AbortSignal.any([signal,AbortSignal.timeout(budgetMs)]),sources=[],seen=new Set();
  let location;try{location=new URL(page.url);}catch{return [];}
  const wrapped=/^(?:docs\.google\.com|drive\.google\.com)$/.test(location.hostname)&&/^\/viewer(?:ng)?\//.test(location.pathname)?location.searchParams.get('url'):null;
  const candidates=[...(/\.pdf$/i.test(location.pathname)||page.document?[{url:page.url,title:page.title}]:[]),...(wrapped?[{url:wrapped,title:page.title}]:[]),...(page.media?.documents||[])];
  const prompt=question.prompt||question.text||'',hint=prompt.match(/\b(?:slide|page)\s*#?\s*(\d+)\b/i),number=Number(hint?.[1]);
  const words=new Set((prompt+' '+(question.options||[]).map(o=>o.text).join(' ')).toLowerCase().match(/[a-z]{4,}/g)||[]);
  const score=item=>[...new Set((String(item.title||'')+' '+item.url).toLowerCase().match(/[a-z]{4,}/g)||[])].filter(w=>words.has(w)).length;
  candidates.sort((a,b)=>score(b)-score(a));
  for(const item of candidates.slice(0,3)){
    if(scope.aborted||sources.length>=maxSources)break;
    try{
      const url=publicUrl(new URL(item.url,page.url).href);url.hash='';if(seen.has(url.href))continue;seen.add(url.href);
      const ocrKey=url.href+'#ocr-page='+(number||1);
      let document=cache.get(url.href)||cache.get(ocrKey);
      if(!document){
        const file=await downloader(url.href,scope);let pages,ocr=false;
        try{pages=await extractor(file.content,{signal:scope});}
        catch(error){scope.throwIfAborted();if(!/No readable text|Scanned\/image-only/.test(error.message))throw error;const text=await require('./image-sources.cjs').recognizeImage(file.content,scope,{pdfPage:number||1});if(text.length<30)throw error;pages=[{number:number||1,text}];ocr=true;}
        document={url:file.url||url.href,pages,ocr};if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(ocr?ocrKey:url.href,document);
      }
      const hinted=number?document.pages.filter(p=>Math.abs(p.number-number)<=1):[];
      const pages=hinted.length?hinted:document.pages;
      const text=excerpts(pages.map(p=>`[PDF page ${p.number}]\n${p.text}`).join('\n\n'),question,12000);
      if(text.length<40)continue;
      sources.push({url:document.url+(hinted.length?'#page='+number:''),title:(item.title||decodeURIComponent(url.pathname.split('/').at(-1)))+(hinted.length?' · PDF page '+number:' · PDF')+(document.ocr?' · OCR':''),text,kind:document.ocr?'pdf-ocr':'pdf'});
    }catch(error){signal.throwIfAborted();onError({url:item.url,message:error.message});}
  }
  signal.throwIfAborted();return sources;
}
module.exports={loadDocumentSources};
