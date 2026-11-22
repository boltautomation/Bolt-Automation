const {test}=require('node:test'),assert=require('node:assert/strict');
const {searchQuery,searchResults,quickWebSources}=require('../app/web-sources.cjs');
const {OllamaSolver}=require('../app/ollama.cjs');
const signal=()=>new AbortController().signal;
test('outside research matches the actual task rather than a generic course introduction',async()=>{
 const q={prompt:'SMART goals help you stay motivated. What should you do if your goal becomes too easy or too hard?',researchContext:{course:'Introduction to the Award',activity:'How to get started'},options:[]};
 const html='<li class="b_algo"><h2><a href="https://example.org/writing">How to write an introduction</a></h2><p>An introduction is the start of an essay.</p></li>';
 const urls=[];const results=await quickWebSources(q,signal(),{downloader:async url=>{urls.push(url);return{url,content:url.includes('bing.com')?html:'{"query":{"search":[]}}'};}});assert.deepEqual(results,[]);assert.ok(!urls.some(url=>url==='https://example.org/writing'));
 assert.match(searchQuery(q),/What should you do/);assert.ok(!searchQuery(q).includes('help you stay motivated'));
});
const question={prompt:'What are wool and silk animal fibres made of?',multiple:false,options:[{id:'a',text:'Proteins'},{id:'b',text:'Minerals'}]};
const source={url:'https://example.edu/fibres',title:'Animal fibres',text:'Wool and silk are animal fibres made from proteins. Protein molecules give these natural fibres their structure and properties.'};
const html=`<ol><li class="b_algo"><h2><a href="${source.url}">Animal fibres wool and silk</a></h2><p>Wool and silk proteins</p></li><li class="b_algo"><h2><a href="http://127.0.0.1/private">Wool and silk</a></h2></li><li class="b_algo"><h2><a href="https://example.org/food">Pickled asparagus</a></h2><p>Vegetables</p></li></ol>`;
test('web search limits and cleans question queries while retaining the final task',()=>{
  assert.ok(searchQuery(question).includes('animal fibres'));
  const q=searchQuery({prompt:'Question 2: Contact private@example.com and visit https://example.org/?token=secret. '+('Context text. '.repeat(60))+'What is step 9? Hint: Use Research.'});
  assert.ok(q.length<=400);assert.match(q,/What is step 9/);assert.ok(!/private@|secret|https:|Use Research/.test(q));
});
test('search result decoding rejects private addresses, preserves real links and ignores non-result controls',()=>{
  const encoded='a1'+Buffer.from(source.url).toString('base64url');
  const rows=searchResults(html+`<li class='b_algo'><h2><a href='https://www.bing.com/ck/a?u=${encoded}'>Duplicate</a></h2></li>`);
  assert.equal(rows.length,2);assert.equal(rows[0].url,source.url);
});
test('quick research reads actual relevant pages rather than citing search snippets and does not send cookies',async()=>{
  const calls=[];const result=await quickWebSources(question,signal(),{downloader:async(url,s)=>{calls.push(url);s.throwIfAborted();return{url,content:url.includes('bing.com')?html:`<title>${source.title}</title><main>${source.text}</main>`};}});
  assert.equal(calls.filter(url=>url===source.url).length,1);assert.equal(result.length,1);assert.equal(result[0].url,source.url);assert.equal(result[0].external,true);assert.match(result[0].text,/Protein molecules/);
});
test('failed, unrelated and challenged search pages produce no invented evidence',async()=>{
  for(const content of ['<h1>Verify you are human</h1>',html]){
    const result=await quickWebSources(question,signal(),{downloader:async url=>{if(!url.includes('bing.com'))throw Error('Blocked');return{url,content};}});assert.deepEqual(result,[]);
  }
});
test('quick research respects a single deadline and Stop propagates',async()=>{
  let aborted=false;const start=Date.now();
  const result=await quickWebSources(question,signal(),{budgetMs:20,downloader:(u,s)=>new Promise((resolve,reject)=>s.addEventListener('abort',()=>{aborted=true;reject(s.reason);},{once:true}))});
  assert.deepEqual(result,[]);assert.equal(aborted,true);assert.ok(Date.now()-start<500);
  const c=new AbortController();c.abort();await assert.rejects(quickWebSources(question,c.signal),{name:'AbortError'});
});
test('missing linked research can be answered from outside evidence with citations and an independent check',async()=>{
  let searches=0,requests=0;const events=[];
  const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[],webSourceLoader:async()=>{searches++;return[source];},fetcher:async()=>{requests++;return{ok:true,json:async()=>({done:true,message:{content:JSON.stringify({optionIds:['a'],confidence:.95,personal:false,explanation:'Animal fibres consist of proteins.',evidenceRefs:['s0:p0'],supported:true})}})};}});
  const answer=await solver.solve(question,signal(),e=>events.push(e));assert.deepEqual(answer.optionIds,['a']);assert.equal(answer.crossChecked,true);assert.deepEqual(answer.sources,[{url:source.url,title:source.title}]);assert.equal(searches,1);assert.equal(requests,2);assert.ok(events.some(e=>e.searching));
  await solver.solve(question,signal());assert.equal(searches,1,'cached evidence avoids repeated search');
});
test('source failures try quick research once; fallback guesses receive its evidence without a second search',async()=>{
  let searches=0;const bodies=[];
  const solver=new OllamaSolver({sourceLoader:async()=>{throw Error('Source unavailable');},webSourceLoader:async()=>{searches++;return[source];},fetcher:async(u,r)=>{bodies.push(JSON.parse(r.body));return{ok:true,json:async()=>({done:true,message:{content:JSON.stringify(bodies.length===1?{optionIds:[],confidence:.1,personal:false,explanation:'Needs inference',evidenceRefs:[]}:{optionIds:['a'],confidence:.7,personal:false,explanation:'Wool and silk are protein fibres.',canAnswer:true,basis:'source-context'})}})};}});
  await assert.rejects(solver.solve(question,signal()),/supporting source/);const answer=await solver.guess(question,signal());assert.equal(searches,1);assert.deepEqual(answer.optionIds,['a']);assert.match(JSON.parse(bodies[1].messages[1].content).excerpts,/Protein molecules/);
});
test('session expiry bypasses external research and disabled web research makes no search calls',async()=>{
  let searches=0;const solver=new OllamaSolver({sourceLoader:async()=>{throw Object.assign(Error('Expired'),{code:'SESSION_EXPIRED'});},webSourceLoader:async()=>{searches++;return[source];}});
  await assert.rejects(solver.solve(question,signal()),{code:'SESSION_EXPIRED'});assert.equal(searches,0);
  const offline=new OllamaSolver({sourceLoader:async()=>[]});await assert.rejects(offline.solve(question,signal()),/No research page/);
});

