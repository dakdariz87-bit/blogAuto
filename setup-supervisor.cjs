const path=require('node:path');const {fork,spawnSync}=require('node:child_process');
async function terminateTree(child){
  if(!child.pid || child.exitCode!==null || child.signalCode!==null)return;
  if(process.platform==='win32'){
    spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
    try{child.kill('SIGKILL');}catch{}
  }else{
    try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}
  }
  await Promise.race([new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve);}),new Promise(resolve=>setTimeout(resolve,1500))]);
}
function supervise(config,{workerFile=path.join(__dirname,'electron-worker.cjs'),idleMs=30000,totalMs=300000,onEvent=()=>{},env=process.env}={}){
  return new Promise((resolve,reject)=>{
    const child=fork(workerFile,[],{env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,detached:process.platform!=='win32'});
    const parentExit=()=>{try{child.disconnect();}catch{}};process.once('exit',parentExit);
    let idle,ending=false,result,diagnostic='',phase='작업 시작';const progress=new Map();const seenPhases=new Set();
    const finish=async(error,value)=>{if(ending)return;ending=true;process.removeListener('exit',parentExit);clearTimeout(idle);clearTimeout(deadline);if(error){await terminateTree(child);reject(error);}else resolve(value);};
    const resetIdle=()=>{clearTimeout(idle);idle=setTimeout(()=>finish(Object.assign(new Error(phase+' 단계에서 '+Math.round(idleMs/1000)+'초 동안 실제 진행이 없어 작업을 종료했습니다.'),{code:'SETUP_IDLE_TIMEOUT'})),idleMs);};
    const deadline=setTimeout(()=>finish(Object.assign(new Error(phase+' 단계의 전체 제한 시간을 초과해 작업을 종료했습니다.'),{code:'SETUP_TOTAL_TIMEOUT'})),totalMs);
    resetIdle();
    const remember=data=>{diagnostic=(diagnostic+data.toString()).slice(-4000);};child.stdout.on('data',remember);child.stderr.on('data',remember);
    child.on('error',error=>finish(error));
    child.on('message',message=>{
      if(ending||!message||typeof message!=='object')return;
      if(message.type==='phase'&&typeof message.phase==='string'){
        phase=message.phase;if(!seenPhases.has(phase)){seenPhases.add(phase);resetIdle();}
      }
      if(message.type==='progress'&&typeof message.phase==='string'&&Number.isFinite(message.completed)){
        const previous=progress.get(message.phase)||0;
        if(message.completed>previous){progress.set(message.phase,message.completed);phase=message.phase;resetIdle();}
      }
      if(message.type==='result')result=message.value;
      if(message.type==='failure')diagnostic=String(message.message || '작업 실패');
      try{onEvent(message);}catch(error){finish(error);}
    });
    child.once('exit',(code,signal)=>{if(ending)return;if(code===0&&result!==undefined)finish(null,result);else finish(new Error(diagnostic || '설치 작업 프로세스가 종료됐습니다: '+(signal || code)));});
    child.send(config,error=>{if(error)finish(error);});
  });
}
module.exports={supervise,terminateTree};
