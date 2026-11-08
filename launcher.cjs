// Double-click setup wrapper. The upstream src/, scripts/, and package files are unchanged.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function installNeeded(root,exists=fs.existsSync){
  return !exists(path.join(root,'node_modules','electron','dist','electron.exe')) ||
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
  if(Number(process.versions.node.split('.')[0])<20)throw new Error('Node.js LTS 20 이상을 설치한 뒤 다시 실행해주세요.');
  const root=__dirname;
  if(!fs.existsSync(path.join(root,'package.json')))throw new Error('ZIP 압축을 모두 풀고 바로실행.cmd를 실행해주세요.');
  const folders=runtimePaths(process.env.LOCALAPPDATA);
  fs.mkdirSync(folders.runtime,{recursive:true});fs.mkdirSync(folders.tools,{recursive:true});
  const env={...process.env,BLOGAUTO_RUNTIME_ROOT:folders.runtime,BLOGAUTO_CODEX_TOOLS:folders.tools,npm_config_cache:folders.cache};
  const run=command=>spawnSync(process.env.ComSpec || 'cmd.exe',['/d','/s','/c',command],{cwd:root,env,stdio:'inherit'});
  console.log('\n[1/4] 프로그램 설치 상태 확인');
  if(installNeeded(root)){
    console.log('처음 실행에는 필요한 패키지와 앱을 내려받습니다. 몇 분 걸릴 수 있습니다. 진행 중에는 이 창을 닫지 마세요.');
    checked(run('npm ci --no-audit --no-fund'),'프로그램 패키지 설치');
  }else console.log('설치된 프로그램을 사용합니다.');

  console.log('\n[2/4] Codex CLI 확인');
  const localBin=path.join(folders.tools,'node_modules','.bin');
  const knownDesktop=require('./src/lib/settings').resolveCodexCmdPath('codex.cmd');
  const found=spawnSync('where.exe',['codex.cmd'],{env,encoding:'utf8'});
  let codexCmd=knownDesktop && path.isAbsolute(knownDesktop) && fs.existsSync(knownDesktop) ? knownDesktop : '';
  if(!codexCmd && found.status===0)codexCmd=found.stdout.split(/\r?\n/).find(line=>line.trim())?.trim() || '';
  if(!codexCmd && !fs.existsSync(path.join(localBin,'codex.cmd'))){
    console.log('Codex CLI를 이 프로그램 전용 폴더에 설치합니다.');
    checked(run('npm install --prefix "%BLOGAUTO_CODEX_TOOLS%" --no-audit --no-fund @openai/codex'),'Codex CLI 설치');
  }
  if(!codexCmd)codexCmd=path.join(localBin,'codex.cmd');
  env.PATH=path.dirname(codexCmd)+path.delimiter+localBin+path.delimiter+(env.PATH || '');
  // Preserve original settings and only point the CLI setting at the selected executable.
  const settings=require('./src/lib/settings');settings.ensureSettingsFile(folders.runtime);
  settings.writeSettings(folders.runtime,{codexCmdPath:path.extname(codexCmd).toLowerCase()==='.exe'?codexCmd:'codex.cmd'});
  // Pass the executable in an environment variable so user-directory characters are not shell code.
  env.BLOGAUTO_CODEX_EXECUTABLE=codexCmd;
  console.log('\n[3/4] Codex 로그인 상태 확인');
  const auth=run('call "%BLOGAUTO_CODEX_EXECUTABLE%" login status >nul 2>nul');
  if(auth.status!==0){
    console.log('브라우저에서 본인 ChatGPT/Codex 계정으로 로그인해주세요. 로그인은 직접 완료해야 합니다.');
    checked(run('call "%BLOGAUTO_CODEX_EXECUTABLE%" login'),'Codex 로그인');
  }else console.log('기존 Codex 로그인을 사용합니다.');

  console.log('\n[4/4] 원본 프로그램을 엽니다. 네이버 로그인은 프로그램의 세션 확인에서 진행하세요.');
  checked(spawnSync(path.join(root,'node_modules','electron','dist','electron.exe'),[root],{cwd:root,env,stdio:'inherit'}),'프로그램 실행');
}
module.exports={installNeeded,runtimePaths,checked};
if(require.main===module){try{main();}catch(error){console.error('\n실행을 완료하지 못했습니다: '+error.message);process.exitCode=1;}}
