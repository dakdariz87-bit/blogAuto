// Double-click setup wrapper. The upstream src/, scripts/, and package files are unchanged.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const LAUNCHER_VERSION='0.2.0';

function windowsEnvironment(original,nodeExecutable,extraDirs=[],pathApi=path.win32){
  const env={...original};
  const keys=Object.keys(env).filter(key=>key.toLowerCase()==='path');
  const originalPath=env[keys.find(key=>key==='Path') || keys[0]] || '';
  for(const key of keys)delete env[key];
  env.Path=[pathApi.dirname(nodeExecutable),...extraDirs,originalPath].filter(Boolean).join(pathApi.delimiter);
  return env;
}
function codexInvocation(command,args,nodeExecutable=process.execPath,exists=fs.existsSync,pathApi=path){
  if(/\.exe$/i.test(command))return {file:command,args};
  const dir=pathApi.dirname(command);
  const candidates=[pathApi.join(dir,'node_modules','@openai','codex','bin','codex.js'),pathApi.join(dir,'..','@openai','codex','bin','codex.js')];
  const script=candidates.find(exists);
  if(!script)throw new Error('Codex 설치 파일을 확인하지 못했습니다. 설치 단계의 오류를 확인해주세요.');
  return {file:nodeExecutable,args:[script,...args]};
}
function ensureElectronInstalled(root,env,runner=spawnSync){
  const packageDir=path.join(root,'node_modules','electron');
  const setup=path.join(__dirname,'electron-setup.cjs');
  if(!fs.existsSync(setup))throw new Error('electron-setup.cjs 파일도 기존 폴더에 함께 복사해주세요.');
  const {electronReady}=require(setup);
  const executable=path.join(packageDir,'dist','electron.exe');
  if(electronReady(packageDir))return executable;
  if(!fs.existsSync(path.join(packageDir,'package.json')))throw new Error('Electron 패키지가 없습니다. 설치 단계 오류를 확인해주세요.');
  console.log('Electron의 공식 Windows 배포 파일을 직접 설치합니다. 첫 다운로드에는 몇 분 걸릴 수 있습니다.');
  checked(runner(process.execPath,[setup,packageDir],{cwd:root,env,stdio:'inherit',shell:false,timeout:1500000,killSignal:'SIGKILL'}),'Electron 실행 파일 설치');
  if(!electronReady(packageDir))throw new Error('Electron 실행 파일 검증에 실패했습니다. 위 설치 로그를 확인해주세요.');
  return executable;
}

function resolveNpmCli(nodeExecutable,wrappers=[],exists=fs.existsSync,pathApi=path){
  const dirs=[pathApi.dirname(nodeExecutable),...wrappers.map(file=>pathApi.dirname(file))];
  for(const dir of dirs){
    for(const file of [pathApi.join(dir,'node_modules','npm','bin','npm-cli.js'),pathApi.join(dir,'..','lib','node_modules','npm','bin','npm-cli.js')]){
      if(exists(file))return file;
    }
  }
  throw new Error('npm 실행 파일을 찾지 못했습니다. Node.js LTS를 복구 설치한 뒤 다시 실행해주세요.');
}
function invokeNpm(npmCli,args,options={},runner=spawnSync){
  return runner(process.execPath,[npmCli,...args],{...options,shell:false});
}

