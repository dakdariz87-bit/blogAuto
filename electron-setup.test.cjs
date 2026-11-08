const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {supervise}=require('./setup-supervisor.cjs');const {installElectron,electronReady}=require('./electron-setup.cjs');
function root(){return fs.mkdtempSync(path.join(os.tmpdir(),'blog-install 한글 & '));}
test('진짜 worker 프로세스가 검증된 캐시를 재사용한다',async()=>{
 const dir=root(),fileName='cached.zip',body=Buffer.from('cached content');fs.writeFileSync(path.join(dir,fileName),body);
 try{const result=await supervise({mode:'download',cacheRoot:dir,fileName,checksum:crypto.createHash('sha256').update(body).digest('hex'),url:'https://invalid.invalid/'},{idleMs:5000});assert.equal(result.cached,true);assert.equal(result.zip,path.join(dir,fileName));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('잘못된 캐시를 설치하지 않고 네트워크 실패를 보고한다',async()=>{
 const dir=root();fs.writeFileSync(path.join(dir,'bad.zip'),'bad');
 try{await assert.rejects(supervise({mode:'download',cacheRoot:dir,fileName:'bad.zip',checksum:'0'.repeat(64),url:'https://127.0.0.1:1/'},{idleMs:5000}),/curl|connect|연결|Failed/i);assert.equal(fs.readFileSync(path.join(dir,'bad.zip'),'utf8'),'bad');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('첫 서버 프로세스가 멈추면 강제 종료 후 두 번째 서버로 넘어간다',async()=>{
 const dir=root(),workerFile=path.join(dir,'fake.cjs');fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({version:'31.7.7'}));fs.writeFileSync(path.join(dir,'checksums.json'),JSON.stringify({'electron-v31.7.7-win32-x64.zip':'0'.repeat(64)}));
 fs.writeFileSync(workerFile,`const fs=require('fs'),path=require('path');process.on('message',c=>{if(c.url==='hang'){while(true){}}if(c.mode==='extract'){fs.mkdirSync(path.join(c.packageDir,'dist'));fs.writeFileSync(path.join(c.packageDir,'dist','electron.exe'),'MZ');fs.writeFileSync(path.join(c.packageDir,'dist','version'),c.version);fs.writeFileSync(path.join(c.packageDir,'path.txt'),'electron.exe');}process.send({type:'result',value:{zip:'fixture.zip'}},()=>process.disconnect());});`);
 try{await installElectron({packageDir:dir,arch:'x64',workerFile,idleMs:1200,totalMs:5000,onEvent:()=>{},sources:[{name:'hang',url:'hang'},{name:'fallback',url:'ok'}]});assert.equal(electronReady(dir),true);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('다운로드 파일 체크섬이 다르면 기존 실행 파일을 보존한다',async()=>{
 const dir=root(),zip=path.join(dir,'bad.zip');fs.writeFileSync(zip,'wrong');fs.mkdirSync(path.join(dir,'dist'));fs.writeFileSync(path.join(dir,'dist','electron.exe'),'MZold');
 try{await assert.rejects(supervise({mode:'extract',packageDir:dir,zip,checksum:'0'.repeat(64),version:'31.7.7'},{idleMs:5000}),/체크섬/);assert.equal(fs.readFileSync(path.join(dir,'dist','electron.exe'),'utf8'),'MZold');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
