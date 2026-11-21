const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash,randomUUID}=require('node:crypto');
async function build(){
  if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new Error('Build on an Apple Silicon or Intel Mac with Node.js 24 LTS.');
  const project=path.resolve(__dirname,'..'),output=path.join(project,'releases');
  const stage=path.join(output,'.bolt-mac-'+randomUUID()),bundle=path.join(stage,'Bolt'),resources=path.join(bundle,'resources');
  const zip=path.join(output,`Bolt-macOS-${process.arch}.zip`);
  await fs.mkdir(resources,{recursive:true});
  try{
    for(const directory of ['app/public/assets','extension','runtime','node_modules'])await fs.mkdir(path.join(resources,directory),{recursive:true});
    for(const directory of ['tools','docs'])await fs.mkdir(path.join(bundle,directory),{recursive:true});
    for(const name of await fs.readdir(path.join(project,'app'))){
      if(name.endsWith('.cjs')&&!name.startsWith('upgrade-'))await fs.copyFile(path.join(project,'app',name),path.join(resources,'app',name));
    }
    await fs.cp(path.join(project,'app/public'),path.join(resources,'app/public'),{recursive:true});
    for(const name of ['core.js','runner.js','content.js'])await fs.copyFile(path.join(project,'extension',name),path.join(resources,'extension',name));
    for(const name of ['package.json','package-lock.json'])await fs.copyFile(path.join(project,name),path.join(resources,name));
    for(const name of ['pdfjs-dist','@napi-rs'])await fs.cp(path.join(project,'node_modules',name),path.join(resources,'node_modules',name),{recursive:true});
    await fs.copyFile(process.execPath,path.join(resources,'runtime/node'));
    await fs.chmod(path.join(resources,'runtime/node'),0o755);
    const license=path.resolve(path.dirname(process.execPath),'../LICENSE');
    await fs.copyFile(license,path.join(resources,'runtime/LICENSE.txt'));
    for(const name of ['Start Bolt.command','tools/Start-Bolt.sh','docs/GUIDE.md'])await fs.copyFile(path.join(project,name),path.join(bundle,name));
    for(const name of ['Start Bolt.command','tools/Start-Bolt.sh'])await fs.chmod(path.join(bundle,name),0o755);
    await fs.writeFile(path.join(bundle,'README.md'),`# Bolt for macOS\n\nRequires macOS 13.5 or newer. This package is for ${process.arch==='arm64'?'Apple Silicon':'Intel'} Macs.\n\n1. Extract the entire ZIP into a folder you can write to.\n2. Open **Start Bolt.command**. Keep tools/ and resources/ beside it.\n3. Install Chrome or Brave and Ollama for macOS when prompted. Download a local model in the app.\n\nNode.js and PDF tools are included. No npm setup is needed. The launcher is not notarized; macOS may request approval in System Settings > Privacy & Security. Verify the release and checksum before allowing it. Never disable Gatekeeper globally.\n\nSaved account secrets are encrypted using a key in your login Keychain. Allow Keychain access if prompted. Keep resources/.app-runtime private and retain your Keychain when updating; saved logins cannot be moved to another user or computer.\n\nBolt is for educational purposes and authorized practice only, not cheating, harm, fraud, fabricated participation, or unauthorized automation. Follow school policies and site terms. AI and automation can be wrong. Review sources and actions. See docs/GUIDE.md and https://bolt-automation.vercel.app/usage-terms.\n`);
    const files=[];
    async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else{const data=await fs.readFile(file);files.push({path:path.relative(bundle,file).split(path.sep).join('/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}}}
    await walk(bundle);
    await fs.writeFile(path.join(bundle,'package-manifest.json'),JSON.stringify({product:'Bolt',version:require('../package.json').version,platform:'darwin',architecture:process.arch,node:process.versions.node,files},null,2));
    await fs.rm(zip,{force:true});
    execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',bundle,zip],{stdio:'inherit'});
    await fs.writeFile(zip+'.sha256',createHash('sha256').update(await fs.readFile(zip)).digest('hex')+'  '+path.basename(zip)+'\n');
    console.log('Built '+zip);
  }finally{
    if(path.dirname(stage)!==output||!path.basename(stage).startsWith('.bolt-mac-'))throw new Error('Invalid build cleanup path.');
    await fs.rm(stage,{recursive:true,force:true});
  }
}
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={build};
