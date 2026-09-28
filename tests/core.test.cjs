const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ AbortController, setTimeout, clearTimeout });
for (const file of ['retrieval.js', 'api.js', 'fileHandler.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const R = vm.runInContext('Retrieval', context);
const API = vm.runInContext('API', context);
const FH = vm.runInContext('FileHandler', context);
const book = { name: 'Test book', pages: Array.from({length: 90}, (_, i) => ({number:i+1, text: i === 89 ? 'The launch password is violet-lantern. The expedition leaves on October 12.' : ('The garden contains green plants and flowers. ').repeat(30)})) };

test('searches beyond the old 48,000 character cutoff with page provenance', () => {
  assert.ok(book.pages.map(p => p.text).join('').length > 48000);
  const result = R.search(book, 'What is the launch password?');
  assert.ok(result.chunks.some(c => c.page === 90 && c.text.includes('violet-lantern')));
  assert.ok(result.chunks.reduce((n,c) => n+c.text.length,0) <= 14000);
});
test('no matches produce no irrelevant fallback passages', () => assert.equal(R.search(book, 'quantum neutrinos').chunks.length, 0));
test('overlapping chunks preserve all normalized document characters', () => {
  const text = Array.from({length:6000},(_,i)=>'word'+i).join(' ');
  const chunks = R.index({text}).chunks;
  let rebuilt = chunks[0].text;
  for (const c of chunks.slice(1)) rebuilt += c.text.slice(240);
  assert.equal(rebuilt,text);
});
test('legacy truncated books require re-upload', () => assert.throws(()=>R.index({text:'old [Document trimmed due to length...]'}),/Upload it again/));
test('Unicode retrieval and numeric details are searchable', () => {
  const source = {pages:[...book.pages,{number:91,text:'کتاب کا نام روشنی ہے۔ Identifier ZX981 has a limit of 725.'}]};
  assert.ok(R.search(source,'روشنی').chunks.some(c=>c.page===91));
  assert.ok(R.search(source,'ZX981 725').chunks.some(c=>c.page===91));
});
test('accepts real quotations, rejects fabricated quotes and citations', () => {
  const chunks = [{id:'S1',page:90,text:'The launch password is violet-lantern.'}];
  const result = {supported:true,claims:[{answer:'The password is violet-lantern.',sourceId:'S1',quote:chunks[0].text}]};
  assert.match(API.validateAnswer(result,chunks,'Book'),/PDF page 90/);
  result.claims[0].quote = 'The launch password is orange.';
  assert.throws(()=>API.validateAnswer(result,chunks,'Book'),/could not be verified/);
  result.claims[0].sourceId='S999';
  assert.throws(()=>API.validateAnswer(result,chunks,'Book'),/invalid source/);
  assert.equal(API.validateAnswer({supported:false},chunks,'Book'),API.notFound);
});
test('missing document and unmatched search never call the model', async () => {
  context.fetch = () => { throw new Error('Unexpected API call'); };
  await assert.rejects(API.sendMessage([{role:'user',content:'Hello'}],null,'test'),/Upload a document/);
  assert.equal(await API.sendMessage([{role:'user',content:'quantum neutrinos'}],book,'test'),API.notFound);
});
test('API sends bounded excerpts and no previous assistant assertions', async () => {
  context.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.temperature,0);
    assert.equal(body.messages.length,2);
    assert.ok(!options.body.includes('WRONG-OLD-ANSWER'));
    const data = JSON.parse(body.messages[1].content);
    const excerpt = data.excerpts.find(c=>c.page===90);
    return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({supported:true,claims:[{answer:'The password is violet-lantern.',sourceId:excerpt.id,quote:'The launch password is violet-lantern.'}]})}}]})};
  };
  const answer = await API.sendMessage([{role:'assistant',content:'WRONG-OLD-ANSWER'},{role:'user',content:'What is the launch password?'}],book,'test');
  assert.match(answer,/PDF page 90/);
});
test('model rate limits and incomplete output are reported as errors', async()=>{
  context.fetch=async()=>({ok:false,status:429});
  await assert.rejects(API.sendMessage([{role:'user',content:'password'}],book,'test'),/usage limit/);
  context.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})});
  await assert.rejects(API.sendMessage([{role:'user',content:'password'}],book,'test'),/incomplete/);
});
test('text extraction retains the end of a long book and rejects empty/unsupported files', async()=>{
  const text='a'.repeat(60000)+' THE END';
  const result=await FH.extractDocument({name:'book.txt',size:text.length,text:async()=>text});
  assert.ok(result.pages[0].text.endsWith('THE END'));
  await assert.rejects(FH.extractDocument({name:'empty.txt',size:0,text:async()=>''}),/No readable text/);
  await assert.rejects(FH.extractDocument({name:'book.exe',size:5}),/Supported formats/);
});
test('PDF extraction preserves page numbers and reports scanned pages', async()=>{
  let destroyed=false;
  context.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async n=>({getTextContent:async()=>({items:n===1?[]:[{str:'Final page fact.',hasEOL:true}]}),cleanup(){}}),destroy:async()=>{destroyed=true;}})})};
  const result=await FH.extractDocument({name:'book.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(0)});
  assert.equal(result.pages[1].number,2);
  assert.match(result.pages[1].text,/Final page/);
  assert.match(result.warnings[0],/1 PDF page/);
  assert.ok(destroyed);
});
