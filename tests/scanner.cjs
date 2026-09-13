/* Offline protocol/state test, not a substitute for phone camera testing. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const nodes=new Map(),messages=[],timers=new Map();let serial=0,decode;
function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',classList:{toggle(){}},removeAttribute(k){delete this[k];},play:async()=>{},getContext:()=>({drawImage(){}})});return nodes.get(id);}
const opener={postMessage:(data,origin)=>messages.push({data,origin})},origin='https://test-script.googleusercontent.com',launch='a'.repeat(48);
const ctx=vm.createContext({console,URLSearchParams,crypto:crypto.webcrypto,Uint8Array,
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),setInterval:fn=>++serial,clearInterval(){},
  location:{hash:'#'+new URLSearchParams({openerOrigin:origin,launchId:launch}),pathname:'/scanner/',search:''},history:{replaceState(){}},
  window:{opener,addEventListener(){},close(){}},document:{addEventListener(){},getElementById:node,createElement:node},navigator:{mediaDevices:{}},
  Html5Qrcode:class {start(a,b,cb){decode=cb;return Promise.resolve();}stop(){return Promise.resolve();}clear(){}scanFile(){return Promise.resolve('LVQR1:photo-file-qr');}}
});
vm.runInContext(source,ctx);const state=()=>vm.runInContext('STATE',ctx);
const receive=(data,opts={})=>ctx.receive({source:opener,origin,data:{launchId:launch,...data},...opts});
(async()=>{
  ctx.init();assert.equal(messages[0].data.type,'LV_READY');
  receive({type:'LV_INIT',direction:'ENTRY',stationName:'Bagobo Gate'},{origin:'https://attacker.invalid'});assert.equal(state().phase,'connecting');
  receive({type:'LV_INIT',direction:'ENTRY',stationName:'Bagobo Gate'},{source:{}});assert.equal(state().phase,'connecting');
  receive({type:'LV_INIT',direction:'ENTRY',stationName:'Bagobo Gate'});assert.equal(state().phase,'ready');
  ctx.startCamera();decode('LVQR1:test');await new Promise(setImmediate);
  const request=messages.at(-1);assert.equal(request.data.type,'LV_SCAN');assert.equal(request.data.qrText,'LVQR1:test');assert.match(request.data.requestId,/^[a-f0-9]{48}$/);assert.equal(request.origin,origin);
  assert.equal(state().busy,true);for(const fn of [...timers.values()])fn();ctx.retry();assert.equal(messages.at(-1).data.requestId,request.data.requestId);
  receive({type:'LV_RESPONSE',response:{result:'success',code:'EVENT_PHOTO_REQUIRED',scanId:'SCN1',photoRequired:true}});
  assert.equal(state().phase,'photo');assert.equal(node('nextButton').hidden,true);assert.equal(node('uploadPhotoButton').disabled,true);
  const count=messages.length;ctx.submitQr('LVQR1:another');assert.equal(messages.length,count);
  state().photo='data:image/jpeg;base64,/9j/2Q==';ctx.uploadPhoto();assert.equal(messages.at(-1).data.type,'LV_PHOTO');assert.equal(messages.at(-1).data.scanId,'SCN1');
  receive({type:'LV_RESPONSE',response:{result:'error',code:'PHOTO_RETRY',scanId:'SCN1',photoRequired:true}});assert.ok(state().photo);assert.equal(state().phase,'photo');
  ctx.uploadPhoto();receive({type:'LV_RESPONSE',response:{result:'success',code:'VALID_EVENT_ENTRY',scanId:'SCN1',photoRequired:false,repeatUntil:'2000-01-01T00:00:00Z'}});
  assert.equal(state().phase,'complete');assert.equal(state().photo,null);assert.equal(node('photoPanel').hidden,true);
  receive({type:'LV_NEXT_READY'});await ctx.scanImageFile({target:{files:[{}]}});assert.equal(messages.at(-1).data.type,'LV_SCAN');assert.equal(messages.at(-1).data.qrText,'LVQR1:photo-file-qr');
  receive({type:'LV_CANCEL'});const before=messages.length;ctx.submitQr('LVQR1:late');assert.equal(messages.length,before);assert.equal(state().phase,'closed');
  assert.ok(!JSON.stringify(messages).includes('sessionToken'));
  for(const match of source.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes('id="'+match[1]+'"'),'Missing DOM ID '+match[1]);
  console.log('PASS scanner: origin/source binding, QR camera/file submission, stable retry, mandatory photo, photo retry, next guest, cancel and DOM bindings');
})().catch(e=>{console.error(e);process.exitCode=1;});
