const {download,publicUrl,pageText,normalize}=require('./sources.cjs');
const {jsonField}=require('./public-data.cjs');

function captionText(content){
  const input=String(content).replace(/^\uFEFF/,'');
  if(/^\s*\{/.test(input))try{const json=JSON.parse(input);return normalize((json.events||[]).flatMap(event=>(event.segs||[]).map(seg=>seg.utf8||'')).join(' '));}catch{}
  const xml=[...input.matchAll(/<(?:p|text)\b[^>]*>([\s\S]*?)<\/(?:p|text)>/gi)].map(m=>m[1]);
  const blocks=xml.length?xml:input.split(/\r?\n\s*\r?\n/).flatMap(block=>{
    const lines=block.split(/\r?\n/),time=lines.findIndex(line=>/\d{1,2}:\d{2}.*-->/.test(line));
    if(time<0||/^\s*(?:NOTE|STYLE|REGION)\b/.test(block))return[];
    return[lines.slice(time+1).join(' ')];
  });
  const cues=[];
  for(const block of blocks){const value=normalize(pageText(block.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'')).text);if(!value||value===cues.at(-1))continue;if(cues.at(-1)&&value.startsWith(cues.at(-1)+' '))cues[cues.length-1]=value;else cues.push(value);}
  return cues.join('\n');
}

function youtubeId(value){
  try{const url=publicUrl(value);if(/(^|\.)(?:youtube\.com|youtube-nocookie\.com)$/.test(url.hostname))return url.searchParams.get('v')?.match(/^[\w-]{11}$/)?.[0]||url.pathname.match(/\/(?:embed|shorts)\/+([\w-]{11})/)?.[1];if(url.hostname==='youtu.be')return url.pathname.match(/^\/([\w-]{11})/)?.[1];const nested=url.searchParams.get('url');return nested&&nested!==value?youtubeId(nested):null;}catch{return null;}
}
async function loadVideoSources(page,signal,{downloader=(url,s)=>download(url,s,0,'video'),cache=new Map(),maxSources=2,budgetMs=8000,question={}}={}){
  const scope=AbortSignal.any([signal,AbortSignal.timeout(budgetMs)]),sources=[],tracks=[];
  const add=(track,title)=>{
    if(!/^(?:captions|subtitles)$/i.test(track.kind||''))return;
    try{const url=publicUrl(new URL(track.file||track.src,page.url).href).href;tracks.push({url,title: title||page.title||'Video',label:track.label||track.srclang||'',default:!!track.default});}catch{}
  };
  for(const track of page.media?.tracks||[])add(track,track.title);
  for(const transcript of page.media?.transcripts||[])if(transcript.text?.length>30)sources.push({url:page.url,title:(page.title||'Video')+' · transcript',text:transcript.text,kind:'transcript'});
  if(sources.length)return sources.slice(0,maxSources);
  const ids=new Set();
  const terms=new Set(((question.prompt||question.text||'')+' '+(question.options||[]).map(o=>o.text).join(' ')).toLowerCase().match(/[a-z]{4,}/g)||[]),score=embed=>[...terms].filter(w=>(embed.title||'').toLowerCase().includes(w)).length;
  const embeds=[...(youtubeId(page.url)?[{url:page.url,title:page.title}]:[]),...(page.media?.embeds||[])].sort((a,b)=>score(b)-score(a));
  for(const embed of embeds.slice(0,4)){
    try{
      const url=publicUrl(new URL(embed.url||embed,page.url).href);
      const yt=youtubeId(url.href);
      if(yt){
        if(ids.has(yt))continue;ids.add(yt);
        if(tracks.length&&yt===youtubeId(page.url))continue;
        const watch='https://www.youtube.com/watch?v='+yt,cached=cache.get(watch);
        if(cached){sources.push(cached);if(sources.length>=maxSources)break;continue;}
        const response=await downloader(watch,scope),published=jsonField(response.content,'captionTracks')||[];
        for(const track of published)add({kind:'captions',src:track.baseUrl,label:track.name?.simpleText||track.languageCode,title:embed.title,videoUrl:watch},embed.title);
        continue;
      }
      if(!['cdn.jwplayer.com','content.jwplatform.com'].includes(url.hostname))continue;
      const id=url.pathname.match(/^\/(?:previews|players|v2\/media)\/([a-z0-9]{8})(?:[-/.]|$)/i)?.[1];
      if(!id||ids.has(id))continue;ids.add(id);
      const metadata=await downloader('https://cdn.jwplayer.com/v2/media/'+id,scope),json=JSON.parse(metadata.content);
      for(const video of (json.playlist||[]).slice(0,2))for(const track of video.tracks||[])add(track,video.title);
    }catch{signal.throwIfAborted();if(scope.aborted)break;}
  }
  tracks.sort((a,b)=>(/english|\ben\b/i.test(b.label)?3:b.default?1:0)-(/english|\ben\b/i.test(a.label)?3:a.default?1:0));
  const seen=new Set(),titles=new Set();
  for(const track of tracks){
    if(sources.length>=maxSources||scope.aborted)break;
    if(seen.has(track.url)||titles.has(track.title))continue;seen.add(track.url);
    try{
      const text=cache.get(track.url)||captionText((await downloader(track.url,scope)).content);
      if(text.length<30)continue;cache.set(track.url,text);titles.add(track.title);
      const source={url:/youtube\.com\/api\/timedtext/.test(track.url)?'https://www.youtube.com/watch?v='+new URL(track.url).searchParams.get('v'):track.url,title:track.title+' · '+(track.label||'video')+' captions',text,kind:'transcript',videoUrl:page.url};
      sources.push(source);if(youtubeId(source.url))cache.set(source.url,source);
    }catch{signal.throwIfAborted();}
  }
  signal.throwIfAborted();return sources;
}
module.exports={captionText,loadVideoSources,youtubeId};
