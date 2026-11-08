const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');const {createRequire}=require('node:module');
const send=message=>{if(process.connected)process.send(message);};let runningChild,completed=false;
process.on('disconnect',()=>{if(completed)return;try{runningChild?.kill('SIGKILL');}catch{}process.exit(1);});
async function hash(file,phase){
  send({type:'phase',phase});const value=crypto.createHash('sha256');let size=0,last=0;
  for await(const chunk of fs.createReadStream(file)){value.update(chunk);size+=chunk.length;if(size-last>=1024*1024){send({type:'progress',phase,completed:size});last=size;}}
  return value.digest('hex');
}
async function cached(config){
  const file=path.join(config.cacheRoot,config.fileName);
  try{if(await hash(file,'캐시 검증')===config.checksum)return file;}catch(error){if(error.code!=='ENOENT')throw error;}
  return null;
}
async function download(config){
  await fsp.mkdir(config.cacheRoot,{recursive:true});const existing=await cached(config);if(existing)return {zip:existing,cached:true};
  const temporary=path.join(config.cacheRoot,config.fileName+'.part-'+process.pid);let interval;
  try{
    send({type:'phase',phase:'서버 연결 / 다운로드'});
    const systemCurl=process.platform==='win32'?path.join(process.env.SystemRoot || 'C:\\Windows','System32','curl.exe'):'curl';
    const args=['--location','--max-redirs','5','--fail','--silent','--show-error','--retry','0','--connect-timeout','15','--max-time','240','--speed-time','30','--speed-limit','1','--proto','=https','--proto-redir','=https'];
    if(config.caFile)args.push('--cacert',config.caFile);
    args.push('--output',temporary,config.url);
    let stderr='',polling=false;
    const exit=new Promise((resolve,reject)=>{
      const child=runningChild=spawn(systemCurl,args,{stdio:['ignore','ignore','pipe'],windowsHide:true,shell:false});
      child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-2500);});child.once('error',reject);
      child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(stderr.trim() || 'curl 다운로드 종료: '+(signal||code))));
    });
    interval=setInterval(async()=>{if(polling)return;polling=true;try{const stat=await fsp.stat(temporary);send({type:'progress',phase:'다운로드',completed:stat.size,total:config.expectedSize || 0});}catch{}finally{polling=false;}},300);
    await exit;clearInterval(interval);
    const stat=await fsp.stat(temporary);send({type:'progress',phase:'다운로드',completed:stat.size});
    if(await hash(temporary,'다운로드 체크섬 검증')!==config.checksum)throw new Error('원본 체크섬과 달라 다운로드 파일을 사용하지 않습니다.');
    const destination=path.join(config.cacheRoot,config.fileName);await fsp.rm(destination,{force:true});await fsp.rename(temporary,destination);
    return {zip:destination,bytes:stat.size};
  }finally{clearInterval(interval);await fsp.rm(temporary,{force:true}).catch(()=>{});}
}
async function extract(config){
  send({type:'phase',phase:'설치 전 체크섬 재검증'});
  if(await hash(config.zip,'설치 전 체크섬 재검증')!==config.checksum)throw new Error('압축 파일 체크섬 확인에 실패했습니다.');
  const scopedRequire=createRequire(path.join(config.packageDir,'package.json')),unzip=scopedRequire('extract-zip');
  const stage=path.join(config.packageDir,'.blogauto-stage-'+process.pid),dist=path.join(config.packageDir,'dist'),backup=dist+'.blogauto-backup-'+process.pid,pathFile=path.join(config.packageDir,'path.txt');let moved=false,oldPath;
  await fsp.mkdir(stage,{recursive:true});
  try{
    send({type:'phase',phase:'압축 해제'});let count=0;
    await unzip(config.zip,{dir:stage,onEntry:()=>send({type:'progress',phase:'압축 해제',completed:++count,unit:'files'})});
    const executable=path.join(stage,'electron.exe'),fd=await fsp.open(executable,'r'),header=Buffer.alloc(2);try{await fd.read(header,0,2,0);}finally{await fd.close();}
    if(header.toString()!=='MZ')throw new Error('Windows 실행 파일이 아닙니다.');
    if((await fsp.readFile(path.join(stage,'version'),'utf8')).trim().replace(/^v/,'')!==config.version)throw new Error('실행 파일 버전이 원본과 다릅니다.');
    send({type:'phase',phase:'설치 파일 적용'});try{oldPath=await fsp.readFile(pathFile);}catch{}
    try{await fsp.stat(dist);await fsp.rename(dist,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    try{await fsp.rename(stage,dist);await fsp.writeFile(pathFile,'electron.exe');}
    catch(error){await fsp.rm(dist,{recursive:true,force:true});if(moved)await fsp.rename(backup,dist);if(oldPath)await fsp.writeFile(pathFile,oldPath);throw error;}
    await fsp.rm(backup,{recursive:true,force:true});return {executable:path.join(dist,'electron.exe'),files:count};
  }finally{await fsp.rm(stage,{recursive:true,force:true});}
}
module.exports={download,extract,hash};
if(require.main===module)process.once('message',async config=>{
  try{const value=await(config.mode==='download'?download(config):config.mode==='extract'?extract(config):Promise.reject(new Error('알 수 없는 설치 단계')));await new Promise((resolve,reject)=>process.send({type:'result',value},error=>error?reject(error):resolve()));process.exitCode=0;}
  catch(error){send({type:'failure',message:error.message});process.exitCode=1;}
  finally{completed=true;if(process.connected)process.disconnect();}
});
