const {app,BrowserWindow,ipcMain,shell,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const release=require('../package.json'),windowTitle='Bolt - '+release.versionName;
app.setName('Bolt');app.setAppUserModelId('com.boltautomation.Bolt');
if(process.env.BOLT_DESKTOP_PROFILE)app.setPath('userData',path.resolve(process.env.BOLT_DESKTOP_PROFILE));
let mainWindow,backend,backendOrigin,closing=false;
const testTrace=message=>{if(process.env.BOLT_DESKTOP_TEST==='1')console.log('[Bolt desktop] '+message);};
const port=Number(process.env.BOLT_PORT||process.env.CHATTERHIGH_PORT||43117);
async function prepareData(){
 if(process.env.BOLT_DATA_DIR)return;
 const legacy=path.resolve(__dirname,'../.app-runtime');
 // Source checkouts keep their current data. Packaged apps use the OS app-data directory.
 if(!app.isPackaged){process.env.BOLT_DATA_DIR=legacy;return;}
 const destination=path.join(app.getPath('userData'),'data');await fs.mkdir(destination,{recursive:true});
 const candidates=[process.env.BOLT_LEGACY_DATA_DIR,legacy,path.resolve(path.dirname(process.execPath),'../../resources/.app-runtime')].filter(Boolean);
 for(const name of ['accounts.json','progress.json','study.json','preferences.json']){
  const target=path.join(destination,name);try{await fs.access(target);}catch{for(const candidate of candidates)try{await fs.copyFile(path.join(candidate,name),target,require('node:fs').constants.COPYFILE_EXCL);break;}catch{}}
 }
 process.env.BOLT_DATA_DIR=destination;
}
async function connectBackend(){
 const origin='http://127.0.0.1:'+port;
 try{const health=await(await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)})).json();if(['chatterhigh-local-app','bolt-local-app'].includes(health.app)){backendOrigin=origin;return;}}catch{}
 backend=await require('./server.cjs').createApp({port,preferences:new(require('./preferences.cjs').Preferences)()});backendOrigin=backend.origin;
 backend.server.once('close',()=>{if(!closing){closing=true;app.quit();}});
}
async function startInstalledOllama(){
 if(process.env.BOLT_DESKTOP_TEST==='1')return;
 try{if((await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(900)})).ok)return;}catch{}
 const candidates=process.platform==='win32'?[path.join(process.env.LOCALAPPDATA||'','Programs/Ollama/ollama.exe')]:['/usr/local/bin/ollama','/opt/homebrew/bin/ollama','/Applications/Ollama.app/Contents/Resources/ollama'];
 for(const executable of candidates)try{await fs.access(executable);const child=require('node:child_process').spawn(executable,['serve'],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();break;}catch{}
}
async function shutdownBackend(){
 testTrace('Saving and closing backend');
 if(backend){await backend.close();backend=null;testTrace('Backend closed');return;}
 if(!backendOrigin)return;
 try{const html=await(await fetch(backendOrigin)).text(),token=html.match(/name="app-token" content="([^"]+)"/)?.[1];if(token)await fetch(backendOrigin+'/api/shutdown',{method:'POST',headers:{'X-App-Token':token,'Content-Type':'application/json'},body:'{}'});}catch{}
}
function notifyState(overrides={}){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('bolt-window-state',{maximized:mainWindow.isMaximized(),minimized:mainWindow.isMinimized(),visible:mainWindow.isVisible(),title:windowTitle,...overrides});}
async function openWindow(){
 const {screen}=require('electron'),area=screen.getPrimaryDisplay().workAreaSize;
 mainWindow=new BrowserWindow({width:Math.min(1120,area.width-30),height:Math.min(820,area.height-30),minWidth:740,minHeight:520,frame:false,show:false,title:windowTitle,backgroundColor:process.platform==='win32'?'#00000000':'#141414',...(process.platform==='win32'?{backgroundMaterial:'mica'}:{}),icon:path.join(__dirname,'public/assets/bolt-transparent.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'desktop-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 mainWindow.webContents.setWindowOpenHandler(({url})=>{try{const link=new URL(url);if(['https:','http:'].includes(link.protocol)&&!link.username&&!link.password)shell.openExternal(link.href);}catch{}return{action:'deny'};});
 mainWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==backendOrigin)event.preventDefault();});
 mainWindow.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
 for(const event of ['maximize','unmaximize'])mainWindow.on(event,()=>notifyState());
 mainWindow.on('minimize',()=>notifyState({minimized:true}));mainWindow.on('restore',()=>notifyState({minimized:false}));
 mainWindow.on('close',event=>{if(closing)return;event.preventDefault();closing=true;testTrace('Window close requested');mainWindow.destroy();shutdownBackend().finally(()=>app.quit());});
 await mainWindow.loadURL(backendOrigin);mainWindow.show();notifyState();
 if(!app.isPackaged&&process.env.BOLT_DESKTOP_READY_FILE)await fs.writeFile(process.env.BOLT_DESKTOP_READY_FILE,JSON.stringify({origin:backendOrigin,pid:process.pid}));
}
ipcMain.on('bolt-window',(event,action)=>{if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame)return;let url;try{url=new URL(event.senderFrame.url);}catch{return;}if(url.origin!==backendOrigin)return;if(action==='minimize')mainWindow.minimize();else if(action==='maximize')mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();else if(action==='close')mainWindow.close();else if(action==='ready')notifyState();});
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
 app.whenReady().then(async()=>{if(process.platform!=='darwin')Menu.setApplicationMenu(null);await prepareData();await connectBackend();await openWindow();startInstalledOllama().catch(()=>{});}).catch(error=>{require('electron').dialog.showErrorBox('Bolt could not start',error.message);app.quit();});
 app.on('window-all-closed',()=>{if(!closing)app.quit();});
 app.on('before-quit',event=>{testTrace('Quit requested; closing='+closing);if(!closing){event.preventDefault();closing=true;shutdownBackend().finally(()=>app.quit());}});
}
