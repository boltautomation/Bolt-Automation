// Runs in a temporary research tab. Read article sections without reading form
// values or treating page content as instructions. Expansion is limited to local
// article disclosure/tab controls; links to other pages are never clicked.
function readResearchPage({prompt='',expand=false,plan=false}={}) {
  if(document.readyState==='loading'||document.querySelector('input[type=password]'))return null;
  const root=document.querySelector('main')||document.querySelector('article')||document.body;
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  const text=node=>{const copy=node.cloneNode(true);for(const el of copy.querySelectorAll('script,style,noscript,template,svg,input,textarea,select,nav,header,footer,[contenteditable]'))el.remove();return normalize(copy.textContent);};
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
  const visible=normalize(root.innerText);
  const blocks=[...focused.map(section=>`${section.title}: ${section.text}`),visible,...sections.filter(section=>!focused.includes(section)).map(section=>`${section.title}: ${section.text}`)];
  if(plan)globalThis.__boltResearchControls=mouseControls;
  return {url:location.href,title:document.title,text:[...new Set(blocks.filter(Boolean))].join('\n\n'),sections:sections.length,focused:focused.map(section=>section.title),expanded,...(plan?{mouseControls:mouseControls.map((_,i)=>i)}:{})};
}
module.exports={readResearchPage};
