const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {JsonStore}=require('./storage.cjs');
const macVault=require('./mac-vault.cjs').createMacVault();
function crypt(operation,value) {
  if(process.platform==='darwin')return macVault[operation](value);
  if(process.platform!=='win32')return Promise.reject(new Error('Saved logins require Windows data protection.'));
  return new Promise((resolve,reject)=>{
    const executable=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=spawn(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'vault.ps1'),operation],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let result='',settled=false;
    const fail=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('Saved login is unavailable for this Windows user. Re-add the account to update it.'));}};
    const timer=setTimeout(()=>{child.kill();fail();},10000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{result+=chunk;if(result.length>2000000){child.kill();fail();}});
    child.stderr.resume();child.on('error',fail);child.stdin.on('error',fail);
    child.on('close',code=>{if(settled)return;if(code!==0)return fail();settled=true;clearTimeout(timer);resolve(result.trim());});
    child.stdin.end(value,'utf8');
  });
}
class AccountStore {
  constructor({file=require('./runtime-path.cjs').dataFile('accounts.json'),protect=value=>crypt('protect',value),unprotect=value=>crypt('unprotect',value)}={}) {
    this.store=new JsonStore(file,{version:1,accounts:[]});Object.assign(this,{protect,unprotect});
  }
  public(record){return {id:record.id,email:record.email,label:record.label,hasPassword:record.hasPassword,hasSession:record.hasSession};}
  async list(){return (await this.store.read()).accounts.map(record=>this.public(record));}
  async get(id){const record=(await this.store.read()).accounts.find(record=>record.id===id);if(!record)throw new Error('Saved account not found. Add it again.');return {...this.public(record),secret:JSON.parse(await this.unprotect(record.encrypted))};}
  async save({id,email,label,secret={}}) {
    email=String(email||'').trim();if(!email.includes('@')||email.length>320)throw new Error('Enter a valid account email.');
    return this.store.update(async data=>{
      let record=data.accounts.find(record=>record.id===id||record.email.toLowerCase()===email.toLowerCase());
      let previous={};
      if(record){try{previous=JSON.parse(await this.unprotect(record.encrypted));}catch(error){if(!secret.password)throw error;}}
      const merged={...previous,...Object.fromEntries(Object.entries(secret).filter(([,value])=>value!==undefined&&value!==''))};
      if(!merged.password&&!merged.session?.cookies?.length)throw new Error('Enter a password or sign in before saving this account.');
      const encrypted=await this.protect(JSON.stringify(merged));
      const next={id:record?.id||randomUUID(),email,label:String(label||record?.label||email).slice(0,100),encrypted,hasPassword:Boolean(merged.password),hasSession:Boolean(merged.session?.cookies?.length),updatedAt:new Date().toISOString()};
      if(record)data.accounts[data.accounts.indexOf(record)]=next;else data.accounts.push(next);
      return this.public(next);
    });
  }
  async remove(id){return this.store.update(data=>{data.accounts=data.accounts.filter(record=>record.id!==id);});}
}
module.exports={AccountStore,crypt};
