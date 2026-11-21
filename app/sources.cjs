const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
function publicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && [0, 168].includes(b)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && [18, 19].includes(b));
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/.test(value) && !value.startsWith('2001:db8:');
  }
  return false;
}
function publicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new Error('Unsupported research URL.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && !publicAddress(hostname)) throw new Error('Research links cannot access private network addresses.');
  if (!hostname.includes('.') && !net.isIP(hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)) throw new Error('Research links must point to public websites.');
  return url;
}
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) return callback(new Error('Private research address blocked.'));
    const matching = options.family ? addresses.filter(item => item.family === options.family) : addresses;
    if (!matching.length) return callback(new Error('No public research address available.'));
    if (options.all) callback(null, matching); else callback(null, matching[0].address, matching[0].family);
  });
}
function download(value, signal, hops = 0) {
  signal.throwIfAborted();
  const url = publicUrl(value);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      lookup: publicLookup, agent: false, signal: AbortSignal.any([signal, AbortSignal.timeout(18000)]),
      headers: { 'User-Agent': 'ChatterHighLocalApp/2.0', Accept: 'text/html,text/plain,application/xhtml+xml', 'Accept-Encoding': 'identity' }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (hops >= 4) return reject(new Error('Too many research redirects.'));
        try { resolve(download(new URL(response.headers.location, url).href, signal, hops + 1)); } catch (error) { reject(error); } return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Research page could not be read.')); return; }
      const type = response.headers['content-type'] || '';
      if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) { response.resume(); reject(new Error('This research resource is not a text webpage.')); return; }
      let content = ''; let bytes = 0;
      response.setEncoding('utf8');
      response.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 1500000) request.destroy(new Error('Research page is too large.')); else content += chunk; });
      response.on('end', () => resolve({ url: url.href, content, type })); response.on('error', reject);
    });
    request.on('error', reject);
  });
}
function decode(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || all;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
}
const normalize = text => String(text).replace(/\s+/g, ' ').trim();
function pageText(html) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]*>/g, '');
  const stripped = html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
  return { title: normalize(title), text: normalize(decode(stripped)) };
}
function excerpts(text, question, limit = 14000) {
  if (text.length <= limit) return text;
  const stop=new Set('what which that this with from have they their would could should into about your some more when where'.split(' '));
  const terms=value=>[...new Set(String(value||'').toLowerCase().match(/[a-z\d]{3,}/g)||[])].filter(word=>!stop.has(word));
  const promptWords=new Set(terms(question.prompt||question.text)),words=new Set([...promptWords,...terms((question.options||[]).map(option=>option.text).join(' '))]);
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 1000) {
    const value = text.slice(Math.max(0, offset - 200), offset + 1200), lower = value.toLowerCase();
    chunks.push({offset,value,lower});
  }
  const frequency=new Map([...words].map(word=>[word,chunks.filter(chunk=>chunk.lower.includes(word)).length]));
  for(const chunk of chunks)chunk.score=[...words].reduce((sum,word)=>sum+(chunk.lower.includes(word)?(promptWords.has(word)?2:1)*Math.log(1+chunks.length/(frequency.get(word)||1)):0),0);
  const selected=chunks.sort((a,b)=>b.score-a.score||a.offset-b.offset).slice(0,Math.min(8,Math.max(1,Math.floor(limit/1400)))).sort((a,b)=>a.offset-b.offset),ranges=[];
  for(const chunk of selected){const start=Math.max(0,chunk.offset-200),end=Math.min(text.length,chunk.offset+1200),last=ranges.at(-1);if(last&&start<=last.end)last.end=Math.max(last.end,end);else ranges.push({start,end});}
  return ranges.map(({start,end})=>text.slice(start,end)).join('\n[…]\n').slice(0,limit);
}
async function loadSources(question, signal, { downloader = download } = {}) {
  const sources = [];
  const urls = [...new Set((question.links || []).map(link => link.url))].slice(0, 5);
  for (const url of urls) {
    signal.throwIfAborted();
    try {
      const page = await downloader(url, signal); const parsed = /text\/plain/i.test(page.type) ? { title: '', text: normalize(page.content) } : pageText(page.content);
      if (parsed.text.length < 60) continue;
      if (/sign in|log in/i.test(parsed.title) && /password/i.test(parsed.text)) continue;
      sources.push({ id: `s${sources.length}`, url: page.url, title: parsed.title || new URL(page.url).hostname, text: excerpts(parsed.text, question, 12000) });
      if (sources.length === 3) break;
    } catch (error) { signal.throwIfAborted(); }
  }
  return sources;
}
module.exports = { publicAddress, publicUrl, publicLookup, download, pageText, excerpts, loadSources, normalize };
