const {parentPort,workerData}=require('node:worker_threads');
const path=require('node:path');
(async()=>{
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root=path.dirname(require.resolve('pdfjs-dist/package.json'));
  const resources=name=>path.join(root,name).replaceAll('\\','/')+'/';
  const task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,verbosity:0,standardFontDataUrl:resources('standard_fonts'),wasmUrl:resources('wasm')});
  try{
    const doc=await task.promise;if(doc.numPages>200)throw new Error('Use a PDF with 200 pages or fewer.');
    const pages=[];let chars=0;
    for(let number=1;number<=doc.numPages;number++){
      const page=await doc.getPage(number),content=await page.getTextContent();
      const text=content.items.map(item=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('').replace(/[ \t]+/g,' ').trim();
      chars+=text.length;if(chars>600000)throw new Error('This PDF contains too much text. Import a smaller section.');
      pages.push({number,text});page.cleanup();
    }
    if(!pages.some(page=>page.text.length>20))throw new Error('No readable text was found. Scanned/image-only PDFs need OCR first.');
    parentPort.postMessage({pages});
  }finally{await task.destroy();}
})().catch(error=>parentPort.postMessage({error:error.name==='PasswordException'?'Password-protected PDFs must be unlocked before importing.':error.message==='Invalid PDF structure.'?'This file is not a readable PDF.':error.message}));
