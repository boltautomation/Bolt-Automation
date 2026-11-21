const {randomUUID}=require('node:crypto');
class MemoryAccounts {
  constructor(){this.accounts=[];}
  async list(){return this.accounts.map(({secret,...record})=>structuredClone(record));}
  async get(id){const record=this.accounts.find(record=>record.id===id);if(!record)throw new Error('Saved account not found.');return structuredClone(record);}
  async save({id,email,label,secret={}}){let record=this.accounts.find(record=>record.id===id||record.email===email);if(!record){record={id:randomUUID(),email,label:label||email,secret:{}};this.accounts.push(record);}record.secret={...record.secret,...secret};record.hasPassword=Boolean(record.secret.password);record.hasSession=Boolean(record.secret.session?.cookies?.length);const {secret:ignored,...publicRecord}=record;return structuredClone(publicRecord);}
  async remove(id){this.accounts=this.accounts.filter(record=>record.id!==id);}
}
class MemoryProgress {
  constructor(){this.accounts=new Map();}
  account(email){email=email.toLowerCase();if(!this.accounts.has(email))this.accounts.set(email,{items:{},selected:[],queue:[]});return this.accounts.get(email);}
  async get(email){return structuredClone(this.account(email));}
  async sync(email,modules){const account=this.account(email);for(const module of modules)account.items[module.id]={...account.items[module.id],...module,status:module.completed?'completed':account.items[module.id]?.status||'pending'};return structuredClone(account);}
  async update(email,id,patch){const account=this.account(email);account.items[id]={...account.items[id],id,...patch,updatedAt:new Date().toISOString()};return structuredClone(account.items[id]);}
  async selection(email,ids){this.account(email).selected=[...ids];}
  async queue(email,queue){this.account(email).queue=structuredClone(queue);}
}
module.exports={MemoryAccounts,MemoryProgress};
