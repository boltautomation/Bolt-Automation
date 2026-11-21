const {normalize}=require('./sources.cjs');

// Label every passage, rather than limiting citations to a few keyword matches.
// Preserve source wording; whitespace follows the solver's quote normalization.
function sourcePassages(sources,limit=700){
  const passages=[];
  for(const source of sources){
    let index=0;
    // Excerpt gaps are not contiguous evidence and must never form one quote.
    for(const text of normalize(source.text).split(/\s*\[…\]\s*/u)){
      let offset=0;
      while(offset<text.length){
        let end=Math.min(text.length,offset+limit);
        if(end<text.length){
          const window=text.slice(offset,end),sentence=[...window.matchAll(/[.!?]\s+/g)].at(-1);
          const boundary=sentence&&sentence.index>=limit/2?offset+sentence.index+1:text.lastIndexOf(' ',end);
          if(boundary>offset)end=boundary;
        }
        if(text.length-end<12)end=text.length;
        const value=text.slice(offset,end).trim();
        if(value)passages.push({id:`${source.id}:p${index++}`,sourceId:source.id,text:value});
        offset=end;
        while(text[offset]===' ')offset++;
      }
    }
  }
  return passages;
}

function resolveReferences(decision,passages){
  // Legacy responses may still supply a verbatim quote directly. It is checked
  // by the solver as before; never substitute a merely similar passage for it.
  if(!decision||!Object.hasOwn(decision,'evidenceRefs'))return decision;
  const refs=decision.evidenceRefs;
  if(!Array.isArray(refs)||refs.length>6)throw new Error('The local model returned invalid source passage references. Review this question.');
  if(!refs.length)return {...decision,sourceIds:[],evidenceQuote:'',evidenceQuotes:[]};
  const selected=[...new Set(refs)].map(id=>passages.find(passage=>passage.id===id));
  if(selected.some(passage=>!passage))throw new Error('The local model cited an unknown source passage. Review this question.');
  return {...decision,sourceIds:[...new Set(selected.map(passage=>passage.sourceId))],evidenceQuote:selected[0].text,
    evidenceQuotes:selected.map(({id,sourceId,text})=>({id,sourceId,text}))};
}

module.exports={sourcePassages,resolveReferences};
