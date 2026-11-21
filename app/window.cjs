const {spawnSync}=require('node:child_process');
function windowBounds(area={x:0,y:0,width:1440,height:900}){
  const width=Math.min(1080,Math.max(420,Math.floor(area.width*.82)),Math.max(280,area.width-32));
  const height=Math.min(740,Math.max(400,Math.floor(area.height*.82)),Math.max(300,area.height-48));
  return {width,height,left:(area.x||0)+Math.floor((area.width-width)/2),top:(area.y||0)+Math.floor((area.height-height)/2)};
}
function screenBounds(){
  if(process.platform==='win32')try{
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Windows.Forms; $area=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; @{x=$area.X;y=$area.Y;width=$area.Width;height=$area.Height}|ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:3000});
    if(result.status===0){const area=JSON.parse(result.stdout);if(area.width>0&&area.height>0)return windowBounds(area);}
  }catch{}
  return windowBounds();
}
module.exports={windowBounds,screenBounds};
