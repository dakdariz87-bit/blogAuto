const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {supervise}=require('./setup-supervisor.cjs');
async function fixture(code,run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-worker-'));try{const workerFile=path.join(dir,'worker.cjs');fs.writeFileSync(workerFile,code);await run(workerFile);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('실제로 영원히 멈춘 자식 프로세스를 종료한다',async()=>fixture("process.on('message',()=>{while(true){}})",async workerFile=>{
 const start=Date.now();await assert.rejects(supervise({}, {workerFile,idleMs:1200,totalMs:5000}),{code:'SETUP_IDLE_TIMEOUT'});assert.ok(Date.now()-start<8000);
}));
test('반복되는 가짜 진행 신호로 타임아웃을 연장할 수 없다',async()=>fixture("process.on('message',()=>{setInterval(()=>process.send({type:'progress',phase:'다운로드',completed:1}),20)})",async workerFile=>{
 await assert.rejects(supervise({}, {workerFile,idleMs:1200,totalMs:5000}),{code:'SETUP_IDLE_TIMEOUT'});
}));
test('실제 진행이 계속돼도 전체 제한 시간에 종료한다',async()=>fixture("let n=0;process.on('message',()=>{setInterval(()=>process.send({type:'progress',phase:'다운로드',completed:++n}),20)})",async workerFile=>{
 await assert.rejects(supervise({}, {workerFile,idleMs:5000,totalMs:1500}),{code:'SETUP_TOTAL_TIMEOUT'});
}));
test('진행 중인 작업은 결과까지 기다리고 정상 종료한다',async()=>fixture("process.on('message',()=>{let n=0;const t=setInterval(()=>{process.send({type:'progress',phase:'다운로드',completed:++n});if(n===10){clearInterval(t);process.send({type:'result',value:{ok:true}},()=>process.disconnect())}},200)})",async workerFile=>{
 assert.deepEqual(await supervise({}, {workerFile,idleMs:1200,totalMs:3000}),{ok:true});
}));
test('캐시 검사 단계에서 멈춘 경우에도 다운로드 바깥에서 종료한다',async()=>fixture("process.on('message',()=>{process.send({type:'phase',phase:'캐시 검증'});while(true){}})",async workerFile=>{
 await assert.rejects(supervise({}, {workerFile,idleMs:1200,totalMs:5000}),/캐시 검증/);
}));
