const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OllamaSolver, listModels, pullModel, ollamaUrl, localModel, quoteOptions } = require('../app/ollama.cjs');
const { publicAddress, publicUrl, pageText, excerpts, loadSources } = require('../app/sources.cjs');
const question = { id: 'q0', text: 'Which city is the capital of Canada?', multiple: false, options: [{ id: 'o0', text: 'Toronto' }, { id: 'o1', text: 'Ottawa' }], links: [{ url: 'https://www.canada.ca/' }] };
const source = { id: 's0', title: 'Government of Canada', url: 'https://www.canada.ca/', text: 'Ottawa is the capital of Canada and the seat of the federal government.' };
const decision = { optionIds: ['o1'], confidence: .98, personal: false, explanation: 'The source identifies Ottawa as the capital.', sourceIds: ['s0'], evidenceQuote: 'Ottawa is the capital of Canada' };
const result = value => ({ ok: true, json: async () => ({ done: true, done_reason: 'stop', message: { content: JSON.stringify(value) } }) });
test('Ollama addresses accept only local HTTP servers', () => {
  assert.equal(ollamaUrl(), 'http://127.0.0.1:11434'); assert.equal(ollamaUrl('http://localhost:11434'), 'http://localhost:11434');
  for (const url of ['https://ollama.com', 'http://192.168.1.2:11434', 'http://127.0.0.1:11434/other', 'http://user:pass@localhost:11434', 'file:///x']) assert.throws(() => ollamaUrl(url));
  assert.equal(localModel('qwen3:4b'), true); assert.equal(localModel('gpt-oss:120b-cloud'), false);
});
test('model discovery filters cloud and remote entries', async () => {
  const models = await listModels(undefined, { fetcher: async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen3:4b', size: 123 }, { name: 'cloud-test', size: 2 }, { name: 'remote', remote_host: 'example.org' }] }) }) });
  assert.deepEqual(models, [{ name: 'qwen3:4b', size: 123 }]);
});
test('missing Ollama and missing model provide actionable setup messages', async () => {
  await assert.rejects(listModels(undefined, { fetcher: async () => { throw new Error('connection refused'); } }), /ollama pull qwen3:4b/);
  const solver = new OllamaSolver({ fetcher: async () => ({ ok: true, json: async () => ({ models: [] }) }) });
  await assert.rejects(solver.check(new AbortController().signal), /Model is not installed/);
});
test('local inference uses structured JSON, local URL and no API credentials', async () => {
  let request, url, research;
  const solver = new OllamaSolver({ sourceLoader: async () => [source], fetcher: async (target, options) => { url = target; request = options; return result(decision); } });
  const answer = await solver.solve(question, new AbortController().signal, evidence => { research = evidence; });
  assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(request.headers.Authorization, undefined);
  const body = JSON.parse(request.body); assert.equal(body.stream, false); assert.equal(body.model, 'qwen3:4b');
  assert.deepEqual(body.format.properties.optionIds.items.enum, ['o0', 'o1']);
  assert.equal(body.format.properties.optionIds.maxItems, 1);
  assert.equal(answer.sources[0].url, source.url); assert.ok(research.evidence.includes(source.text));
  assert.equal(answer.optionIds[0], 'o1');
});
test('local solver rejects fabricated evidence and invented citations', async () => {
  for (const change of [{ evidenceQuote: 'An invented claim from another website.' }, { sourceIds: ['made-up-source'] }, { evidenceQuote: '' }]) {
    const solver = new OllamaSolver({ sourceLoader: async () => [source], fetcher: async () => result({ ...decision, ...change }) });
    await assert.rejects(solver.solve(question, new AbortController().signal), /quote supporting evidence/);
  }
});

test('model prompts use explicit A/B/C labels and exclude duplicated UI and internal research URLs',async()=>{
  const requests=[],q={...question,prompt:'What else does the resource page link to?',text:'What else does the resource page link to? Research Submit Report problem',options:[{id:'o0',text:'Meditation'},{id:'o1',text:'Craft ideas'},{id:'o2',text:'Jobs'},{id:'o3',text:'Both A and C'}]};
  const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async(url,request)=>{requests.push(JSON.parse(request.body));return result({...decision,optionIds:['o0'],supported:true});}});
  await solver.solve(q,new AbortController().signal);
  for(const body of requests){
    const sent=JSON.parse(body.messages[1].content.split('QUESTION:\n')[1].split('\nSOURCE EXCERPTS:')[0]);
    assert.deepEqual(sent.options.map(o=>[o.label,o.id]),[['A','o0'],['B','o1'],['C','o2'],['D','o3']]);
    assert.equal(sent.links,undefined);assert.equal(sent.text,undefined);assert.equal(sent.prompt,q.prompt);
  }
});

