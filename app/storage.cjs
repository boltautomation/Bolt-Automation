const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class JsonStore {
  constructor(file, initial) { this.file=path.resolve(file);this.initial=initial;this.pending=Promise.resolve(); }
  async read() {
    try { return JSON.parse(await fs.readFile(this.file,'utf8')); }
    catch(error) { if(error.code==='ENOENT')return structuredClone(this.initial);throw new Error('The local saved data could not be read.'); }
  }
  update(change) {
    const job=this.pending.then(async()=>{
      const data=await this.read();const result=await change(data);
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const temp=path.join(path.dirname(this.file),`.save-${randomUUID()}.tmp`);
      try { await fs.writeFile(temp,JSON.stringify(data),{flag:'wx',mode:0o600});await fs.rename(temp,this.file); }
      finally { await fs.unlink(temp).catch(()=>{}); }
      return result;
    });
    this.pending=job.catch(()=>{});return job;
  }
}
module.exports={JsonStore};
