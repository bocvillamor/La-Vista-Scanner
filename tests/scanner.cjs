/* Foreground POST transport and camera-state regressions. No browser opener. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const base={handoff:'a'.repeat(64),endpoint:'https://script.google.com/macros/s/STAGING/exec',requestId:'b'.repeat(36),mode:'scan',direction:'ENTRY',stationName:'Mangyan Gate',expiresAt:Date.now()+1200000};
function browser(params=base,storage=new Map()) {
  const nodes=new Map(),posts=[],timers=new Map(),handlers={};let serial=0,decode;
  function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',classList:{toggle(){}},removeAttribute(k){delete this[k];},play:async()=>{},getContext:()=>({drawImage(){}})});return nodes.get(id);}
  const window={addEventListener:(name,fn)=>handlers[name]=fn};Object.defineProperty(window,'opener',{get(){throw Error('Opener access is forbidden');}});
  const ctx=vm.createContext({console,URLSearchParams,Date,
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
    location:{hash:params?'#'+new URLSearchParams(params):'',pathname:'/scanner/',search:''},history:{replaceState(){}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window,document:{body:{appendChild(){}},addEventListener(){},getElementById:node,createElement(tag){if(tag==='form')return {children:[],appendChild(i){this.children.push(i);},submit(){posts.push({method:this.method,target:this.target,url:this.action,fields:Object.fromEntries(this.children.map(i=>[i.name,i.value]))});},remove(){}};if(tag==='canvas')return {getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='};return {};}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
    Html5Qrcode:class {start(a,b,cb){decode=cb;return Promise.resolve();}stop(){return Promise.resolve();}clear(){}}
  });
  vm.runInContext(source,ctx);ctx.init();return {ctx,posts,storage,timers,node,handlers,state:()=>vm.runInContext('STATE',ctx),decode:t=>decode(t)};
}
(async()=>{
  const b=browser();assert.equal(b.state().phase,'ready');assert.equal(b.node('stationLabel').textContent,'Mangyan Gate');
  b.ctx.startCamera();b.decode('LVQR1:test');await new Promise(setImmediate);
  const post=b.posts[0];assert.equal(post.method,'POST');assert.equal(post.target,'_self');assert.equal(post.url,base.endpoint);assert.equal(post.fields.scanAction,'scan');assert.equal(post.fields.qrPayload,'LVQR1:test');assert.equal(post.fields.requestId,base.requestId);
  assert.equal(post.fields.sessionToken,undefined);assert.equal(post.fields.direction,undefined);assert.equal(post.fields.stationId,undefined);
  for(const fn of [...b.timers.values()])fn();b.ctx.retry();assert.deepEqual(b.posts[1].fields,post.fields);
  const reloaded=browser(null,b.storage);assert.equal(reloaded.state().phase,'validating');reloaded.ctx.retry();assert.deepEqual(reloaded.posts[0].fields,post.fields);
  assert.ok(!/imageInput|scanImageFile|scanFile\(|type="file"|class="divider"/.test(html));
  const photo=browser({...base,mode:'photo'});assert.equal(photo.node('photoPanel').hidden,false);assert.equal(photo.node('takePhotoButton').hidden,false);assert.equal(photo.node('uploadPhotoButton').hidden,true);
  await photo.ctx.startIdCamera();assert.equal(photo.node('takePhotoButton').hidden,true);assert.equal(photo.node('capturePhotoButton').hidden,false);
  photo.node('idVideo').videoWidth=1200;photo.node('idVideo').videoHeight=800;photo.ctx.captureIdPhoto();
  assert.equal(photo.node('capturePhotoButton').hidden,true);assert.equal(photo.node('takePhotoButton').hidden,true);assert.equal(photo.node('retakePhotoButton').hidden,false);assert.equal(photo.node('uploadPhotoButton').hidden,false);
  await photo.ctx.startIdCamera();assert.equal(photo.node('retakePhotoButton').hidden,true);assert.equal(photo.node('uploadPhotoButton').hidden,true);photo.ctx.captureIdPhoto();photo.ctx.uploadPhoto();assert.equal(photo.posts[0].fields.scanAction,'photo');assert.equal(photo.posts[0].fields.photoBase64,'/9j/2Q==');assert.equal(photo.posts[0].fields.scanId,undefined);
  assert.ok(![...photo.storage.values()].join('').includes('/9j/2Q=='));
  const restoredPhoto=browser(null,photo.storage);assert.equal(restoredPhoto.state().phase,'photo');assert.equal(restoredPhoto.state().photo,null);
  for(const optional of [false,true]){
    const state=browser({...base,mode:'photo',photoOptional:optional?'1':'0'});
    assert.equal(state.node('photoTitle').textContent,'Take Photo of Driver’s ID'+(optional?' (Optional)':''));
    assert.equal(state.node('uploadPhotoButton').textContent,optional?'Save optional ID photo':'Save ID photo and complete admission');
    assert.match(state.node('workflowNote').textContent,optional?/does not affect the recorded admission/:/legacy admission incomplete/);
    state.ctx.navigator.mediaDevices.getUserMedia=async()=>{throw Error('Camera blocked');};await state.ctx.startIdCamera();
    assert.match(state.node('message').textContent,optional?/Admission is already recorded.*optional photo/:/ID photo is required/);
    if(optional)assert.ok(!state.node('message').textContent.includes('required'));
    state.state().photo='data:image/jpeg;base64,/9j/2Q==';state.ctx.uploadPhoto();
    assert.equal(state.posts[0].fields.scanAction,'photo');assert.equal(state.posts[0].fields.photoOptional,undefined);
    for(const fn of [...state.timers.values()])fn();if(optional)assert.match(state.node('message').textContent,/Admission is already recorded.*optional photo/);
    const reloaded=browser(null,state.storage);assert.equal(reloaded.state().photoOptional,optional);assert.equal(reloaded.state().photo,null);assert.equal(reloaded.node('photoTitle').textContent,state.node('photoTitle').textContent);
  }
  const bad=browser({...base,endpoint:'https://attacker.invalid/exec'});assert.equal(bad.state().phase,'closed');assert.equal(bad.posts.length,0);
  const expired=browser({...base,expiresAt:1});assert.equal(expired.state().phase,'closed');
  assert.ok(!source.includes('postMessage'));assert.ok(!source.includes('window.opener'));assert.ok(!source.includes('fetch('));
  for(const m of source.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes('id="'+m[1]+'"'),'Missing DOM ID '+m[1]);
  console.log('PASS scanner: no opener, foreground POST, camera-only QR, same-ID timeout and reload retry, optional/legacy photo wording, controls/retake/POST/recovery, no photo persistence, endpoint/expiry and DOM checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
