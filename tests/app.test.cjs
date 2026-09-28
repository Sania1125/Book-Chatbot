const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

function setup() {
  const elements = new Map();
  const element = () => ({value:'',style:{},textContent:'',innerHTML:'',disabled:false,addEventListener(){},focus(){},appendChild(){},remove(){}});
  const sources = {};
  let savedChats;
  const context = vm.createContext({
    crypto:{randomUUID},setTimeout:()=>0,
    document:{getElementById(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id);},createElement:element,body:{appendChild(){}}},
    Storage:{init:async()=>{},getFolders:()=>[],getChats:()=>({}),getApiKey:()=>'',saveFolders(){},saveChats(chats){savedChats=JSON.parse(JSON.stringify(chats));},getSource:id=>sources[id]||null,saveSource:async(id,source)=>{sources[id]=source;}},
    FileHandler:{extractDocument:async()=>({pages:[{number:null,text:'A book fact.'}],warnings:[]})},
    Retrieval:{index(){}},API:{sendMessage:async()=> 'Verified answer'}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  const app=vm.runInContext('App',context);
  app.render=()=>{}; app.renderChatArea=()=>{}; app.showTyping=()=>{}; app.removeTyping=()=>{};
  app.showToast=message=>{app.toast=message;};
  app.renderMessages=messages=>{app.visible=messages;};
  return {app,context,elements,sources,get savedChats(){return savedChats;}};
}

test('first visit creates a selected chat that can receive uploads',async()=>{
  const {app}=setup(); await app.init();
  assert.ok(app.state.activeFolderId); assert.ok(app.getActiveChat());
});
test('upload completion stays attached to its original folder after switching',async()=>{
  const {app,context,sources}=setup(); await app.init();
  const original=app.state.activeFolderId;
  let finish; context.FileHandler.extractDocument=()=>new Promise(resolve=>{finish=resolve;});
  const uploading=app.handleFileUpload({name:'Original.txt'});
  const other=app.createFolder('Other'); app.addChat(other.id);
  finish({pages:[{number:null,text:'Original book.'}],warnings:[]}); await uploading;
  assert.equal(sources[original].name,'Original.txt'); assert.equal(sources[other.id],undefined);
  assert.equal(app.state.activeFolderId,other.id); assert.equal(app.state.isUploading,false);
});
test('replacement starts a new conversation and blocks old conversation reuse',async()=>{
  const {app,elements}=setup(); await app.init();
  await app.handleFileUpload({name:'First.txt'});
  const old=app.getActiveChat(); old.messages.push({role:'user',content:'old question'});
  await app.handleFileUpload({name:'Second.txt'});
  assert.notEqual(app.getActiveChat().id,old.id);
  app.selectChat(app.state.activeFolderId,old.id);
  elements.get('msgInput').value='new question';
  elements.get('apiKeyInput').value='test';
  await app.sendMessage();
  assert.match(app.toast,/earlier document/); assert.equal(old.messages.length,1);
});
test('pending response saves into original chat without replacing the selected chat view',async()=>{
  const state=setup(); const {app,context,elements}=state; await app.init();
  await app.handleFileUpload({name:'First.txt'});
  const original=app.getActiveChat();
  elements.get('apiKeyInput').value='test'; elements.get('msgInput').value='Question';
  let finish; context.API.sendMessage=()=>new Promise(resolve=>{finish=resolve;});
  const sending=app.sendMessage();
  app.addChat(app.state.activeFolderId); const selected=app.getActiveChat(); app.visible=selected.messages;
  finish('Original book answer'); await sending;
  assert.equal(original.messages.at(-1).content,'Original book answer');
  assert.equal(app.visible,selected.messages); assert.equal(app.state.isLoading,false);
  assert.ok(Object.values(state.savedChats).flat().find(c=>c.id===original.id).messages.some(m=>m.content==='Original book answer'));
});
test('failed requests release the loading state without storing error messages as answers',async()=>{
  const {app,context,elements}=setup(); await app.init(); await app.handleFileUpload({name:'Book.txt'});
  elements.get('apiKeyInput').value='test'; elements.get('msgInput').value='Question';
  context.API.sendMessage=async()=>{throw new Error('Rate limited');};
  await app.sendMessage();
  assert.equal(app.state.isLoading,false); assert.equal(app.getActiveChat().messages.length,1);
  assert.match(app.toast,/Rate limited/);
});
