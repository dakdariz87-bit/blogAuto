const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {installNeeded,runtimePaths,checked}=require('./launcher.cjs');
test('앱 또는 브라우저 라이브러리가 없을 때만 설치한다',()=>{
 assert.equal(installNeeded('/app',()=>true),false);
 assert.equal(installNeeded('/app',file=>!file.endsWith('electron.exe')),true);
 assert.equal(installNeeded('/app',file=>!file.includes('playwright-core')),true);
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
