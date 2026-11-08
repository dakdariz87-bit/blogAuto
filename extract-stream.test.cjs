const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {supervise}=require('./setup-supervisor.cjs');
function crc32(body){let crc=0xffffffff;for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zipFile(file,body){
 const name=Buffer.from(file),crc=crc32(body),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);
 const offset=30+name.length+body.length;end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,name,body,central,name,end]);
}
async function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-extract-'));const zip=path.join(dir,'one.zip'),workerFile=path.join(dir,'worker.cjs');const body=Buffer.alloc(2*1024*1024,65);fs.writeFileSync(zip,zipFile('electron.exe',body));
 fs.writeFileSync(workerFile,`
 const fs=require('fs'),{Writable}=require('stream');const {extractZip}=require(${JSON.stringify(path.join(__dirname,'extract-stream.cjs'))});const yauzl=require(${JSON.stringify(require.resolve('yauzl'))});
 process.once('message',async c=>{try{let count=0;const result=await extractZip({zip:c.zip,directory:c.directory,yauzl,onProgress:e=>{if(e.type==='bytes')process.send({type:'progress',phase:'압축 해제',completed:e.bytes})},openOutput:file=>{
  const output=fs.createWriteStream(file);return new Writable({write(chunk,enc,cb){count++;if(c.stall && count>1){setInterval(()=>{},1000);return;}setTimeout(()=>output.write(chunk,cb),100)},final(cb){output.end(cb)},destroy(e,cb){output.destroy();cb(e)}})
 }});process.send({type:'result',value:result},()=>process.disconnect());}catch(e){console.error(e);process.exit(1)}});
 `);
 try{await run({dir,zip,workerFile,body});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('파일 하나를 오래 압축 해제해도 실제 기록 바이트가 증가하면 종료하지 않는다',async()=>fixture(async({dir,zip,workerFile,body})=>{
 const events=[];const result=await supervise({zip,directory:path.join(dir,'out')},{workerFile,idleMs:1500,totalMs:20000,onEvent:e=>events.push(e)});
 assert.equal(result.bytes,body.length);assert.equal(result.files,1);assert.deepEqual(fs.readFileSync(path.join(dir,'out','electron.exe')),body);assert.ok(events.filter(e=>e.type==='progress').length>5);
}));
test('파일 기록이 실제로 멈추면 프로세스를 종료한다',async()=>fixture(async({dir,zip,workerFile})=>{
 await assert.rejects(supervise({zip,directory:path.join(dir,'out'),stall:true},{workerFile,idleMs:1500,totalMs:20000}),{code:'SETUP_IDLE_TIMEOUT'});
}));
