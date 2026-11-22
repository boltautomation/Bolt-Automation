const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSourceAlternatives,sourceIdentity}=require('../app/source-alternatives.cjs'),{sourceIssue}=require('../app/sources.cjs'),{searchQuery,quickWebSources}=require('../app/web-sources.cjs');
const signal=()=>new AbortController().signal;
test('archive and viewer URLs identify their public document; private and invalid targets are rejected',()=>{
 assert.equal(sourceIdentity('https://example.org/archive?url='+encodeURIComponent('https://publisher.org/report.pdf#page=2')),'https://publisher.org/report.pdf');
 assert.equal(sourceIdentity('https://example.org/viewer?url=http%3A%2F%2F127.0.0.1%2Fprivate'),null);assert.equal(sourceIdentity('broken'),null);
 assert.ok(sourceIssue({title:'Information archivée dans le Web | Information Archived on the Web',text:'Continue to publication'}));
});
test('a registered alternative is read live and cited under its actual URL, never as the unavailable publisher',async()=>{
 const original='https://publisher.org/report.pdf',url='https://training.org/material',q={prompt:'Which animals can fly?',researchContext:{sourceUrl:'https://publisher.org/archive?url='+encodeURIComponent(original)}},rules=[{originals:[original],url,references:'https://publisher.org/report.html'}];
 const downloader=async value=>{assert.equal(value,url);return{url,content:'<title>Training material</title><p>The published learning material describes flight, feathers, and the many birds capable of flight. It explains how wings help these animals move through the air.</p><a href="https://publisher.org/report.html">Original report</a>'};};
 const sources=await loadSourceAlternatives(q,signal(),{rules,downloader});assert.equal(sources.length,1);assert.equal(sources[0].url,url);assert.equal(sources[0].kind,'publication-alternative');assert.ok(!sources[0].optionIds);assert.match(sources[0].text,/wings/);
 assert.deepEqual(await loadSourceAlternatives({...q,researchContext:{sourceUrl:'https://other.org/report.pdf'}},signal(),{rules,downloader:()=>assert.fail('Unrelated publication')}),[]);
 assert.deepEqual(await loadSourceAlternatives(q,signal(),{rules,downloader:async()=>({url,content:'<title>Unrelated page</title>'})}),[],'A changed page that no longer references the publication is not accepted');
});
test('search puts the actual question first and excludes archive boilerplate',()=>{
 const query=searchQuery({prompt:'Background about birds. Which animals can fly? (Hint: Read the publication)',researchContext:{course:'Introduction to Wildlife',sourceTitle:'Information Archived on the Web'}});assert.ok(query.startsWith('Which animals can fly?'));assert.ok(!/Archived|Hint|\($/.test(query));
});
test('outside research recovers a known broken publication from a live cited reference inside its normal deadline',async()=>{
 const q={prompt:'Which population has the fastest-growing hospital care from opioid overdoses?',researchContext:{sourceUrl:'https://publications.gc.ca/site/archivee-archived.html?url='+encodeURIComponent('https://publications.gc.ca/collections/collection_2019/sc-hc/H14-298-2018-eng.pdf')}};
 const sources=await quickWebSources(q,signal(),{downloader:async url=>({url,content:url.includes('actfoundation.ca')?'<title>Training source</title><p>This fixture describes hospital care and opioid overdoses in a learning resource. This sentence makes the factual text long enough to read as an article instead of a bare navigation link.</p><a href="https://www.canada.ca/en/health-canada/services/publications/healthy-living/canada-opioid-crisis-fact-sheet.html">Reference</a>':url.includes('w/api.php')?'{}':'<html></html>'})});assert.equal(sources.length,1);assert.equal(new URL(sources[0].url).hostname,'actfoundation.ca');
});
