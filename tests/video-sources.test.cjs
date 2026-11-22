const {test}=require('node:test'),assert=require('node:assert/strict');
const {captionText,loadVideoSources}=require('../app/video-sources.cjs');
test('caption extraction removes cue timing and markup while preserving answer wording',()=>{
  const text='WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Speaker>Think big!</v>\n\n2\n00:00:04.000 --> 00:00:06.000\nThis industry is ripe for change.\n';
  assert.equal(captionText(text),'Think big!\nThis industry is ripe for change.');
  assert.equal(captionText('<tt><p begin="1s">Young people bring <span>fresh ideas</span>.</p></tt>'),'Young people bring fresh ideas.');
});
test('published video metadata selects English captions, ignores thumbnails and caches transcripts',async()=>{
  const calls=[],cache=new Map(),page={url:'https://example.org/career',title:'Career',media:{embeds:[{url:'https://cdn.jwplayer.com/previews/AbCd1234-player01'}]}};
  const downloader=async url=>{calls.push(url);return{content:url.includes('/v2/media/')?JSON.stringify({playlist:[{title:'Career interview',tracks:[{kind:'captions',label:'French',file:'https://cdn.jwplayer.com/tracks/fr.srt'},{kind:'thumbnails',file:'https://cdn.jwplayer.com/thumbs.vtt'},{kind:'captions',label:'English',file:'https://cdn.jwplayer.com/tracks/en.srt'}]}]}):'1\n00:00:01,000 --> 00:00:04,000\nYoung people bring a fresh perspective and new ideas.\n'};};
  const sources=await loadVideoSources(page,new AbortController().signal,{downloader,cache});
  assert.equal(sources.length,1);assert.match(sources[0].title,/English captions/);assert.match(sources[0].text,/fresh perspective/);
  await loadVideoSources(page,new AbortController().signal,{downloader,cache});
  assert.equal(calls.filter(url=>url.endsWith('/en.srt')).length,1);assert.ok(!calls.some(url=>/thumbs|fr\.srt/.test(url)));
});
test('native subtitle tracks work independently of player vendor and private URLs are excluded',async()=>{
  const calls=[],page={url:'https://example.org/video',media:{tracks:[{kind:'captions',src:'http://127.0.0.1/private'},{kind:'subtitles',label:'English',src:'/captions.vtt'}]}};
  const sources=await loadVideoSources(page,new AbortController().signal,{downloader:async url=>{calls.push(url);return{content:'WEBVTT\n\n00:01.000 --> 00:03.000\nThis is a complete published source caption.'};}});
  assert.equal(sources.length,1);assert.deepEqual(calls,['https://example.org/captions.vtt']);
});
test('caption loading respects Stop',async()=>{const c=new AbortController();c.abort();await assert.rejects(loadVideoSources({url:'https://example.org/'},c.signal),{name:'AbortError'});});
