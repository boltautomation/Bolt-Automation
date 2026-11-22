// Runs in a temporary research tab. Read article sections without reading form
// values or treating page content as instructions. Expansion is limited to local
// article disclosures. Relevant page links are planned here and clicked by the
// browser mouse separately, within a bounded same-site research visit.
function readResearchPage({prompt='',options=[],expand=false,plan=false}={}) {
  if(document.readyState==='loading'||[...document.querySelectorAll('input[type=password]')].some(field=>field.getClientRects().length&&getComputedStyle(field).visibility!=='hidden'))return null;
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  if(/(^|\.)(?:youtube\.com|youtube-nocookie\.com)$/.test(location.hostname)&&(/\/watch$/.test(location.pathname)||/^\/embed\//.test(location.pathname))){
    const tracks=[];
    for(const script of document.scripts){
      const value=script.textContent,match=/"captionTracks"\s*:\s*/.exec(value);if(!match)continue;const start=match.index+match[0].length;let depth=0,quoted=false,escape=false;
      for(let i=start;i<Math.min(value.length,start+600000);i++){const c=value[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='['||c==='{')depth++;else if(c===']'||c==='}')depth--;if(!depth){try{for(const t of JSON.parse(value.slice(start,i+1)))tracks.push({kind:'captions',src:t.baseUrl,label:t.name?.simpleText||t.languageCode,srclang:t.languageCode});}catch{}break;}}
      if(tracks.length)break;
    }
    const segments=[...document.querySelectorAll('ytd-transcript-segment-renderer .segment-text,transcript-segment-view-model')].map(el=>normalize(el.tagName==='TRANSCRIPT-SEGMENT-VIEW-MODEL'?(el.innerText||'').split('\n').filter(line=>!/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/.test(line)&&!/^\s*(?:\d+\s*(?:hours?|minutes?|seconds?)[,\s]*)+$/i.test(line)).join(' '):el.textContent)).filter(Boolean);
    const panel=document.querySelector('ytd-transcript-renderer'),transcript=segments.length?segments.join('\n'):panel?.getClientRects().length?panel.innerText.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/gm,'').trim():'';
    const controls=[];
    if(!transcript&&plan){
      const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
      const show=[...document.querySelectorAll('button,[role=button],tp-yt-paper-button')].find(el=>visible(el)&&/^show transcript$/i.test(normalize(el.innerText||el.getAttribute('aria-label'))));
      const expand=document.querySelector('ytd-watch-metadata #expand,#description-inline-expander #expand');
      if(show)controls.push(show);else if(expand&&visible(expand))controls.push(expand);
    }
    if(plan){globalThis.__boltResearchControls=controls;globalThis.__boltResearchLinks=[];}
    const description=normalize((document.querySelector('#description-inline-expander')||document.querySelector('ytd-watch-metadata #description'))?.innerText||'');
    return {url:location.href,title:document.title,text:description,navigation:[],sections:0,focused:[],media:{embeds:[],tracks,documents:[],transcripts:transcript?[{text:transcript}]:[]},mouseControls:controls.map((_,i)=>i)};
  }
  const candidates=[...document.querySelectorAll('main,[role=main],article')].filter(node=>node.getClientRects().length).map(node=>({node,length:normalize(node.innerText).length})).sort((a,b)=>b.length-a.length);
  const best=candidates[0],bodyLength=normalize(document.body.innerText).length;
  // Some sites use a tiny <main> inside a carousel while their actual article
  // and topic links are siblings. Do not let that hide the rest of the page.
  const substantial=best&&(best.node.matches('main,[role=main]')?(best.length>=bodyLength*.25||best.length>=1200):best.length>=bodyLength*.5);
  const root=best&&best.length>=80&&substantial?best.node:document.body;
  const text=(node,visibleOnly=false)=>{
    const copy=node.cloneNode(true),originals=[...node.querySelectorAll('*')],clones=[...copy.querySelectorAll('*')];
    for(let index=0;index<originals.length;index++){
      const original=originals[index],clone=clones[index];
      if(original.matches('script,style,noscript,template,svg,input,textarea,select,[contenteditable],nav,header,footer,[role=navigation]')){clone.remove();continue;}
      if(visibleOnly){const style=getComputedStyle(original);if(style.visibility==='hidden'||style.visibility==='collapse'||!original.getClientRects().length&&style.display!=='contents')clone.remove();}
    }
    // Inline links/buttons often have no whitespace between them in the DOM.
    // Preserve their boundaries without splitting numbers or formatted words.
    for(const el of copy.querySelectorAll('a,button,[role=button],[role=tab],li,div,section,article,p,h1,h2,h3,h4,br,dt,dd,td,th')){el.before(' ');el.after(' ');}
    return normalize(copy.textContent);
  };
  const words=value=>normalize(value).toLowerCase().replace(/[’']/g,'').match(/[a-z]{3,}/g)?.map(word=>word.replace(/s$/,''))||[];
  const query=new Set(words(prompt));const sections=[],seen=new Set(),mouseControls=[];let expanded=0;
  const expandControl=control=>{if(plan&&(!control.getClientRects().length||getComputedStyle(control).visibility==='hidden'))return;if(!mouseControls.includes(control)){mouseControls.push(control);if(!plan)control.click();expanded++;}};
  const add=(panel,title,control)=>{
    if(!panel||!root.contains(panel)||panel.matches('nav,header,footer,form')||panel.closest('nav,header,footer,[role=navigation]')||panel.querySelector('input[type=password]'))return;
    const label=normalize(title||panel.getAttribute('aria-label')||panel.querySelector('h1,h2,h3,h4,summary')?.textContent||'Article section');
    const terms=[...new Set(words(label))];const score=terms.length?terms.filter(word=>query.has(word)).length/terms.length:0;
    const shouldExpand=expand&&(expand!=='focused'||score>=.6),limit=expand==='focused'?3:12;
    if(shouldExpand&&control&&expanded<limit&&control.getAttribute('aria-expanded')!=='true'&&(control.getAttribute('aria-selected')!=='true'||control.getAttribute('role')!=='tab')){
      if(control.matches('button,[role=tab],summary,a[href^="#"]'))expandControl(control);
    }
    if(shouldExpand&&panel.matches('details')&&!panel.open){if(plan){const summary=panel.querySelector(':scope > summary');if(summary&&expanded<limit)expandControl(summary);}else panel.open=true;}
    const content=text(panel);if(content.length<20||seen.has(content))return;seen.add(content);
    sections.push({title:label,text:content,score:terms.length>=2?score:0});
  };
  for(const control of root.querySelectorAll('[aria-controls],[data-bs-target],[data-target],a[href^="#"]')){
    if(control.closest('nav,header,footer,[role=navigation],form')||control.matches('input,select,textarea'))continue;
    const target=control.getAttribute('aria-controls')||control.getAttribute('data-bs-target')||control.getAttribute('data-target')||control.getAttribute('href');
    if(!target||target==='#'||/[\s,]/.test(target))continue;
    const panel=document.getElementById(target.replace(/^#/,''));
    // Only known in-page disclosures/tabs can be expanded, never arbitrary CTA buttons.
    if(panel&&(panel.matches('.collapse,.accordion-content,.accordion-body,.tab-pane,[role=tabpanel],[hidden]')||control.matches('[role=tab],[aria-expanded]')))add(panel,control.textContent,control);
  }
  for(const panel of root.querySelectorAll('details,[role=tabpanel],.collapse,.accordion-content,.accordion-body,.tab-pane'))add(panel,'',null);
  sections.sort((a,b)=>b.score-a.score);
  const focused=sections.filter(section=>section.score>=.6);
  const visible=text(root,true);
  const blocks=[...focused.map(section=>`${section.title}: ${section.text}`),visible,...sections.filter(section=>!focused.includes(section)).map(section=>`${section.title}: ${section.text}`)];
  const stop=new Set('the and for that this with from what which have about more there their they your you can could would should does also how many true false research question click here'.split(' '));
  const terms=new Set(words(prompt+' '+options.map(o=>o.text||'').join(' ')).filter(word=>!stop.has(word)));
  const navigation=[],controls=[];
  for(const element of root.querySelectorAll('a[href],button[data-url],button[data-href],button[data-link],button[onclick],[role=link][data-url]')){
    const rect=element.getBoundingClientRect();
    if(element.closest('form,[contenteditable]')||element.matches(':disabled,[aria-disabled=true],[download]')||rect.width<=0||rect.height<=0||getComputedStyle(element).visibility==='hidden')continue;
    let concealed=false;
    for(let ancestor=element;ancestor&&ancestor!==root.parentElement;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor),r=ancestor.getBoundingClientRect();if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||/hidden|clip/.test(style.overflow+style.overflowX+style.overflowY)&&(!r.width||!r.height)){concealed=true;break;}}
    if(concealed)continue;
    const handler=element.getAttribute('onclick')||'';
    const literal=handler.match(/^\s*(?:window\.)?location(?:\.href)?\s*=\s*(['"])(.*?)\1\s*;?\s*(?:return false;?)?\s*$/)||handler.match(/^\s*(?:window\.)?location\.(?:assign|replace)\(\s*(['"])(.*?)\1\s*\)\s*;?\s*$/);
    const raw=element.getAttribute('href')||element.dataset.url||element.dataset.href||element.dataset.link||literal?.[2];
    if(!raw||/^\s*(?:#|javascript:|mailto:|tel:)/i.test(raw))continue;
    let url;try{url=new URL(raw,location.href);}catch{continue;}
    if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||url.username||url.password||/\.(?:pdf|zip|exe|msi|dmg|pkg|mp4|mp3)$/i.test(url.pathname)||/\/(?:logout|sign[_-]?out|delete|remove|unsubscribe|checkout|cart|login|sign[_-]?in|register|donate|submit|account)(?:[/?_-]|$)/i.test(url.pathname)||[...url.searchParams.keys()].some(key=>/^(?:action|delete|logout|token|password|email)$/i.test(key)))continue;
    url.hash='';const current=new URL(location.href);current.hash='';if(url.href===current.href)continue;
    const label=normalize(element.getAttribute('aria-label')||element.innerText||element.title||'');
    if(/\b(?:log out|sign out|delete|remove|unsubscribe|buy|purchase|donate|apply now|submit|send|cancel|save|confirm|accept|start (?:screening|quiz|assessment))\b/i.test(label))continue;
    const heading=normalize(element.closest('article,li,.card')?.querySelector('h2,h3,h4')?.textContent||'');
    const hits=[...new Set(words(label+' '+heading))].filter(word=>terms.has(word)).length;
    const score=hits+.5*[...new Set(words(url.pathname))].filter(word=>terms.has(word)).length;
    if(score<1||navigation.some(link=>link.url===url.href))continue;
    const index=controls.length;controls.push({element,url:url.href});navigation.push({index,url:url.href,label,score});
  }
  navigation.sort((a,b)=>b.score-a.score);
  if(plan){globalThis.__boltResearchControls=mouseControls;globalThis.__boltResearchLinks=controls;}
  const media={embeds:[...root.querySelectorAll('iframe[src]')].map(el=>({url:el.src,title:el.title})).slice(0,8),tracks:[...root.querySelectorAll('video track[src]')].map(el=>({src:el.src,kind:el.kind,label:el.label,srclang:el.srclang,default:el.default}))};
  media.documents=[...root.querySelectorAll('a[href],iframe[src],embed[src],object[data]')].map(el=>({url:el.href||el.src||el.data,title:normalize(el.innerText||el.title||''),type:el.type||''})).filter(item=>{try{return /\.pdf$/i.test(new URL(item.url,location.href).pathname)||item.type==='application/pdf';}catch{return false;}}).slice(0,12);
  if(location.hostname==='docs.google.com'&&/^\/viewer(?:ng)?\//.test(location.pathname)){const url=new URL(location.href).searchParams.get('url');if(url)media.documents.unshift({url,title:document.title,type:'application/pdf'});}
  media.images=[...root.querySelectorAll('img[src]')].filter(el=>el.naturalWidth>=350&&el.naturalHeight>=200).map((el,index)=>({url:el.currentSrc||el.src,title:el.alt||normalize(el.closest('figure,section')?.querySelector('figcaption,h2,h3')?.textContent||''),...(/(^|\.)visme\.co$/.test(location.hostname)?{page:index+1}:{}),width:el.naturalWidth,height:el.naturalHeight})).slice(0,24);
  return {url:location.href,title:document.title,text:[...new Set(blocks.filter(Boolean))].join('\n\n'),sections:sections.length,focused:focused.map(section=>section.title),expanded,navigation:navigation.slice(0,8),media,...(plan?{mouseControls:mouseControls.map((_,i)=>i)}:{})};
}
module.exports={readResearchPage};
