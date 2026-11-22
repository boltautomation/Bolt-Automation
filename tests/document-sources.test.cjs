const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadDocumentSources}=require('../app/document-sources.cjs');
const signal=()=>new AbortController().signal;
test('direct PDF research reads the hinted slide and caches extracted pages across questions',async()=>{
  let downloads=0,extracts=0;const cache=new Map(),page={url:'https://example.org/fibres.pdf'};
  const options={cache,downloader:async url=>{downloads++;return{url,content:Buffer.from('%PDF-fixture')};},extractor:async()=>{extracts++;return Array.from({length:40},(_,i)=>({number:i+1,text:i===22?'Animal fibres are made from proteins.':'Other material on this slide.'}));}};
  const result=await loadDocumentSources(page,{prompt:'What are wool and silk? Hint: skip to slide 23.'},signal(),options);
  assert.equal(result.length,1);assert.match(result[0].url,/#page=23$/);assert.match(result[0].text,/\[PDF page 23\]\nAnimal fibres are made from proteins/);assert.ok(!result[0].text.includes('[PDF page 1]'));
  await loadDocumentSources(page,{prompt:'What about slide 24?'},signal(),options);assert.equal(downloads,1);assert.equal(extracts,1);
});
test('PDF discovery ranks relevant linked documents, blocks private addresses and caps downloads',async()=>{
  const calls=[],page={url:'https://example.org/topic',media:{documents:[{url:'http://127.0.0.1/private.pdf',title:'Animal fibres'},{url:'https://example.org/terms.pdf',title:'Terms'},{url:'https://example.org/fibres.pdf',title:'Animal fibres'}]}};
  const result=await loadDocumentSources(page,{prompt:'What are animal fibres made of?'},signal(),{downloader:async url=>{calls.push(url);return{url,content:Buffer.from('%PDF-')};},extractor:async()=>[{number:1,text:'Animal fibres such as wool and silk are made of proteins.'}]});
  assert.equal(result.length,1);assert.deepEqual(calls,['https://example.org/fibres.pdf']);
});
test('unreadable PDFs never become evidence and Stop cancels PDF extraction',async()=>{
  const page={url:'https://example.org/document.pdf'};
  assert.deepEqual(await loadDocumentSources(page,{},signal(),{downloader:async()=>{throw new Error('Unavailable');}}),[]);
  const controller=new AbortController();await assert.rejects(loadDocumentSources(page,{},controller.signal,{downloader:async url=>({url,content:Buffer.from('%PDF-')}),extractor:async()=>{controller.abort();controller.signal.throwIfAborted();}}),{name:'AbortError'});
});
