const http=require('node:http');
const assert=require('node:assert/strict');
const {Manager}=require('../app/manager.cjs');
const {Browser}=require('../app/browser.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
(async()=>{
  let logins=0,expired=false,origin;const sessions=new Set(),accepted={1:0,2:0},submissions=[];
  const nav='<nav><a href="/modules">Modules</a><a href="/sign_out">Log out</a></nav>';
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/disabled-login')return res.end('<div role="alert">Your account has been disabled.</div><form><input type="email"><input type="password"></form>');
    if(req.url==='/login'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;const form=new URLSearchParams(body);
      assert.equal(form.get('email'),'session@example.test');assert.equal(form.get('password'),'test-password');
      const session=`fixture-${++logins}`;sessions.add(session);res.writeHead(302,{Location:'/dashboard','Set-Cookie':`session=${session}; HttpOnly; SameSite=Lax`});res.end();return;
    }
    if(req.url==='/login')return res.end('<form action="/login" method="post"><input name="email" type="email"><input name="password" type="password"><button type="submit">Sign In</button></form>');
    if(req.url==='/')return res.end('<h1>Welcome to this learning site</h1><a href="/login">Sign in</a>');
    const token=(req.headers.cookie||'').match(/session=([^;]+)/)?.[1];
    if(!sessions.has(token)){res.writeHead(302,{Location:'/'});res.end();return;}
    if(req.url==='/dashboard')return res.end(nav+'<h1>Your dashboard</h1>');
    if(req.url==='/modules')return res.end(nav+'<div class="course"><div class="name drill-down-course-name">Test course</div><a class="drill-down-course" data-url="/modules/modules_in_course?course_id=1" href="#">Expand modules</a></div>');
    if(req.url.startsWith('/modules/modules_in_course?'))return res.end(`<div class="modules">${[1,2].map(id=>`<div class="mod"><span class="name">Module ${id}</span><span class="mod-stats">${accepted[id]}/${id===1?2:1} answered <a href="/modules/${id}/question">Start</a></span></div>`).join('')}</div>`);
    const submit=req.url.match(/^\/answer\/(1|2)\/(\d+)$/);
    if(submit&&req.method==='POST'){
      const id=Number(submit[1]),index=Number(submit[2]);let body='';for await(const chunk of req)body+=chunk;
      if(new URLSearchParams(body).get('answer')!=='ottawa'||index!==accepted[id]){res.writeHead(400);res.end('Wrong or repeated submission');return;}
      accepted[id]++;submissions.push(`${id}:${index}`);
      if(!expired){expired=true;sessions.delete(token);res.writeHead(302,{Location:'/'});res.end();return;}
      res.writeHead(302,{Location:`/modules/${id}/question`});res.end();return;
    }
    const module=req.url.match(/^\/modules\/(1|2)\/question$/);
    if(module){const id=Number(module[1]),index=accepted[id];if(index>=(id===1?2:1))return res.end(nav+'<h1>You have completed all the questions for this module.</h1>');return res.end(`${nav}<form action="/answer/${id}/${index}" method="post"><fieldset><legend>Question ${index+1}: Which city is the capital of Canada?</legend><label><input type="radio" name="answer" value="toronto">Toronto</label><label><input type="radio" name="answer" value="ottawa">Ottawa</label></fieldset><button type="submit">Submit</button></form>`);}
    res.writeHead(404);res.end('Not found');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const m=new Manager({accountStore:new MemoryAccounts(),progressStore:new MemoryProgress(),signInUrl:origin+'/login',browserFactory:()=>new Browser({headless:true,mouseOptions:{durationScale:0},origins:[origin]}),solverFactory:()=>({solve:async()=>({optionIds:['o1'],confidence:.98,personal:false,sources:[{url:'https://example.org/source'}]})})});
  try{
    m.connect({email:'session@example.test',password:'test-password',remember:true});await m.job;assert.equal(m.state.modules.length,2,m.state.message);
    m.run({accountId:m.state.accountId,mode:'modules',moduleIds:m.state.modules.map(module=>module.id),settings:{finishActivity:true}});await m.job;
    assert.equal(m.state.phase,'complete',m.state.message);assert.equal(logins,2,JSON.stringify({accepted,queue:m.state.queue,events:m.state.events.map(({type,message,count})=>({type,message,count}))}));assert.equal(m.state.count,3);assert.deepEqual(accepted,{1:2,2:1});assert.equal(new Set(submissions).size,3);assert.deepEqual(m.state.queue.map(item=>item.status),['completed','completed']);assert.ok(m.state.events.some(event=>event.type==='session-restored'));
    console.log('PASS real browser cookie expiration redirects home, saved login reconnects, and both modules finish without repeating accepted answers');
    await m.browser.navigate(origin+'/disabled-login',new AbortController().signal);assert.equal((await m.browser.info()).accountDisabled,true);await assert.rejects(m.browser.assertSession(),error=>error.accountDisabled===true&&error.code==='SESSION_RECOVERY_REQUIRED');assert.equal(logins,2);
    console.log('PASS disabled-account notices stop session recovery without submitting credentials');
  }finally{await m.disconnect();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
