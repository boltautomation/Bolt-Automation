const {deflateSync}=require('node:zlib');
function testPdf(pages){
  const objects=[];const add=value=>{objects.push(Buffer.isBuffer(value)?value:Buffer.from(value));return objects.length;};
  add('<< /Type /Catalog /Pages 2 0 R >>');add('');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds=[];
  for(const text of pages){const pageId=objects.length+1,contentId=pageId+1;pageIds.push(pageId);add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);const escaped=text.replace(/([\\()])/g,'\\$1'),stream=deflateSync(Buffer.from(`BT /F1 12 Tf 40 740 Td (${escaped}) Tj ET`));add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),stream,Buffer.from('\nendstream')]));}
  objects[1]=Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`);
  const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
  objects.forEach((object,index)=>{offsets.push(length);const part=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),object,Buffer.from('\nendobj\n')]);parts.push(part);length+=part.length;});
  parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));return Buffer.concat(parts);
}
module.exports={testPdf};
