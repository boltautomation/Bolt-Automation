const {test}=require('node:test'),assert=require('node:assert/strict');
const {RunMetrics}=require('../app/run-metrics.cjs');
const {Manager}=require('../app/manager.cjs');
const {MemoryAccounts,MemoryProgress}=require('./memory-stores.cjs');
function clock(){let time=0;const metrics=new RunMetrics({now:()=>time,wallNow:()=>100000+time});return {metrics,advance:ms=>time+=ms};}
test('elapsed time starts at Start, freezes while paused, resumes, and resets for a new run',()=>{
  const c=clock();assert.equal(c.metrics.snapshot().startedAt,null);c.metrics.start();c.advance(20000);c.metrics.submitted(1,'page1');
  assert.equal(c.metrics.snapshot().elapsedMs,20000);assert.equal(c.metrics.snapshot().questionsPerMinute,3);
  c.metrics.pause();c.advance(60000);assert.equal(c.metrics.snapshot().elapsedMs,20000);
  c.metrics.start({resume:true});c.advance(10000);assert.equal(c.metrics.snapshot().elapsedMs,30000);assert.equal(c.metrics.snapshot().questionsPerMinute,2);
  c.metrics.pause();c.metrics.start();assert.equal(c.metrics.snapshot().elapsedMs,0);assert.equal(c.metrics.snapshot().questions,0);
});
test('rate warms up and counts only positive, unique submitted quiz pages',()=>{
  const c=clock();c.metrics.submitted(9,'inactive');c.metrics.start();c.metrics.submitted(1,'module1:question');c.metrics.submitted(1,'module1:question');c.metrics.submitted(0,'survey');c.metrics.submitted(-1,'invalid');c.metrics.submitted(1.5,'fraction');
  c.advance(14999);assert.equal(c.metrics.snapshot().questionsPerMinute,null);c.advance(1);assert.equal(c.metrics.snapshot().questionsPerMinute,4);
  c.metrics.submitted(1,'module2:question');assert.equal(c.metrics.snapshot().questions,2);
  c.metrics.pause();c.metrics.submitted(1,'paused');assert.equal(c.metrics.snapshot().questions,2);
});
test('manager timing survives snapshots, stops immediately, and ignores unrelated jobs',async()=>{
  const c=clock(),manager=new Manager({runMetrics:c.metrics,accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});let finish;
  manager.begin(()=>new Promise(resolve=>{finish=resolve;}),{run:true});await Promise.resolve();c.advance(15000);
  manager.event({type:'submitted',count:1,questionCount:1,fingerprint:'accepted'});manager.event({type:'submitted',count:1,questionCount:1,fingerprint:'accepted'});manager.event({type:'submitted',count:1,questionCount:0,fingerprint:'survey',survey:true});
  assert.equal(manager.snapshot().runTiming.questions,1);assert.equal(manager.snapshot().runTiming.questionsPerMinute,4);
  manager.stop();c.advance(30000);assert.equal(manager.snapshot().runTiming.elapsedMs,15000);finish();await manager.job;
  manager.begin(async()=>{c.advance(5000);});await manager.job;assert.equal(manager.snapshot().runTiming.elapsedMs,15000);
  manager.begin(async()=>{c.advance(15000);manager.event({type:'submitted',count:2,questionCount:1,fingerprint:'second'});},{run:true,resume:true});await manager.job;
  assert.equal(manager.snapshot().runTiming.elapsedMs,30000);assert.equal(manager.snapshot().runTiming.questions,2);
  manager.begin(async()=>{c.advance(1000);},{run:true});await manager.job;assert.equal(manager.snapshot().runTiming.questions,0);assert.equal(manager.snapshot().runTiming.elapsedMs,1000);
  await manager.disconnect();assert.equal(manager.snapshot().runTiming.startedAt,null);
});
test('manager freezes timing on a failed activity without counting a submitted answer',async()=>{
  const c=clock(),manager=new Manager({runMetrics:c.metrics,accountStore:new MemoryAccounts(),progressStore:new MemoryProgress()});
  manager.begin(async()=>{c.advance(2200);throw Error('Controlled failure');},{run:true});await manager.job;c.advance(20000);
  assert.equal(manager.snapshot().runTiming.elapsedMs,2200);assert.equal(manager.snapshot().runTiming.running,false);assert.equal(manager.snapshot().runTiming.questions,0);
});
