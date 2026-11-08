// Metadata-only protocol check in an empty Codex profile; no login or inference.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CodexConnection}=require('./src/lib/codexConnection');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'blog-protocol-'));
const connection=new CodexConnection(process.argv[2],{cwd:home,env:{...process.env,CODEX_HOME:home}});
(async()=>{try{const status=await connection.status();const models=await connection.models();if(status.connected)throw new Error('Expected an empty test profile');if(!models.length)throw new Error('Model catalogue missing');console.log(JSON.stringify({protocolVerified:true,accountConnected:false,modelIds:models.map(m=>m.id),inferenceUsed:false}));}finally{connection.close()}})().catch(error=>{console.error(error.message);process.exitCode=1});