test('personal opinions and completion acknowledgements are never sent to outside search',async()=>{
  let searches=0;const solver=new OllamaSolver({webSourceLoader:async()=>{searches++;return[source];}});
  assert.deepEqual(await solver.webSources({...question,prompt:'In your opinion, which career interests you most?'},signal()),[]);
  assert.deepEqual(await solver.webSources({...question,prompt:'Fill out this worksheet. Did you complete the reflection?'},signal()),[]);
  assert.equal(searches,0);
});

test('encyclopedia fallback follows its actual article and prioritizes evidence over shopping results',async()=>{
  const calls=[],result=await quickWebSources(question,signal(),{downloader:async url=>{
    calls.push(url);
    if(url.includes('/w/api.php'))return{url,content:JSON.stringify({query:{search:[{title:'Animal fiber',snippet:'Wool and silk are protein animal fibres.'}]}})};
    if(url.includes('bing.com'))return{url,content:'<li class="b_algo"><h2><a href="https://shop.example.org/collections/wool">Wool and silk animal fibres</a></h2><p>Wool silk animal fibres proteins</p></li>'};
    return{url,content:'<title>Animal fiber</title>'+source.text};
  }});
  assert.equal(result.length,1);assert.equal(result[0].url,'https://en.wikipedia.org/wiki/Animal_fiber');assert.ok(!calls.some(url=>url.includes('/collections/')));
});
