const path=require('node:path');
const {createHash}=require('node:crypto');
const {JsonStore}=require('./storage.cjs');
class ProgressStore {
  constructor({file=require('./runtime-path.cjs').dataFile('progress.json')}={}){this.store=new JsonStore(file,{version:1,accounts:{}});}
  key(email){return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');}
  account(data,email){return data.accounts[this.key(email)]||=( {items:{},selected:[],queue:[]} );}
  async get(email){return (await this.store.read()).accounts[this.key(email)]||{items:{},selected:[],queue:[]};}
  async sync(email,modules){return this.store.update(data=>{
    const account=this.account(data,email),now=new Date().toISOString();
    for(const module of modules){
      const old=account.items[module.id]||{};
      let status=module.completed?'completed':old.status||'pending';
      if(module.total&&module.answered<module.total&&status==='completed')status='pending';
      account.items[module.id]={...old,id:module.id,title:module.title,course:module.course||'',total:module.total||null,answered:module.answered??old.answered??0,score:module.completed&&old.score?.total===module.total?old.score:null,status,completedAt:status==='completed'?(old.completedAt||now):null,updatedAt:now};
    }
    return structuredClone(account);
  });}
  async update(email,id,patch){return this.store.update(data=>{const account=this.account(data,email);account.items[id]={...account.items[id],id,...patch,updatedAt:new Date().toISOString()};return structuredClone(account.items[id]);});}
  async selection(email,ids){return this.store.update(data=>{this.account(data,email).selected=[...new Set(ids)];});}
  async queue(email,queue){return this.store.update(data=>{this.account(data,email).queue=structuredClone(queue);});}
}
module.exports={ProgressStore};
