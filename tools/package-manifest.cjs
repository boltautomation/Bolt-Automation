const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function createPackageManifest(directory){
 const root=await fs.realpath(directory),files=[],inside=value=>{const relative=path.relative(root,value);return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 const digest=data=>createHash('sha256').update(data).digest('hex');
 async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name),name=path.relative(root,file).split(path.sep).join('/');
  if(entry.isSymbolicLink()){
   const target=await fs.readlink(file),resolved=await fs.realpath(file);
   if(path.isAbsolute(target)||!inside(resolved))throw Error('A package link points outside its portable bundle: '+name);
   const data=Buffer.from(target);files.push({path:name,kind:'symlink',target,bytes:data.length,sha256:digest(data)});
  }else if(entry.isDirectory())await walk(file);
  else if(entry.isFile()){const data=await fs.readFile(file);files.push({path:name,bytes:data.length,sha256:digest(data)});}
  else throw Error('Unsupported package file: '+name);
 }}
 await walk(root);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
module.exports={createPackageManifest};
