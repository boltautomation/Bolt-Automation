const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../website');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname.split('/').some(part=>part.startsWith('.')))throw Error('Not found');
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw Error('Not found');
    const data=await fs.readFile(file);response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(data);
  }catch{response.writeHead(404);response.end('Not found');}
});
server.listen(Number(process.env.PORT||43119),'127.0.0.1',()=>console.log('Bolt site preview: http://127.0.0.1:'+server.address().port));
const close=()=>server.close(()=>process.exit(0));process.once('SIGINT',close);process.once('SIGTERM',close);