test('research, independent checks and fallback guesses reuse one model context', async () => {
  const requests=[];
  let loadedContext,loads=0;
  const solver=new OllamaSolver({doubleCheck:true,sourceLoader:async()=>[source],fetcher:async(url,request)=>{
    const body=JSON.parse(request.body);requests.push(body);
    // Model the Ollama scheduler: a changed allocation requires a reload.
    if(body.options.num_ctx!==loadedContext){loadedContext=body.options.num_ctx;loads++;}
    return result({...decision,supported:true,canAnswer:true,basis:'general-knowledge'});
  }});
  const signal=new AbortController().signal;
  await solver.solve(question,signal);
  await solver.guess(question,signal);
  await solver.solve(question,signal);
  assert.equal(requests.length,5);
  assert.equal(loads,1,'falling back and returning to research must not reload the model');
  assert.equal(requests[2].options.num_predict,700,'guesses retain their shorter output budget');
});

test('True/False inference excludes both N/A placeholders and preserves page IDs',async()=>{
  let body;
  const q={...question,prompt:'Ottawa is the capital of Canada.',multiple:true,options:[{id:'o0',text:'N/A'},{id:'o1',text:'False'},{id:'o2',text:'True'},{id:'o3',text:'N/A'}]};
  const solver=new OllamaSolver({sourceLoader:async()=>[source],fetcher:async(url,request)=>{body=JSON.parse(request.body);return result({...decision,optionIds:['o2']});}});
  const answer=await solver.solve(q,new AbortController().signal);
  assert.deepEqual(body.format.properties.optionIds.items.enum,['o1','o2']);
  assert.equal(body.format.properties.optionIds.maxItems,1);
  assert.equal(Object.keys(body.format.properties)[0],'explanation');
  assert.match(body.messages[1].content,/Missing evidence alone does not establish False/);
  const sent=JSON.parse(body.messages[1].content.split('QUESTION:\n')[1].split('\nSOURCE EXCERPTS:')[0]);
  assert.equal(sent.multiple,false);assert.deepEqual(sent.options.map(option=>option.text),['False','True']);
  assert.deepEqual(answer.optionIds,['o2']);
});
test('no readable resource stops before inference and cancellation prevents generation', async () => {
  let calls = 0;
  const solver = new OllamaSolver({ sourceLoader: async () => [], fetcher: async () => { calls++; return result(decision); } });
  await assert.rejects(solver.solve(question, new AbortController().signal), /No research page/); assert.equal(calls, 0);
  const controller = new AbortController();
  const cancelled = new OllamaSolver({ sourceLoader: async () => { controller.abort(); return [source]; }, fetcher: async () => { calls++; return result(decision); } });
  await assert.rejects(cancelled.solve(question, controller.signal), { name: 'AbortError' }); assert.equal(calls, 0);
});
test('research fetches reject private networks and executable URL schemes', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.4.5', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(address), false);
  assert.ok(publicAddress('8.8.8.8')); assert.ok(publicAddress('2606:4700:4700::1111'));
  for (const url of ['http://127.0.0.1/', 'http://localhost/', 'http://metadata.local/', 'file:///etc/passwd', 'https://user:pass@example.com']) assert.throws(() => publicUrl(url));
  assert.equal(publicUrl('https://www.canada.ca/').hostname, 'www.canada.ca');
});
test('research HTML extraction removes scripts and decodes text', () => {
  const parsed = pageText('<title>Canada &amp; Ottawa</title><script>steal()</script><style>bad</style><p>Ottawa is Canada&#39;s capital.</p>');
  assert.equal(parsed.title, 'Canada & Ottawa'); assert.ok(parsed.text.includes("Canada's capital")); assert.ok(!parsed.text.includes('steal()'));
  const text = 'Irrelevant material. '.repeat(1500) + source.text;
  assert.ok(excerpts(text, question).includes('Ottawa'));
});
test('source loading tolerates unavailable links and keeps only fetched pages', async () => {
  const sources = await loadSources({ ...question, links: [{ url: 'https://bad.example' }, { url: source.url }] }, new AbortController().signal, { downloader: async url => {
    if (url.includes('bad')) throw new Error('unavailable'); return { url, type: 'text/html', content: `<title>Official</title><p>${source.text}</p>` };
  } });
  assert.equal(sources.length, 1); assert.equal(sources[0].url, source.url); assert.equal(sources[0].id, 's0');
});
test('model download reads split progress records and requires success', async () => {
  const progress = [], encoder = new TextEncoder();
  const fetcher = async () => ({ ok: true, body: (async function* () { yield encoder.encode('{"status":"pulling","total":100,"completed":50}\n{"sta'); yield encoder.encode('tus":"success"}\n'); })() });
  await pullModel('qwen3:4b', undefined, { fetcher, onProgress: value => progress.push(value) });
  assert.equal(progress[0].completed, 50); assert.equal(progress[1].status, 'success');
  await assert.rejects(pullModel('qwen3:4b', undefined, { fetcher: async () => ({ ok: true, body: (async function* () { yield encoder.encode('{"status":"pulling"}\n'); })() }) }), /before completion/);
  await assert.rejects(pullModel('gpt-oss:120b-cloud'), /Only local models/);
});
test('allowed evidence quotes are bounded verbatim source passages', () => {
  const text = Array.from({length:40},(_,i)=>`Source passage ${i} explains that Ottawa is the capital of Canada.`).join(' ');
  const quotes = quoteOptions([{...source,text}],question);
  assert.equal(quotes.length,16);
  for(const quote of quotes)assert.ok(text.includes(quote));
});
test('answer repair reuses fetched sources and sends only repair feedback to the local model',async()=>{
  let loads=0;const requests=[];
  const solver=new OllamaSolver({sourceLoader:async()=>{loads++;return[source];},fetcher:async(url,request)=>{requests.push(JSON.parse(request.body));return result(decision);}});
  const signal=new AbortController().signal;
  await solver.solve(question,signal);
  await solver.solve(question,signal,()=>{},{error:'Multiple answers returned for a single-choice question.',previous:{optionIds:['o0','o1']}});
  assert.equal(loads,1);assert.ok(requests[1].messages[1].content.includes('REPAIR THE PREVIOUS INVALID RESPONSE'));
});

test('missing-evidence recovery refreshes research once, then reuses the expanded source',async()=>{
  const loads=[],requests=[];
  const incomplete={...source,text:'This page introduces the career. Read the collapsed research section for details.'};
  const solver=new OllamaSolver({sourceLoader:async(q,signal,options)=>{loads.push(options);return[options?.refresh?source:incomplete];},fetcher:async(url,request)=>{requests.push(JSON.parse(request.body));return result(requests.length===1?{...decision,confidence:.6,evidenceQuote:incomplete.text}:decision);}});
  const signal=new AbortController().signal;
  const first=await solver.solve(question,signal);assert.equal(first.confidence,.6);
  const repair={error:'Answer needs review: missing evidence',previous:{optionIds:first.optionIds,confidence:first.confidence}};
  const recovered=await solver.solve(question,signal,()=>{},repair);
  await solver.solve(question,signal,()=>{},repair);
  assert.equal(loads.length,2);assert.equal(loads[1].refresh,true);
  assert.match(recovered.evidence,/Ottawa is the capital/);
  assert.equal(recovered.confidence,.98);
  assert.ok(!requests[1].messages[1].content.includes(incomplete.text));
});
