const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {AccountStore}=require('../app/accounts.cjs');
const {ProgressStore}=require('../app/progress.cjs');
const {windowBounds}=require('../app/window.cjs');
async function directory(t,prefix){const root=path.resolve('test-results');await fs.mkdir(root,{recursive:true});const temp=await fs.mkdtemp(path.join(root,prefix));t.after(async()=>{if(path.dirname(temp)!==root)throw new Error('Invalid test cleanup path');await fs.rm(temp,{recursive:true,force:true});});return temp;}
test('Windows vault encrypts passwords and sessions and survives reopening',{skip:process.platform!=='win32'},async t=>{
  const dir=await directory(t,'vault-test-'),file=path.join(dir,'accounts.json'),store=new AccountStore({file});
  const password='fixture-Sëcret!🔒',cookie='fixture-cookie-do-not-log';
  const saved=await store.save({email:'fixture@example.test',secret:{password,session:{url:'https://chatterhigh.com/en/home',cookies:[{name:'session',value:cookie}]}}});
  const raw=await fs.readFile(file,'utf8');assert.ok(!raw.includes(password)&&!raw.includes(cookie));
  const reopened=new AccountStore({file});const opened=await reopened.get(saved.id);assert.equal(opened.secret.password,password);assert.equal(opened.secret.session.cookies[0].value,cookie);
  const metadata=await reopened.list();assert.equal(metadata.length,1);assert.ok(!JSON.stringify(metadata).includes(password));assert.equal(metadata[0].hasPassword,true);
  await reopened.save({id:saved.id,email:saved.email,secret:{session:{url:'https://chatterhigh.com/en/home',cookies:[{name:'session',value:'updated-fixture'}]}}});
  assert.equal((await reopened.get(saved.id)).secret.password,password);
  await reopened.remove(saved.id);assert.equal((await reopened.list()).length,0);
});
test('completion, queue, and checked selections persist without crossing accounts',async t=>{
  const dir=await directory(t,'progress-test-'),file=path.join(dir,'progress.json'),store=new ProgressStore({file});
  const module={id:'https://chatterhigh.com/modules/1',title:'Example',course:'Course',answered:1,total:3,completed:false};
  await store.sync('first@example.test',[module]);await store.selection('first@example.test',[module.id]);
  const score={correct:2,total:3,source:'site'};
  await store.update('first@example.test',module.id,{status:'completed',answered:3,score,completedAt:new Date().toISOString()});await store.queue('first@example.test',[{id:module.id,status:'completed',score}]);
  const reopened=new ProgressStore({file}),data=await reopened.get('first@example.test');assert.equal(data.items[module.id].status,'completed');assert.deepEqual(data.selected,[module.id]);assert.equal(data.queue[0].status,'completed');assert.deepEqual((await reopened.get('other@example.test')).items,{});
  assert.deepEqual(data.items[module.id].score,score);assert.deepEqual(data.queue[0].score,score);
  const refreshed=await reopened.sync('first@example.test',[{...module,answered:3,completed:true}]);assert.deepEqual(refreshed.items[module.id].score,score);
  const authoritative=await reopened.sync('first@example.test',[module]);assert.equal(authoritative.items[module.id].status,'pending');
  assert.equal(authoritative.items[module.id].score,null,'a reset module cannot retain an old correctness score');
});
test('default app window fits smaller and high-DPI work areas',()=>{
  for(const area of [{x:0,y:0,width:1920,height:1040},{x:0,y:0,width:1366,height:728},{x:0,y:0,width:1024,height:680},{x:-1280,y:0,width:1280,height:720}]){
    const bounds=windowBounds(area);assert.ok(bounds.width<=1080&&bounds.height<=740);assert.ok(bounds.left>=area.x&&bounds.top>=area.y);assert.ok(bounds.left+bounds.width<area.x+area.width);assert.ok(bounds.top+bounds.height<area.y+area.height);
  }
});
