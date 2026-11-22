const {test}=require('node:test'),assert=require('node:assert/strict');
const {jsonField}=require('../app/public-data.cjs');
const {captionText,youtubeId,loadVideoSources}=require('../app/video-sources.cjs');
const {sourceIssue}=require('../app/sources.cjs');
const {loadDocumentSources}=require('../app/document-sources.cjs');
const {loadImageSources}=require('../app/image-sources.cjs');
const {searchQuery}=require('../app/web-sources.cjs');
const signal=()=>new AbortController().signal;
test('published JSON metadata is decoded without executing page scripts or truncating nested arrays',()=>{
 const value='before; window.data={"captionTracks":[{"baseUrl":"https://example.org/a?x=1\\u0026b=2","name":{"runs":[{"text":"English"}]},"note":"] \\\" quoted"}]}; throw new Error("must not execute")';
 const tracks=jsonField(value,'captionTracks');assert.equal(tracks.length,1);assert.equal(tracks[0].baseUrl,'https://example.org/a?x=1&b=2');assert.equal(jsonField('window.x={"captionTracks":[broken};','captionTracks'),null);
});
test('YouTube links, double-slash embeds and CMS wrappers resolve to the original video',()=>{
 for(const url of ['https://www.youtube.com/watch?v=AbCdEf12345&t=5s','https://www.youtube.com/embed//AbCdEf12345','https://youtu.be/AbCdEf12345','https://example.org/media/oembed?url='+encodeURIComponent('https://www.youtube.com/watch?v=AbCdEf12345')])assert.equal(youtubeId(url),'AbCdEf12345');
 assert.equal(youtubeId('http://127.0.0.1/private'),null);
});
test('video JSON and XML captions preserve actual words; rendered transcripts take priority over recommendations',async()=>{
 assert.equal(captionText('{"events":[{"segs":[{"utf8":"Animals are "},{"utf8":"affected."}]}]}'),'Animals are affected.');
 assert.equal(captionText('<transcript><text start="1">Fresh water &amp; healthy fish.</text></transcript>'),'Fresh water & healthy fish.');
 const sources=await loadVideoSources({url:'https://www.youtube.com/watch?v=AbCdEf12345',title:'Example',media:{transcripts:[{text:'The published video transcript contains the specific supporting evidence.'}]}},signal(),{downloader:async()=>assert.fail('Rendered transcript must not trigger another download')});assert.equal(sources.length,1);assert.equal(sources[0].kind,'transcript');
});
test('blocked and moved pages cannot be treated as source evidence',()=>{
 for(const title of ['Access denied | University','Just a moment...','Error 404 - Page Not Found','502 Bad Gateway'])assert.ok(sourceIssue({title,text:'Unusable page'}));
 assert.equal(sourceIssue({title:'Hearing protection',text:'The article describes hearing-loss prevention.'}),null);
});
test('extensionless PDFs and wrapped viewers resolve to the actual document',async()=>{
 const calls=[],downloader=async url=>{calls.push(url);return{url,content:Buffer.from('%PDF-fixture')};},extractor=async()=>[{number:2,text:'Artificial intelligence can improve outcomes and healthcare practices.'}];
 await loadDocumentSources({url:'https://example.edu/media/123/download?inline=',document:true},{prompt:'Read page 2'},signal(),{downloader,extractor});
 await loadDocumentSources({url:'https://docs.google.com/viewerng/viewer?url='+encodeURIComponent('https://example.edu/paper.pdf')},{prompt:'Read page 2'},signal(),{downloader,extractor});
 assert.deepEqual(calls,['https://example.edu/media/123/download?inline=','https://example.edu/paper.pdf']);
});
test('OCR prioritizes the requested comic page and neighboring pages, caches text and never reads private images',async()=>{
 const calls=[],cache=new Map(),page={url:'https://example.org/comic',media:{images:[{url:'https://example.org/1.jpg',page:1},{url:'https://example.org/12.jpg',page:12},{url:'https://example.org/13.jpg',page:13},{url:'http://127.0.0.1/14.jpg',page:14}]}};
 const options={cache,maxSources:8,downloader:async url=>{calls.push(url);return{content:Buffer.from('fixture')};},recognizer:async()=> 'Local image text gives the relevant information from the comic.'};
 const sources=await loadImageSources(page,{prompt:'See the images on page 13.'},signal(),options);assert.equal(sources[0].url,'https://example.org/13.jpg');assert.equal(sources.length,2);assert.ok(!calls.some(u=>u.includes('/1.jpg')));
 await loadImageSources(page,{prompt:'See page 13'},signal(),options);assert.equal(calls.length,2);
});
test('outside search keeps institution and course context when the final question is generic',()=>{
 const query=searchQuery({prompt:'How many Award levels are available to youth in Canada?',researchContext:{course:'Introduction to The Duke of Edinburgh’s International Award - Canada',activity:'How Much Time Will it Take?',sourceTitle:'Just a moment...'}});
 assert.match(query,/Duke of Edinburgh/);assert.match(query,/How many Award levels/);
});
