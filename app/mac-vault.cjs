const {spawn}=require('node:child_process');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const PREFIX='mac-keychain-v1:';
const AAD=Buffer.from('Bolt.Accounts.macOS.v1');
const failure=()=>new Error('Saved login is unavailable. Unlock your macOS login Keychain and allow Bolt access, or re-add the account.');
function security(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/security',args,{stdio:['pipe','pipe','pipe']});
    let output='',settled=false;
    const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(failure()):resolve({code,stdout:output.trim()});};
    const timer=setTimeout(()=>{child.kill();finish(true);},60000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8192){child.kill();finish(true);}});
    child.stderr.resume();child.on('error',()=>finish(true));child.stdin.on('error',()=>finish(true));
    child.on('close',code=>finish(false,code));child.stdin.end(input,'utf8');
  });
}
function createMacVault({run=security,service='com.boltautomation.Bolt.local-key.v1'}={}) {
  if(!/^[a-zA-Z0-9.-]+$/.test(service))throw new Error('Invalid Keychain service.');
  const account='local-encryption-key';
  let keyPromise;
  async function key(create) {
    if(!keyPromise)keyPromise=(async()=>{
      let result=await run(['find-generic-password','-a',account,'-s',service,'-w']);
      if(result.code===44&&create){
        // Interactive mode accepts the key over stdin, never process arguments.
        // Do not update existing keys: another launch may have created one.
        await run(['-i'],`add-generic-password -a ${account} -s ${service} -w ${randomBytes(32).toString('hex')}\n`);
        result=await run(['find-generic-password','-a',account,'-s',service,'-w']);
      }
      if(result.code!==0||!/^[0-9a-f]{64}$/.test(result.stdout))throw failure();
      return Buffer.from(result.stdout,'hex');
    })().catch(error=>{keyPromise=null;throw error;});
    return keyPromise;
  }
  return {
    async protect(value){
      const secret=await key(true),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
      cipher.setAAD(AAD);
      const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
      return PREFIX+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
    },
    async unprotect(value){
      try{
        if(typeof value!=='string'||!value.startsWith(PREFIX))throw failure();
        const bytes=Buffer.from(value.slice(PREFIX.length),'base64');
        if(bytes.length<29)throw failure();
        const decipher=createDecipheriv('aes-256-gcm',await key(false),bytes.subarray(0,12));
        decipher.setAAD(AAD);decipher.setAuthTag(bytes.subarray(12,28));
        return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
      }catch{throw failure();}
    }
  };
}
module.exports={createMacVault};
