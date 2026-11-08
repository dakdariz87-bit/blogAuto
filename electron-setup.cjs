// Install the pinned Electron artifact explicitly; never run npm's other install scripts.
const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const {pipeline}=require('node:stream/promises');
function networkDownloader(got,onProgress=()=>{},timeouts={lookup:15000,connect:20000,secureConnect:20000,response:30000,socket:30000,request:300000}){
  return {async download(url,target){
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const stream=got.stream(url,{timeout:timeouts,retry:{limit:0}});
    stream.on('downloadProgress',progress=>onProgress(progress));
    await pipeline(stream,fs.createWriteStream(target));
  }};
}
function progressPrinter(){
  let lastTime=0,lastBytes=0;
  return progress=>{
    const now=Date.now(),bytes=progress.transferred || 0;
    if(bytes===lastBytes || (now-lastTime<2000&&progress.percent!==1))return;
    lastTime=now;lastBytes=bytes;
    const current=(bytes/1048576).toFixed(1),total=progress.total?(progress.total/1048576).toFixed(1):'?';
    console.log('실제 다운로드: '+current+' / '+total+' MB'+(progress.total?' ('+Math.round(progress.percent*100)+'%)':''));
  };
}
function readVersion(packageDir){return JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8')).version;}
function electronReady(packageDir,platform='win32'){
  try{
    const name=platform==='win32'?'electron.exe':'electron';const file=path.join(packageDir,'dist',name);
    const fd=fs.openSync(file,'r');const signature=Buffer.alloc(2);try{fs.readSync(fd,signature,0,2,0);}finally{fs.closeSync(fd);}
    return (platform!=='win32'||signature.toString()==='MZ') &&
      fs.readFileSync(path.join(packageDir,'dist','version'),'utf8').trim().replace(/^v/,'')===readVersion(packageDir) &&
      fs.readFileSync(path.join(packageDir,'path.txt'),'utf8').trim()===name;
  }catch{return false;}
}
async function installElectron({packageDir,platform='win32',arch=process.arch,downloadArtifact,extract,onProgress=progressPrinter()}={}){
  const version=readVersion(packageDir),name=platform==='win32'?'electron.exe':'electron';
  if(electronReady(packageDir,platform))return path.join(packageDir,'dist',name);
  const scopedRequire=createRequire(path.join(packageDir,'package.json'));
  const downloader=downloadArtifact || scopedRequire('@electron/get').downloadArtifact;
  const unzip=extract || scopedRequire('extract-zip');
  const checksums=JSON.parse(fs.readFileSync(path.join(packageDir,'checksums.json'),'utf8'));
  console.log('Electron '+version+' / '+platform+'-'+arch+' 배포 파일을 내려받고 원본 체크섬을 검증합니다.');
  const cacheRoot=path.join(process.env.BLOGAUTO_RUNTIME_ROOT || packageDir,'electron-cache');
  const fileName='electron-v'+version+'-'+platform+'-'+arch+'.zip';
  const sources=[{name:'GitHub 공식 배포',base:'https://github.com/electron/electron/releases/download/'},{name:'npm 미러 (동일한 원본 체크섬 검증)',base:'https://npmmirror.com/mirrors/electron/'}];
  let zip,lastError;
  const transport=downloadArtifact?undefined:networkDownloader(scopedRequire('got'),onProgress);
  for(const source of sources){
    console.log(source.name+' 연결 / 검증된 캐시 확인 중… (30초 무응답 시 중단)');
    try{
      zip=await downloader({version,artifactName:'electron',platform,arch,checksums,cacheRoot,...(transport?{downloader:transport}:{}),mirrorOptions:{resolveAssetURL:async()=>source.base+'v'+version+'/'+fileName}});
      break;
    }catch(error){lastError=error;console.log(source.name+' 실패: '+error.message.split('\n')[0]);}
  }
  if(!zip)throw new Error('두 다운로드 경로에 연결하지 못했습니다. '+(lastError?.message || '네트워크 확인 필요'));
  console.log('다운로드·원본 체크섬 검증 완료. 이제 압축을 풉니다.');
  const stage=path.join(packageDir,'.blogauto-stage-'+process.pid),dist=path.join(packageDir,'dist'),backup=dist+'.blogauto-backup-'+process.pid;
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});let moved=false;
  try{
    let entries=0;await unzip(zip,{dir:stage,onEntry:()=>{entries++;if(entries%25===0)console.log('압축 해제: '+entries+'개 항목 처리');}});
    const descriptor=fs.openSync(path.join(stage,name),'r'),signature=Buffer.alloc(2);
    try{fs.readSync(descriptor,signature,0,2,0);}finally{fs.closeSync(descriptor);}
    if(platform==='win32'&&signature.toString()!=='MZ')throw new Error('다운로드한 파일이 Windows 실행 파일이 아닙니다.');
    if(fs.readFileSync(path.join(stage,'version'),'utf8').trim().replace(/^v/,'')!==version)throw new Error('Electron 버전 검증에 실패했습니다.');
    if(fs.existsSync(dist)){fs.rmSync(backup,{recursive:true,force:true});fs.renameSync(dist,backup);moved=true;}
    try{fs.renameSync(stage,dist);fs.writeFileSync(path.join(packageDir,'path.txt'),name);}
    catch(error){fs.rmSync(dist,{recursive:true,force:true});if(moved)fs.renameSync(backup,dist);throw error;}
    if(!electronReady(packageDir,platform))throw new Error('설치된 실행 파일의 버전과 경로를 검증하지 못했습니다.');
    fs.rmSync(backup,{recursive:true,force:true});
    console.log('Electron 실행 파일·버전·경로 검증 완료.');return path.join(dist,name);
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={electronReady,installElectron,networkDownloader,progressPrinter};
if(require.main===module){
  if((process.env.HTTPS_PROXY||process.env.HTTP_PROXY)&&!process.env.ELECTRON_GET_USE_PROXY)process.env.ELECTRON_GET_USE_PROXY='1';
  const packageDir=process.argv[2];
  const deadline=setTimeout(()=>{console.error('설치가 12분 안에 완료되지 않아 중단합니다. 네트워크 또는 보안 프로그램의 차단 여부를 확인해주세요.');process.exit(1);},720000);
  installElectron({packageDir}).catch(error=>{console.error('Electron 설치 실패: '+error.message);process.exitCode=1;}).finally(()=>clearTimeout(deadline));
}
