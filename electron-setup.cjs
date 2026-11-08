// Install the pinned Electron artifact explicitly; never run npm's other install scripts.
const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
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
async function installElectron({packageDir,platform='win32',arch=process.arch,downloadArtifact,extract}={}){
  const version=readVersion(packageDir),name=platform==='win32'?'electron.exe':'electron';
  if(electronReady(packageDir,platform))return path.join(packageDir,'dist',name);
  const scopedRequire=createRequire(path.join(packageDir,'package.json'));
  const downloader=downloadArtifact || scopedRequire('@electron/get').downloadArtifact;
  const unzip=extract || scopedRequire('extract-zip');
  const checksums=JSON.parse(fs.readFileSync(path.join(packageDir,'checksums.json'),'utf8'));
  console.log('Electron '+version+' / '+platform+'-'+arch+' 공식 배포 파일을 내려받고 체크섬을 검증합니다.');
  const cacheRoot=path.join(process.env.BLOGAUTO_RUNTIME_ROOT || packageDir,'electron-cache');
  const zip=await downloader({version,artifactName:'electron',platform,arch,checksums,cacheRoot});
  const stage=path.join(packageDir,'.blogauto-stage-'+process.pid),dist=path.join(packageDir,'dist'),backup=dist+'.blogauto-backup-'+process.pid;
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});let moved=false;
  try{
    await unzip(zip,{dir:stage});
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
module.exports={electronReady,installElectron};
if(require.main===module){
  if((process.env.HTTPS_PROXY||process.env.HTTP_PROXY)&&!process.env.ELECTRON_GET_USE_PROXY)process.env.ELECTRON_GET_USE_PROXY='1';
  const packageDir=process.argv[2],started=Date.now();
  const timer=setInterval(()=>console.log('Electron 다운로드·압축 해제 진행 중: '+Math.round((Date.now()-started)/1000)+'초'),10000);
  installElectron({packageDir}).catch(error=>{console.error('Electron 설치 실패: '+error.message);process.exitCode=1;}).finally(()=>clearInterval(timer));
}
