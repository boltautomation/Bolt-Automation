class RunMetrics {
  constructor({now=()=>performance.now(),wallNow=()=>Date.now()}={}){Object.assign(this,{now,wallNow});this.reset();}
  reset(){this.startedAt=null;this.elapsedMs=0;this.activeSince=null;this.questions=0;this.submissions=new Set();}
  start({resume=false}={}){
    if(this.activeSince!==null)return;
    if(!resume||this.startedAt===null)this.reset();
    if(this.startedAt===null)this.startedAt=this.wallNow();
    this.activeSince=this.now();
  }
  pause(){if(this.activeSince!==null){this.elapsedMs+=Math.max(0,this.now()-this.activeSince);this.activeSince=null;}}
  submitted(count,key){
    if(this.activeSince===null||!Number.isInteger(count)||count<=0||key&&this.submissions.has(key))return;
    if(key)this.submissions.add(key);
    this.questions+=count;
  }
  snapshot(){
    const running=this.activeSince!==null,elapsedMs=Math.max(0,this.elapsedMs+(running?Math.max(0,this.now()-this.activeSince):0));
    return {startedAt:this.startedAt,running,elapsedMs:Math.floor(elapsedMs),questions:this.questions,questionsPerMinute:this.questions>0&&elapsedMs>=15000?this.questions*60000/elapsedMs:null};
  }
}
module.exports={RunMetrics};
