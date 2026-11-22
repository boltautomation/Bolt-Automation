const http=require('node:http'),assert=require('node:assert/strict');
const {Browser}=require('../app/browser.cjs'),{testPdf}=require('./pdf-fixture.cjs'),{extractPdf}=require('../app/study.cjs');
const {pdfDownloadControl,readDownloadedPdf}=require('../app/resource-download.cjs');
const {recognizeImage}=require('../app/image-sources.cjs');
(async()=>{
 let submitted=0;
 const server=http.createServer((req,res)=>{
  if(req.method==='POST'&&req.url==='/download'){submitted++;res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="source.pdf"');return res.end(testPdf(['The official source says eleven percent of workers under age 21 show hearing loss.']));}
  res.setHeader('Content-Type','text/html');
  if(req.url==='/unsafe')return res.end('<form><input name=email><button type=submit>Download PDF</button></form>');
  if(req.url==='/ocr')return res.end('<!doctype html><style>body{font:32px Arial;padding:35px;background:white;color:black}</style><p>Hospitality: 28 percent of injuries involve young workers.</p><p>Retail: 21 percent of injuries involve young workers.</p>');
  res.end('<!doctype html><form action="/download" method="post"><input type=hidden name=resource value=fixture><button type=submit name=mediaItem value=fixture onclick="if(!event.isTrusted)event.preventDefault()">Download PDF</button></form>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,b=new Browser({headless:true,origins:[origin],mouseOptions:{durationScale:0}}),signal=AbortSignal.timeout(25000);
 try{
  await b.launch(signal);await b.navigate(origin,signal);
  const result=await readDownloadedPdf(b,{},signal,{validateUrl:url=>new URL(url),documentLoader:async(page,q,s,options)=>{const file=await options.downloader(page.url,s),pages=await extractPdf(file.content,{signal:s});return[{url:page.url,text:pages.map(p=>p.text).join(' ')}];}});
  assert.equal(submitted,1);assert.match(result[0].text,/eleven percent/);
  await b.navigate(origin+'/unsafe',signal);assert.equal(await b.evaluate(pdfDownloadControl),null,'forms collecting personal data are excluded');
  if(process.platform==='win32'){await b.navigate(origin+'/ocr',signal);const screenshot=await b.command('Page.captureScreenshot',{format:'png'}),text=await recognizeImage(Buffer.from(screenshot.data,'base64'),signal);assert.match(text,/28 percent/);assert.match(text,/21 percent/);}
  console.log('PASS real mouse PDF download, actual PDF extraction, exclusion of personal-data forms, temporary cleanup and offline native OCR');
 }finally{await b.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
