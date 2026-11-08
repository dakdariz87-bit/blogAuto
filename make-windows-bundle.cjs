// Package a verified Windows installation, excluding runtime state and download caches.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw new Error('Windows packaging only');
if(!require('./electron-setup.cjs').electronReady(path.join(__dirname,'node_modules','electron')))throw new Error('Verified Electron installation required');
const destination=path.join(process.env.RUNNER_TEMP || require('node:os').tmpdir(),'blogAuto-v0.2.2-Windows-ready');
fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
const git=spawnSync('git',['ls-files','-z'],{cwd:__dirname,encoding:'utf8',shell:false});if(git.status!==0)throw new Error('Could not enumerate source files');
for(const file of git.stdout.split('\0').filter(Boolean)){
 if(file.startsWith('.github/'))continue;
 const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,file),target);
}
fs.cpSync(path.join(__dirname,'node_modules'),path.join(destination,'node_modules'),{recursive:true,filter:file=>!file.split(path.sep).some(part=>part==='electron-cache'||part.startsWith('.blogauto-'))});
fs.writeFileSync(path.join(destination,'Windows-ready.txt'),'v0.2.2 Windows-ready\r\nElectron이 설치된 묶음입니다. 압축을 모두 풀고 바로실행.cmd를 실행하세요.\r\nNode.js LTS가 필요하며 Codex와 네이버 로그인은 직접 진행합니다.\r\n');
console.log('Windows-ready bundle: '+destination);
