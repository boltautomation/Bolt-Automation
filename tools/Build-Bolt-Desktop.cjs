const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {packager}=require('@electron/packager');
async function icons(source,directory){
 const {createCanvas,loadImage}=require('@napi-rs/canvas'),image=await loadImage(source),pngs=new Map();
 for(const size of [16,32,64,128,256,512,1024]){const canvas=createCanvas(size,size),context=canvas.getContext('2d'),scale=size/Math.max(image.width,image.height);context.drawImage(image,(size-image.width*scale)/2,(size-image.height*scale)/2,image.width*scale,image.height*scale);pngs.set(size,canvas.toBuffer('image/png'));}
 const png=pngs.get(256),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await fs.writeFile(path.join(directory,'bolt.ico'),Buffer.concat([header,png]));
 const types=['icp4','icp5','icp6','ic07','ic08','ic09','ic10'],chunks=[...pngs].map(([size,data],i)=>{const h=Buffer.alloc(8);h.write(types[i]);h.writeUInt32BE(data.length+8,4);return Buffer.concat([h,data]);}),head=Buffer.alloc(8);head.write('icns');head.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);await fs.writeFile(path.join(directory,'bolt.icns'),Buffer.concat([head,...chunks]));
}
async function buildDesktop({source=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../releases/desktop'),platform=process.platform,arch=process.arch}={}){
 const project=path.resolve(__dirname,'..'),release=require('../package.json'),safeOutput=path.join(project,'releases')+path.sep;
 source=path.resolve(source);output=path.resolve(output);if(!output.startsWith(safeOutput))throw Error('Desktop build output must stay inside this project’s releases directory.');
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'bolt-desktop-stage-')),application=path.join(stage,'application');await fs.mkdir(application);
 try{
  await fs.mkdir(path.join(application,'app'),{recursive:true});
  for(const name of await fs.readdir(path.join(source,'app'))){if(name.endsWith('.cjs')&&!name.startsWith('upgrade-')||['vault.ps1','ocr-windows.ps1'].includes(name))await fs.copyFile(path.join(source,'app',name),path.join(application,'app',name));}
  await fs.cp(path.join(source,'app/public'),path.join(application,'app/public'),{recursive:true});await fs.mkdir(path.join(application,'extension'));
  for(const name of ['core.js','runner.js','content.js'])await fs.copyFile(path.join(source,'extension',name),path.join(application,'extension',name));
  await fs.mkdir(path.join(application,'node_modules'));
  for(const name of ['pdfjs-dist','@napi-rs']){const dependency=path.join(source,'node_modules',name);try{await fs.cp(dependency,path.join(application,'node_modules',name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
  await fs.writeFile(path.join(application,'package.json'),JSON.stringify({name:'bolt',productName:'Bolt',version:release.version,versionName:release.versionName,main:'app/desktop-main.cjs',private:true,dependencies:release.dependencies}));
  await icons(path.join(application,'app/public/assets/bolt-transparent.png'),stage);
  await fs.mkdir(output,{recursive:true});
  const directories=await packager({dir:application,name:'Bolt',appBundleId:'com.boltautomation.Bolt',appVersion:release.version,buildVersion:release.version,platform,arch,out:output,overwrite:true,asar:false,prune:false,electronVersion:require('electron/package.json').version,icon:path.join(stage,platform==='darwin'?'bolt.icns':'bolt.ico'),win32metadata:{CompanyName:'Bolt Automation',FileDescription:'Bolt desktop study workspace',ProductName:'Bolt',OriginalFilename:'Bolt.exe'},osxSign:false});
  for(const directory of directories){for(const name of ['accounts.json','progress.json','study.json','preferences.json']){try{await fs.access(path.join(directory,'resources/app/.app-runtime',name));throw Error('Private runtime data must never enter a desktop package.');}catch(error){if(error.code!=='ENOENT')throw error;}}}
  console.log('Built native Bolt desktop: '+directories.join(', '));return directories;
 }finally{const resolved=path.resolve(stage);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('bolt-desktop-stage-'))throw Error('Unsafe desktop staging cleanup path.');await fs.rm(resolved,{recursive:true,force:true});}
}
if(require.main===module){const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;buildDesktop({source:value('--source'),output:value('--out'),platform:value('--platform'),arch:value('--arch')}).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={buildDesktop};
