// Read published JSON fields from page scripts without evaluating JavaScript.
function jsonField(text,key){
  const marker=new RegExp('"'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"\\s*:\\s*','g');let match;
  while((match=marker.exec(text))){
    const start=marker.lastIndex,opening=text[start];if(!['[','{'].includes(opening))continue;
    let depth=0,quoted=false,escape=false;
    for(let i=start;i<Math.min(text.length,start+600000);i++){
      const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}if(c==='['||c==='{')depth++;else if(c===']'||c==='}')depth--;
      if(depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{break;}}
    }
  }
  return null;
}
module.exports={jsonField};
