const {test}=require('node:test'),assert=require('node:assert/strict');
const {getDownloadStats}=require('../website/api/downloads.js');
test('download totals include actual packages across paginated published releases only',async()=>{
  let page=0;
  const stats=await getDownloadStats(async url=>{page++;assert.ok(url.endsWith('page='+page));return{ok:true,headers:new Headers(page===1?{link:'<https://api.github.com/next>; rel="next"'}:{}),json:async()=>page===1?[{assets:[{name:'Bolt.zip',download_count:4},{name:'Bolt.zip.sha256',download_count:99},{name:'Bolt-macOS-arm64.zip',download_count:3}]},{draft:true,assets:[{name:'Bolt.zip',download_count:999}]}]:[{assets:[{name:'Bolt.zip',download_count:5},{name:'Bolt-macOS-x64.zip',download_count:2}]}]};});
  assert.equal(stats.total,14);assert.deepEqual(stats.platforms,{windows:9,appleSilicon:3,intelMac:2});assert.equal(page,2);
});
test('download counter fails honestly on upstream errors and malformed counts',async()=>{
  await assert.rejects(getDownloadStats(async()=>({ok:false})),/unavailable/);
  await assert.rejects(getDownloadStats(async()=>({ok:true,headers:new Headers(),json:async()=>[{assets:[{name:'Bolt.zip',download_count:-1}]}]})),/Invalid download/);
  const stats=await getDownloadStats(async()=>({ok:true,headers:new Headers(),json:async()=>[]}));assert.equal(stats.total,0);
});
test('download totals retain legacy packages and include the Oak versioned filenames',async()=>{
  const stats=await getDownloadStats(async()=>({ok:true,headers:new Headers(),json:async()=>[{assets:[
    {name:'Bolt.zip',download_count:8},
    {name:'Bolt-v1-oak-Windows-x64.zip',download_count:2},
    {name:'Bolt-v1-oak-macOS-arm64.zip',download_count:3},
    {name:'Bolt-v1-oak-macOS-x64.zip',download_count:4},
    {name:'Bolt-v1-oak-macOS-x64.zip.sha256',download_count:99}
  ]}]}));
  assert.equal(stats.total,17);assert.deepEqual(stats.platforms,{windows:10,appleSilicon:3,intelMac:4});
});

test('Hemlock packages count towards downloads while checksums stay excluded',async()=>{
  const stats=await getDownloadStats(async()=>({ok:true,headers:new Headers(),json:async()=>[{assets:[{name:'Bolt-v2-hemlock-Windows-x64.zip',download_count:2},{name:'Bolt-v2-hemlock-macOS-arm64.zip',download_count:3},{name:'Bolt-v2-hemlock-macOS-x64.zip',download_count:4},{name:'Bolt-v2-hemlock-Windows-x64.zip.sha256',download_count:99}]}]}));assert.equal(stats.total,9);assert.deepEqual(stats.platforms,{windows:2,appleSilicon:3,intelMac:4});
});