function installNeeded(root,exists=fs.existsSync){
  return !exists(path.join(root,'node_modules','electron','install.js')) ||
    !exists(path.join(root,'node_modules','playwright-core','package.json'));
}
function runtimePaths(localAppData){
  if(!localAppData)throw new Error('Windows 앱 데이터 폴더를 확인하지 못했습니다.');
  const root=path.join(localAppData,'BlogautoNaverOriginal');
  return {root,runtime:path.join(root,'runtime'),tools:path.join(root,'codex-tools'),cache:path.join(root,'npm-cache')};
}
function checked(result,label){
  if(result.error)throw new Error(label+': '+result.error.message);
  if(result.status!==0)throw new Error(label+' 단계가 중단됐습니다. 위 오류 문구를 확인해주세요.');
  return result;
}
function main(){
  if(process.platform!=='win32')throw new Error('바로실행.cmd는 Windows용입니다.');
  console.log('BlogAuto 실행 도우미 v'+LAUNCHER_VERSION);
  if(Number(process.versions.node.split('.')[0])<20)throw new Error('Node.js LTS 20 이상을 설치한 뒤 다시 실행해주세요.');
  const root=__dirname;
  if(!fs.existsSync(path.join(root,'package.json')))throw new Error('ZIP 압축을 모두 풀고 바로실행.cmd를 실행해주세요.');
  const folders=runtimePaths(process.env.LOCALAPPDATA);
  fs.mkdirSync(folders.runtime,{recursive:true});fs.mkdirSync(folders.tools,{recursive:true});
  let env=windowsEnvironment({...process.env,BLOGAUTO_RUNTIME_ROOT:folders.runtime,BLOGAUTO_CODEX_TOOLS:folders.tools,npm_config_cache:folders.cache},process.execPath);
  const npmFound=spawnSync('where.exe',['npm.cmd'],{env,encoding:'utf8'});
  const npmCli=resolveNpmCli(process.execPath,npmFound.status===0?npmFound.stdout.trim().split(/\r?\n/):[]);
  const npm=args=>invokeNpm(npmCli,args,{cwd:root,env,stdio:'inherit'});
  console.log('\n[1/4] 프로그램 설치 상태 확인');
  if(installNeeded(root)){
    console.log('처음 실행에는 필요한 패키지와 앱을 내려받습니다. 몇 분 걸릴 수 있습니다. 진행 중에는 이 창을 닫지 마세요.');
    checked(npm(['ci','--ignore-scripts','--no-audit','--no-fund']),'프로그램 패키지 설치');
  }else console.log('설치된 프로그램을 사용합니다.');
  const electronExecutable=ensureElectronInstalled(root,env);

  console.log('\n[2/4] Codex CLI 확인');
  const localBin=path.join(folders.tools,'node_modules','.bin');
  const knownDesktop=require('./src/lib/settings').resolveCodexCmdPath('codex.cmd');
  const found=spawnSync('where.exe',['codex.cmd'],{env,encoding:'utf8'});
  let codexCmd=knownDesktop && path.isAbsolute(knownDesktop) && fs.existsSync(knownDesktop) ? knownDesktop : '';
  if(!codexCmd && found.status===0)codexCmd=found.stdout.split(/\r?\n/).find(line=>line.trim())?.trim() || '';
  if(!codexCmd && !fs.existsSync(path.join(localBin,'codex.cmd'))){
    console.log('Codex CLI를 이 프로그램 전용 폴더에 설치합니다.');
    checked(npm(['install','--prefix',folders.tools,'--no-audit','--no-fund','@openai/codex']),'Codex CLI 설치');
  }
  if(!codexCmd)codexCmd=path.join(localBin,'codex.cmd');
  env=windowsEnvironment(env,process.execPath,[path.dirname(codexCmd),localBin]);
  // Preserve original settings and only point the CLI setting at the selected executable.
  const settings=require('./src/lib/settings');settings.ensureSettingsFile(folders.runtime);
  settings.writeSettings(folders.runtime,{codexCmdPath:path.extname(codexCmd).toLowerCase()==='.exe'?codexCmd:'codex.cmd'});
  console.log('\n[3/4] 계정 연결 안내');
  console.log('ChatGPT 연결은 앱 상단의 ChatGPT 연결 버튼에서 진행합니다.');

  console.log('\n[4/4] 원본 프로그램을 엽니다. 네이버 로그인은 프로그램의 세션 확인에서 진행하세요.');
  checked(spawnSync(electronExecutable,[root],{cwd:root,env,stdio:'inherit'}),'프로그램 실행');
}
module.exports={installNeeded,runtimePaths,checked,resolveNpmCli,invokeNpm,windowsEnvironment,codexInvocation,ensureElectronInstalled};
if(require.main===module){try{main();}catch(error){console.error('\n실행을 완료하지 못했습니다: '+error.message);process.exitCode=1;}}
