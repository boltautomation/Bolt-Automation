const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {StudyService}=require('../app/study.cjs');
const {testPdf}=require('./pdf-fixture.cjs');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bolt-study-model-'));try{const study=new StudyService({file:path.join(dir,'study.json')});const doc=(await study.importPdf(testPdf(['Maple trees grow in many regions and are commonly found in parks.','Ottawa is the capital of Canada. Toronto is the capital of Ontario.']),'Controlled notes.pdf')).document;const result=await study.ask({question:'What is the capital of Canada?',docIds:[doc.id],model:'qwen3:4b'});assert.equal(result.supported,true);assert.match(result.answer,/Ottawa/i);assert.ok(result.citations.length);assert.equal(result.passages[0].page,2);assert.match(result.method,/local AI/);assert.equal((await study.state()).answers.length,0);console.log('PASS real local Ollama reranks extracted PDF passages, answers with verified quotes and page references, and does not auto-save the answer');}finally{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('bolt-study-model-'));await fs.rm(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
