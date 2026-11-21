const RELEASES='https://api.github.com/repos/boltautomation/Bolt-Automation/releases';
async function getDownloadStats(fetcher=fetch) {
  const signal=AbortSignal.timeout(10000),platforms={windows:0,appleSilicon:0,intelMac:0};
  let page=1;
  for(;page<=10;page++){
    const response=await fetcher(`${RELEASES}?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Bolt-download-counter'},signal});
    if(!response.ok)throw new Error('GitHub totals unavailable.');
    const releases=await response.json();if(!Array.isArray(releases))throw new Error('Invalid release totals.');
    for(const release of releases){
      if(release.draft)continue;
      for(const asset of release.assets||[]){
        const versioned=/^Bolt-v[a-z0-9][a-z0-9.-]*-(Windows-x64|macOS-arm64|macOS-x64)\.zip$/i.exec(asset.name);
        const platform={'Bolt.zip':'windows','Bolt-macOS-arm64.zip':'appleSilicon','Bolt-macOS-x64.zip':'intelMac'}[asset.name]||({'Windows-x64':'windows','macOS-arm64':'appleSilicon','macOS-x64':'intelMac'}[versioned?.[1]]);
        if(!platform)continue;
        if(!Number.isSafeInteger(asset.download_count)||asset.download_count<0)throw new Error('Invalid download count.');
        platforms[platform]+=asset.download_count;
      }
    }
    if(!/rel="next"/.test(response.headers.get('link')||''))break;
  }
  if(page>10)throw new Error('Release history is too large to total safely.');
  const total=Object.values(platforms).reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(total))throw new Error('Invalid download total.');
  return{total,platforms,asOf:new Date().toISOString(),source:'GitHub release package downloads'};
}
async function handler(request,response) {
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');response.statusCode=405;response.end(JSON.stringify({error:'Method not allowed.'}));return;}
  try{
    const data=await getDownloadStats();
    response.setHeader('Cache-Control','public, max-age=60, s-maxage=900, stale-while-revalidate=3600');
    response.statusCode=200;response.end(request.method==='HEAD'?'':JSON.stringify(data));
  }catch{
    console.warn('GitHub release download totals are temporarily unavailable.');
    response.setHeader('Cache-Control','no-store');response.setHeader('Retry-After','60');
    response.statusCode=503;response.end(request.method==='HEAD'?'':JSON.stringify({error:'Download totals are temporarily unavailable.'}));
  }
}
module.exports=handler;
module.exports.getDownloadStats=getDownloadStats;
