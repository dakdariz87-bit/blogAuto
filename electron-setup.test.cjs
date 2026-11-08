const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {electronReady,installElectron,networkDownloader}=require('./electron-setup.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'electron-artifact-'));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'31.7.7'}));fs.writeFileSync(path.join(root,'checksums.json'),JSON.stringify({'electron-v31.7.7-win32-x64.zip':'expected-checksum'}));return root;}
function writeDist(dir,version='31.7.7',header='MZtest'){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'electron.exe'),header);fs.writeFileSync(path.join(dir,'version'),version);}
test('다운로드 생략·다른 OS 설정이 있어도 명시한 Windows 배포판과 체크섬을 사용한다',async()=>{
 const root=fixture(),previous=process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;process.env.ELECTRON_SKIP_BINARY_DOWNLOAD='1';let called=false;
 try{await installElectron({packageDir:root,platform:'win32',arch:'x64',downloadArtifact:async options=>{called=true;assert.equal(options.platform,'win32');assert.equal(options.arch,'x64');assert.equal(options.checksums['electron-v31.7.7-win32-x64.zip'],'expected-checksum');return 'verified-archive';},extract:async(_,options)=>writeDist(options.dir)});assert.equal(called,true);assert.equal(electronReady(root),true);}
 finally{if(previous===undefined)delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;else process.env.ELECTRON_SKIP_BINARY_DOWNLOAD=previous;fs.rmSync(root,{recursive:true,force:true});}
});
test('잘못된 실행 파일은 설치하지 않고 기존 배포 파일을 보존한다',async()=>{
 const root=fixture();writeDist(path.join(root,'dist'),'old-version');fs.writeFileSync(path.join(root,'path.txt'),'electron.exe');
 try{await assert.rejects(installElectron({packageDir:root,downloadArtifact:async()=> 'archive',extract:async(_,options)=>writeDist(options.dir,'31.7.7','ELF-not-windows')}),/Windows 실행 파일/);assert.equal(fs.readFileSync(path.join(root,'dist','version'),'utf8'),'old-version');}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('올바른 버전·실행 파일·경로가 있으면 재다운로드하지 않는다',async()=>{
 const root=fixture();writeDist(path.join(root,'dist'));fs.writeFileSync(path.join(root,'path.txt'),'electron.exe');
 try{assert.equal(electronReady(root),true);await installElectron({packageDir:root,downloadArtifact:async()=>{throw new Error('다운로드하면 안 됨');}});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('공식 배포 연결이 실패하면 동일 체크섬을 유지한 채 미러로 전환한다',async()=>{
 const root=fixture();let calls=0;const sources=[];
 try{await installElectron({packageDir:root,downloadArtifact:async options=>{calls++;sources.push(await options.mirrorOptions.resolveAssetURL());assert.equal(options.checksums['electron-v31.7.7-win32-x64.zip'],'expected-checksum');if(calls===1)throw new Error('연결 시간 초과');return 'verified-archive';},extract:async(_,options)=>writeDist(options.dir)});assert.equal(calls,2);assert.ok(sources[0].startsWith('https://github.com/'));assert.ok(sources[1].startsWith('https://npmmirror.com/'));assert.equal(electronReady(root),true);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('응답하지 않는 실제 HTTP 서버에서 다운로드 제한 시간이 작동한다',async()=>{
 const http=require('node:http'),got=require('got');const root=fixture();const server=http.createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const started=Date.now();await assert.rejects(networkDownloader(got,()=>{},{response:60,request:250}).download('http://127.0.0.1:'+server.address().port+'/',path.join(root,'stalled.zip')),/Timeout|timeout|time/i);assert.ok(Date.now()-started<1500);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
