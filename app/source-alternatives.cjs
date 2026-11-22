const {download,publicUrl,pageText,excerpts,sourceIssue}=require('./sources.cjs');

// Confirmed public references to publications whose original delivery is broken.
// These are source URLs, never saved quiz answers or confidence overrides.
const alternatives=[{
 originals:['https://publications.gc.ca/collections/collection_2019/sc-hc/H14-298-2018-eng.pdf','https://www.canada.ca/en/health-canada/services/publications/healthy-living/canada-opioid-crisis-fact-sheet.html'],
 url:'https://actfoundation.ca/for-teachers/opioid-overdose-response-training/',
 references:'https://www.canada.ca/en/health-canada/services/publications/healthy-living/canada-opioid-crisis-fact-sheet.html'
}];
function sourceIdentity(value){
 try{let url=publicUrl(value);for(let depth=0;depth<2;depth++){if(!/archive|viewer/i.test(url.pathname))break;const nested=url.searchParams.get('url');if(!nested)break;url=publicUrl(nested);}url.hash='';url.search='';return url.href;}catch{return null;}
}
async function loadSourceAlternatives(question,signal,{rules=alternatives,downloader=download}={}){
 signal.throwIfAborted();const original=sourceIdentity(question.researchContext?.sourceUrl);if(!original)return [];
 const matches=rules.filter(rule=>rule.originals.some(url=>sourceIdentity(url)===original)).slice(0,2),scope=AbortSignal.any([signal,AbortSignal.timeout(2500)]);
 const sources=await Promise.all(matches.map(async rule=>{try{
  const page=await downloader(publicUrl(rule.url).href,scope);if(rule.references&&!page.content.includes(rule.references))return null;
  const parsed=pageText(page.content);if(parsed.text.length<120||sourceIssue(parsed))return null;
  return{url:publicUrl(page.url||rule.url).href,title:parsed.title||new URL(rule.url).hostname,text:excerpts(parsed.text,question,9000),kind:'publication-alternative',external:true};
 }catch{signal.throwIfAborted();return null;}}));return sources.filter(Boolean);
}
module.exports={loadSourceAlternatives,sourceIdentity};
