// Independent worker deadlines cover download, cache, hashing and extraction.
const fs=require('node:fs');const path=require('node:path');
const {supervise}=require('./setup-supervisor.cjs');
function readVersion(packageDir){return JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8')).version;}
function electronReady(packageDir){
  try{
    const fd=fs.openSync(path.join(packageDir,'dist','electron.exe'),'r'),signature=Buffer.alloc(2);
    try{fs.readSync(fd,signature,0,2,0);}finally{fs.closeSync(fd);}
    return signature.toString()==='MZ' && fs.readFileSync(path.join(packageDir,'dist','version'),'utf8').trim().replace(/^v/,'')===readVersion(packageDir) && fs.readFileSync(path.join(packageDir,'path.txt'),'utf8').trim()==='electron.exe';
  }catch{return false;}
}
function progressPrinter(){
  let last=0,previousPhase='';
  return message=>{
    if(message.type==='phase'){console.log('  '+message.phase+'…');previousPhase=message.phase;last=0;}
    if(message.type==='detail' && (Date.now()-last>=1500 || /electron\.exe$/i.test(message.file || ''))){console.log('  압축 해제 파일: '+message.file);last=Date.now();}
    if(message.type==='progress' && (message.done || Date.now()-last>=1500 || previousPhase!==message.phase)){
      console.log('  '+message.phase+': '+(message.unit==='files'?message.completed+'개 항목':(message.completed/1048576).toFixed(1)+' MB')+(message.file?' — '+message.file:''));
      last=Date.now();previousPhase=message.phase;
    }
  };
}
async function installElectron({packageDir,arch=process.arch,cacheRoot,workerFile,idleMs=30000,totalMs=300000,onEvent=progressPrinter(),sources}={}){
  if(electronReady(packageDir))return path.join(packageDir,'dist','electron.exe');
  const version=readVersion(packageDir),fileName='electron-v'+version+'-win32-'+arch+'.zip';
  const checksums=JSON.parse(fs.readFileSync(path.join(packageDir,'checksums.json'),'utf8')),checksum=checksums[fileName];
  if(!/^[a-f0-9]{64}$/i.test(checksum || ''))throw new Error('원본 패키지에 '+arch+' 체크섬이 없습니다.');
  cacheRoot=cacheRoot || path.join(process.env.BLOGAUTO_RUNTIME_ROOT || packageDir,'electron-cache');
  sources=sources || [{name:'GitHub 공식 배포',url:'https://github.com/electron/electron/releases/download/v'+version+'/'+fileName},{name:'npm 미러 (동일한 체크섬 검증)',url:'https://npmmirror.com/mirrors/electron/v'+version+'/'+fileName}];
  const options={workerFile,idleMs,totalMs,onEvent};let zip,lastError;
  console.log('Electron '+version+' / win32-'+arch+' 설치. 실제 진행이 '+Math.round(idleMs/1000)+'초 멈추면 해당 작업을 강제 종료합니다.');
  for(const source of sources){
    console.log(source.name+' 시도');
    try{const value=await supervise({mode:'download',packageDir,cacheRoot,fileName,checksum,url:source.url},options);zip=value.zip;break;}
    catch(error){lastError=error;console.error(source.name+' 실패: '+error.message);}
  }
  if(!zip)throw new Error('모든 다운로드 경로가 실패했습니다. '+(lastError?.message || ''));
  console.log('다운로드 검증 완료. 압축을 해제하고 설치합니다. (실제 기록 바이트 감시 / 무진행 120초 제한)');
  await supervise({mode:'extract',packageDir,zip,checksum,version},{...options,idleMs:Math.max(idleMs,120000),totalMs:600000});
  if(!electronReady(packageDir))throw new Error('설치 후 실행 파일 검증 실패');
  console.log('Electron 실행 파일·체크섬·버전·경로 검증 완료.');return path.join(packageDir,'dist','electron.exe');
}
module.exports={electronReady,installElectron,progressPrinter};
if(require.main===module)installElectron({packageDir:process.argv[2]}).catch(error=>{console.error('Electron 설치 실패: '+error.message);process.exitCode=1;});
