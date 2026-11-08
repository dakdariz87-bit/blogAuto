const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {installNeeded,runtimePaths,checked,resolveNpmCli,invokeNpm,windowsEnvironment,codexInvocation,ensureElectronInstalled}=require('./launcher.cjs');
test('앱 또는 브라우저 라이브러리가 없을 때만 설치한다',()=>{
 assert.equal(installNeeded('/app',()=>true),false);
 assert.equal(installNeeded('/app',file=>!file.endsWith('install.js')),true);
 assert.equal(installNeeded('/app',file=>!file.includes('playwright-core')),true);
});
test('Windows Path/PATH 중복을 없애고 현재 node.exe와 시스템 경로를 보존한다',()=>{
 const result=windowsEnvironment({Path:'C:\\Windows\\System32;C:\\Existing',TEMP:'tmp'},'C:\\Program Files\\nodejs\\node.exe',['C:\\Codex']);
 assert.equal(Object.keys(result).filter(key=>key.toLowerCase()==='path').length,1);
 assert.equal(result.Path,'C:\\Program Files\\nodejs;C:\\Codex;C:\\Windows\\System32;C:\\Existing');
 assert.equal(result.TEMP,'tmp');
});
test('Codex .cmd를 실행하지 않고 확인된 node.exe와 codex.js를 직접 실행한다',()=>{
 const cli='C:\\Tools\\node_modules\\@openai\\codex\\bin\\codex.js';
 const result=codexInvocation('C:\\Tools\\node_modules\\.bin\\codex.cmd',['login','status'],'C:\\Node Folder\\node.exe',file=>file===cli,path.win32);
 assert.equal(result.file,'C:\\Node Folder\\node.exe');assert.deepEqual(result.args,[cli,'login','status']);
 assert.deepEqual(codexInvocation('C:\\codex.exe',['login']),{file:'C:\\codex.exe',args:['login']});
});
test('Electron 설치 보조 파일을 직접 실행하고 결과 파일을 검증한다',()=>{
 const fs=require('node:fs'),os=require('node:os');const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-electron-'));
 const packageDir=path.join(root,'node_modules','electron');fs.mkdirSync(packageDir,{recursive:true});fs.writeFileSync(path.join(packageDir,'package.json'),JSON.stringify({version:'31.7.7'}));let calls=0;
 try{
 const result=ensureElectronInstalled(root,{},(file,args,options)=>{calls++;assert.ok(args[0].endsWith('electron-setup.cjs'));assert.equal(args[1],packageDir);assert.equal(options.shell,false);fs.mkdirSync(path.join(packageDir,'dist'));fs.writeFileSync(path.join(packageDir,'dist','electron.exe'),'MZtest');fs.writeFileSync(path.join(packageDir,'dist','version'),'31.7.7');fs.writeFileSync(path.join(packageDir,'path.txt'),'electron.exe');return{status:0};});
 assert.ok(result.endsWith('electron.exe'));assert.equal(calls,1);ensureElectronInstalled(root,{},()=>{throw new Error('재설치하면 안 됨');});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('다시 다운로드해도 같은 Windows 앱 데이터 위치를 사용한다',()=>{
 const folders=runtimePaths('C:/Users/test/AppData/Local');
 assert.equal(folders.runtime,path.join('C:/Users/test/AppData/Local','BlogautoNaverOriginal','runtime'));
 assert.notEqual(folders.tools,folders.runtime);assert.throws(()=>runtimePaths(''));
});
test('설치 실패를 숨기지 않고 실행을 멈춘다',()=>{
 assert.throws(()=>checked({status:1},'설치'),/중단/);
 assert.throws(()=>checked({error:new Error('실행 불가')},'설치'),/실행 불가/);
 assert.deepEqual(checked({status:0},'설치'),{status:0});
});
test('Windows 공백 경로를 셸이나 따옴표 변환 없이 npm에 전달한다',()=>{
 const prefix='C:\\Users\\테스트 사용자\\AppData\\Local\\BlogautoNaverOriginal\\codex-tools';let actual;
 invokeNpm('C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',['install','--prefix',prefix,'@openai/codex'],{},(file,args,options)=>{actual={file,args,options};return{status:0};});
 assert.equal(actual.args[3],prefix);assert.equal(actual.options.shell,false);assert.equal(actual.args[3].includes('"'),false);
 const expected='C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
 assert.equal(resolveNpmCli('C:\\Program Files\\nodejs\\node.exe',[],file=>file===expected,path.win32),expected);
});
test('실제 npm CLI에서 공백·한글·특수문자 설치 경로를 그대로 인식한다',()=>{
 const fs=require('node:fs'),os=require('node:os');const folder=fs.mkdtempSync(path.join(os.tmpdir(),'blog npm 한글 & '));
 try{const result=invokeNpm(resolveNpmCli(process.execPath),['--prefix',folder,'prefix'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),folder);}
 finally{fs.rmSync(folder,{recursive:true,force:true});}
});
