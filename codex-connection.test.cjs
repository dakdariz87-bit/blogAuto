const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CodexConnection,safeLoginUrl}=require('./src/lib/codexConnection');
const {normalizeCodexModel}=require('./src/lib/settings');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-rpc-'));const dir=path.join(root,'node_modules','@openai','codex','bin');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'codex.js'),`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};if(m.method==='account/read')result={account:{type:'chatgpt',email:'fixture@example.invalid',planType:'plus',secret:'never-forward-this'},requiresOpenaiAuth:true};if(m.method==='model/list')result=m.params.cursor?{data:[{id:'other-id',model:'gpt-6.1-terra',displayName:'Terra'}],nextCursor:null}:{data:[{model:'gpt-6-astra',displayName:'Astra'},{model:'gpt-6.1-sol',displayName:'Sol'},{model:'bad model'}],nextCursor:'next'};if(m.method==='account/login/start')result={type:'chatgpt',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture',loginId:'fixture'};process.stdout.write(JSON.stringify({id:m.id,result})+'\\n')});`);
 const cmd=path.join(root,'codex.cmd');fs.writeFileSync(cmd,'fixture');return{root,cmd};
}
test('모델 ID를 저장할 때 Astra와 새 모델이 기본값으로 바뀌지 않는다',()=>{
 for(const id of ['gpt-6-astra','gpt-6.1-sol','gpt-6.1-terra','gpt-6-luna','future-model-1'])assert.equal(normalizeCodexModel(id),id);
 assert.equal(normalizeCodexModel('bad model; echo secret'),'');
});
test('공식 HTTPS 로그인 주소만 브라우저에 연다',()=>{
 assert.equal(safeLoginUrl('https://auth.openai.com/oauth/authorize'),true);
 for(const url of ['https://auth.openai.com.evil.test','http://auth.openai.com','file:///tmp/test','https://evil@auth.openai.com'])assert.equal(safeLoginUrl(url),false);
});
test('실제 자식 프로세스의 JSON RPC 초기화·계정·모델 페이지·로그인 취소를 처리한다',async()=>{
 const fixtureData=fixture();const connection=new CodexConnection(fixtureData.cmd,{cwd:fixtureData.root});
 try{
 const status=await connection.status();assert.equal(status.connected,true);assert.equal(status.type,'chatgpt');assert.equal(JSON.stringify(status).includes('never-forward-this'),false);
 const models=await connection.models();assert.deepEqual(models.map(m=>m.id),['gpt-6-astra','gpt-6.1-sol','gpt-6.1-terra']);
 const login=await connection.login();assert.ok(safeLoginUrl(login.authUrl));assert.deepEqual(await connection.login(),{waiting:true});await connection.cancelLogin();assert.equal(connection.loginId,null);
 }finally{connection.close();fs.rmSync(fixtureData.root,{recursive:true,force:true});}
});
test('응답하지 않는 프로세스는 시간 제한 후 정리한다',async()=>{
 const f=fixture();fs.writeFileSync(path.join(f.root,'node_modules','@openai','codex','bin','codex.js'),'setInterval(()=>{},1000)');
 const connection=new CodexConnection(f.cmd,{cwd:f.root,timeoutMs:300});
 try{await assert.rejects(connection.status(),/응답/);}finally{connection.close();fs.rmSync(f.root,{recursive:true,force:true});}
});
