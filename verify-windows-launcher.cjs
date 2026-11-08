// Smoke test only: no account login, content generation or blog publishing.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');const {spawn}=require('node:child_process');
async function main(){
 if(process.platform!=='win32')throw new Error('Windows runner required');
 const output=path.resolve('verification-output');fs.mkdirSync(output,{recursive:true});
 const {installElectron,electronReady}=require('./electron-setup.cjs');
 const readyBefore=electronReady(path.join(__dirname,'node_modules','electron'));
 const exe=await installElectron({packageDir:path.join(__dirname,'node_modules','electron')});
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'blogauto-ui-'));
 const env={...process.env,BLOGAUTO_RUNTIME_ROOT:runtime,BLOGAUTO_SKIP_CODEX_USAGE_REFRESH:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=spawn(exe,[__dirname,'--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1'],{env,stdio:['ignore','pipe','pipe'],windowsHide:false});
 let logs='';app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);let browser;
 try{
  const {chromium}=require('playwright-core');const deadline=Date.now()+45000;
  while(!browser&&Date.now()<deadline){if(app.exitCode!==null)throw new Error('App exited: '+app.exitCode+' '+logs);try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:1500});}catch{await new Promise(r=>setTimeout(r,300));}}
  if(!browser)throw new Error('App did not expose a window: '+logs);
  const context=browser.contexts()[0];let page;
  while(Date.now()<deadline){page=context.pages().find(p=>p.url().includes('/renderer/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  if(!page)throw new Error('Original app page missing');
  await page.locator('#startButton').waitFor({state:'visible',timeout:20000});await page.locator('#articlePreview').waitFor({state:'visible',timeout:20000});
  await page.screenshot({path:path.join(output,'windows-app.png'),fullPage:true});
  const report={platform:process.platform,node:process.version,electron:require('electron/package.json').version,title:await page.title(),startButton:await page.locator('#startButton').innerText(),originalAppOpened:true,electronAlreadyInstalled:readyBefore,appRoot:__dirname,liveAccountUsed:false};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close().catch(()=>{});if(app.exitCode===null)app.kill();fs.writeFileSync(path.join(output,'app.log'),logs);}
}
main().catch(e=>{console.error(e);process.exitCode=1});
