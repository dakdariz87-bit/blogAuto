const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {approveDraft,isReviewed,assertReviewed}=require('../src/lib/reviewGate');
const settings=require('../src/lib/settings');const {launchSpec}=require('../src/lib/chromeLauncher');
const {articlePlan}=require('../extension/article-plan');const {runWriter}=require('../extension/writer');
test('기본 자동발행을 끄고 이미지 개수 0~4를 보존한다',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-settings-'));
 try{const result=settings.readSettings(root);assert.equal(result.publishAfterGenerate,false);assert.equal(result.publishVisibility,'draft');assert.equal(result.maxBodyImages,2);
 settings.writeSettings(root,{publishAfterGenerate:true,maxBodyImages:1});assert.equal(settings.readSettings(root).publishAfterGenerate,false);assert.equal(settings.readSettings(root).maxBodyImages,1);
 assert.equal(settings.normalizeMaxBodyImages(999),4);assert.equal(settings.normalizeMaxBodyImages(0),0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('기존 크롬 프로필을 사용하고 명시한 별도 프로필 옵션은 존중한다',()=>{
 const base={id:'test',blogId:'dakdariz'};
 assert.equal(launchSpec('/runtime',base,'win32','chrome.exe').dataDir,'');
 assert.equal(launchSpec('/runtime',base,'win32','chrome.exe').args.some(arg=>arg.startsWith('--user-data-dir')),false);
 assert.ok(launchSpec('/runtime',{...base,useDefaultChromeProfile:false},'win32','chrome.exe').dataDir);
});
test('본문·대상·실제 이미지 파일이 달라지면 승인을 무효화한다',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-review-')),file=path.join(root,'image.png');fs.writeFileSync(file,'first');
 try{
 const draft={status:'pending_naver_publish',accountId:'test',blogId:'dakdariz',category:'운동',title:'제목',article:'첫 줄\n마지막 문단',titleImagePath:file,publishVisibility:'draft',publishScheduleMode:'now'};
 assert.throws(()=>assertReviewed(draft),/승인/);
 assert.throws(()=>approveDraft(draft,{blogId:'different'}),/대상/);
 const approved=approveDraft(draft,{publishVisibility:'public'});assert.equal(isReviewed(approved),true);
 assert.equal(isReviewed({...approved,article:'일부만 남음'}),false);assert.equal(isReviewed({...approved,blogId:'other'}),false);
 fs.writeFileSync(file,'changed');assert.equal(isReviewed(approved),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('원본 마지막 줄을 유지하며 섹션 인용구 다음에 사진을 배치한다',()=>{
 const body='도입\n[SECTION - 소제목]\n설명\n[IMAGE INSERT - 1]\n마지막 문단';const plan=articlePlan(body);
 assert.deepEqual(plan.map(b=>b.type),['paragraph','section','image','paragraph','paragraph']);assert.equal(plan.at(-1).text,'마지막 문단');
});
test('입력 중 일부만 반영되면 재입력하지 않고 다음 단계를 중지한다',async()=>{
 let actual={title:'',blocks:[]},calls=0;
 await assert.rejects(runWriter({steps:[{type:'title',text:'정확한 제목'},{type:'paragraph',text:'전체 본문'}],read:async()=>structuredClone(actual),apply:async()=>{calls++;actual.title='정확한';},save:async()=>{},checkCancelled:async()=>{}}),/입력 결과/);
 assert.equal(calls,1);assert.equal(actual.title,'정확한');
});
test('전체 본문 끝까지 검증하고 입력 체크포인트를 남긴다',async()=>{
 let actual={title:'',blocks:[]};const checkpoints=[];
 const body=Array.from({length:1500},(_,i)=>'문장 '+i).join('\n')+'\n끝까지 포함';
 const steps=[{type:'title',text:'제목'},{type:'paragraph',text:body}];
 const result=await runWriter({steps,read:async()=>structuredClone(actual),apply:async step=>{if(step.type==='title')actual.title=step.text;else actual.blocks.push({id:'p1',type:'paragraph',text:step.text});},save:async value=>checkpoints.push(value.cursor),checkCancelled:async()=>{}});
 assert.equal(result.complete,true);assert.ok(actual.blocks[0].text.endsWith('끝까지 포함'));assert.deepEqual(checkpoints,[0,1,2]);
});
test('브리지의 잘못된 Host·Origin·미인증 요청을 거절한다',async()=>{
 const {ExtensionBridge}=require('../src/lib/extensionBridge');const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-bridge-'));const bridge=new ExtensionBridge(root,0);
 try{await bridge.start();const url='http://127.0.0.1:'+bridge.port;
 assert.equal((await fetch(url+'/heartbeat',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403);
 const invalidHost=await new Promise((resolve,reject)=>{const req=require('node:http').request(url+'/heartbeat',{method:'POST',headers:{Host:'example.com'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});
 assert.equal(invalidHost,403);
 assert.equal((await fetch(url+'/heartbeat',{method:'POST',body:'{}'})).status,401);
 }finally{bridge.stop();fs.rmSync(root,{recursive:true,force:true});}
});
