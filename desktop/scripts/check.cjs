const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
function scan(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())scan(file);else if(/\.(js|cjs)$/.test(file)){const result=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);process.exit(1);}count++;}}}
for(const folder of ['src','extension','scripts'])scan(path.join(root,folder));
console.log('Syntax checked: '+count+' files');
