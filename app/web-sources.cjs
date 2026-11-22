const {download,publicUrl,pageText,excerpts,normalize,sourceIssue}=require('./sources.cjs');
const stop=new Set('the and for that this with from what which have about more there their they your you can could would should does also how many true false research question click here hint use button answer options above below once case into where when who why lets let only been then some are was were made being these those than most get has will would'.split(' '));
const terms=value=>[...new Set((normalize(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!stop.has(w)))];
function questionTask(question){return normalize(question.prompt||question.text).replace(/\(?\s*\b(?:hint|tip)\s*:[\s\S]*$/i,'').replace(/[\s\S]*[.!?]\s+(?=(?:which|what|when|where|how|why|who|true or false)\b)/i,'').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi,' ').trim();}
function searchQuery(question){
  const clean=normalize(question.prompt||question.text).replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi,' ').replace(/\b(?:hint|tip)\s*:[\s\S]*$/i,'').replace(/^Question\s*\d+\s*[:.-]?\s*/i,'');
  const task=questionTask(question).slice(-250),context=question.researchContext||{};
  const sourceTitle=sourceIssue({title:context.sourceTitle,text:''})?'':context.sourceTitle;
  const subject=normalize([context.course,context.activity,sourceTitle].filter(Boolean).join(' ')).replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi,'').slice(0,100);
  const background=!subject&&clean.length>250?terms(clean.slice(0,-250)).slice(0,8).join(' '):subject;
  return normalize(task+' '+background).slice(0,400);
}
function searchResults(html){
  const results=[],seen=new Set();
  for(const item of html.matchAll(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)){
    const heading=item[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||'',href=heading.match(/\bhref=["']([^"']+)["']/i)?.[1];if(!href)continue;
    try{
      let url=publicUrl(pageText(href).text);
      if(/(^|\.)bing\.com$/i.test(url.hostname)){
        const encoded=url.searchParams.get('u');if(!encoded?.startsWith('a1')||encoded.length>6000)continue;
        url=publicUrl(Buffer.from(encoded.slice(2),'base64url').toString('utf8'));
      }
      if(/(^|\.)(?:bing\.com|microsoft\.com|chatterhigh\.com)$/i.test(url.hostname)||/\/(?:login|sign[_-]?in|logout|checkout)(?:\/|$)/i.test(url.pathname))continue;
      url.hash='';if(seen.has(url.href))continue;seen.add(url.href);
      results.push({url:url.href,title:pageText(heading).text,summary:pageText(item[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'').text});
    }catch{}
  }
  return results;
}
async function quickWebSources(question,signal,{downloader=download,budgetMs=6500,maxSources=2}={}){
  signal.throwIfAborted();const query=searchQuery(question);if(query.length<12)return [];
  const scope=AbortSignal.any([signal,AbortSignal.timeout(budgetMs)]),words=terms(query),taskWords=terms(questionTask(question)),overlap=text=>words.filter(w=>text.toLowerCase().includes(w)).length,taskOverlap=text=>taskWords.filter(w=>text.toLowerCase().includes(w)).length;
  try{
    const [web,encyclopedia,alternatives]=await Promise.all([
      (async()=>{try{const response=await downloader('https://www.bing.com/search?q='+encodeURIComponent(query),AbortSignal.any([scope,AbortSignal.timeout(3000)]));return /captcha-form|verify you are human|unusual traffic/i.test(response.content)?[]:searchResults(response.content);}catch{return [];}})(),
      (async()=>{try{const url='https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&srsearch='+encodeURIComponent(words.slice(0,24).join(' ')),response=await downloader(url,AbortSignal.any([scope,AbortSignal.timeout(3000)]),0,true),json=JSON.parse(response.content);return (json.query?.search||[]).map(item=>({url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(item.title.replace(/ /g,'_')),title:item.title,summary:pageText(item.snippet||'').text,reference:true}));}catch{return [];}})(),
      require('./source-alternatives.cjs').loadSourceAlternatives(question,scope,{downloader})
    ]);
    signal.throwIfAborted();
    const confirmed=alternatives.filter(source=>taskOverlap(source.text)>=Math.min(2,taskWords.length));
    if(confirmed.length)return confirmed.slice(0,maxSources);
    const ranked=[...web,...encyclopedia].map((item,index)=>({...item,index,relevance:overlap(item.title+' '+item.summary+' '+item.url)+2*taskOverlap(item.title+' '+item.summary)})).filter(item=>taskOverlap(item.title+' '+item.summary+' '+item.url)>=Math.min(2,taskWords.length)&&!/\/(?:collections|shop|products?|cart)(?:\/|$)/i.test(new URL(item.url).pathname));
    const priority=item=>item.relevance+(item.reference||/\.(?:edu|gov)(?:\.[a-z]{2})?$|\.ac\.[a-z]{2}$/i.test(new URL(item.url).hostname)?2:0);
    ranked.sort((a,b)=>priority(b)-priority(a)||a.index-b.index);
    const results=await Promise.all(ranked.slice(0,Math.min(2,maxSources)).map(async item=>{
      try{
        const readSignal=AbortSignal.any([scope,AbortSignal.timeout(3500)]);
        if(/\.pdf$/i.test(new URL(item.url).pathname)){
          const documents=await require('./document-sources.cjs').loadDocumentSources({url:item.url,title:item.title},question,readSignal,{downloader:(url,s)=>downloader(url,s,0,'pdf')});
          return documents[0]?{...documents[0],external:true}:null;
        }
        const page=await downloader(item.url,readSignal),parsed=pageText(page.content);
        if(parsed.text.length<120||taskOverlap(parsed.text)<Math.min(2,taskWords.length)||sourceIssue(parsed)||/verify you are human|unusual traffic|captcha-form/i.test(parsed.text))return null;
        return {url:publicUrl(page.url||item.url).href,title:parsed.title||item.title,text:excerpts(parsed.text,question,9000),kind:'web-page',external:true};
      }catch{signal.throwIfAborted();return null;}
    }));
    signal.throwIfAborted();return results.filter(Boolean);
  }catch{signal.throwIfAborted();return [];}
}
module.exports={searchQuery,searchResults,quickWebSources,questionTask};
