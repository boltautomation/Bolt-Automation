// Restart only the idle local app. This updater never opens ChatterHigh,
// restores a browser session, or attempts credentials.
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:wait}=require('node:timers/promises');
const {createApp}=require('./server.cjs');
const root=path.resolve(__dirname,'../.app-runtime'),origin='http://127.0.0.1:43117';
const report=value=>fs.writeFile(path.join(root,'study-upgrade-status.json'),JSON.stringify(value));
(async()=>{await fs.mkdir(root,{recursive:true});await report({phase:'preparing'});try{
  const html=await(await fetch(origin)).text(),token=html.match(/name="app-token" content="([^"]+)"/)?.[1];if(!token)throw new Error('The local app could not be read.');
  const headers={'X-App-Token':token,'Content-Type':'application/json'};
  const state=await(await fetch(origin+'/api/state',{headers})).json();if(state.busy)throw new Error('Finish or stop the current app activity before applying this update.');
  const latest=await(await fetch(origin+'/api/state',{headers})).json();if(latest.busy||latest.accountId!==state.accountId)throw new Error('The app activity changed. Apply the update when it is idle.');
  const shutdown=await fetch(origin+'/api/shutdown',{method:'POST',headers,body:'{}'});if(!shutdown.ok)throw new Error('The idle app could not close.');
  for(let i=0;i<100;i++){try{await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)});}catch{break;}await wait(100);}
  const app=await createApp({port:43117,open:true});const close=()=>app.close().then(()=>process.exit(0));process.once('SIGINT',close);process.once('SIGTERM',close);
  await report({phase:'ready',study:true,automationStarted:false});
}catch(error){await report({phase:'error',message:error.message});process.exitCode=1;}})();
