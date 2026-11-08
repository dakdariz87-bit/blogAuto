// Browser UI fixtures only. No real accounts, generation or publishing.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright-core');
async function main(){
 const server=require('node:http').createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','styles.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'src/renderer',name)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome',headless:true}:{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('blogauto.startupNotice.dismissed.v2','true');
  const fixture=window.fixture={settings:{topicMode:'manual',publishAfterGenerate:false},store:{selectedAccountId:'',accounts:[]},jobs:0,loginRequests:0,sessionRequests:0};
  window.blogAuto={getInitialData:async()=>({runtimeRoot:'테스트 데이터',chrome:{available:true},settings:fixture.settings,accountStore:fixture.store,history:[]}),
   getCodexConnectionStatus:async()=>({connected:true,type:'chatgpt',label:'ChatGPT · 테스트 계정',plan:'plus'}),
   listCodexModels:async()=>[{id:'gpt-6-astra',name:'Astra'},{id:'gpt-6.1-sol',name:'Sol'}],
   connectCodex:async()=>{fixture.loginRequests++;return{waiting:true}},cancelCodexLogin:async()=>{},onCodexLoginComplete:()=>{},
   saveSettings:async settings=>(fixture.settings={...fixture.settings,...settings}),saveAccountStore:async store=>(fixture.store=store),
   checkAccountSession:async id=>{fixture.sessionRequests++;fixture.store.accounts.find(a=>a.id===id).sessionStatus='valid';return{status:'valid'}},
   startJob:async()=>{fixture.jobs++},onAccountsUpdate:()=>{},onLog:()=>{},onStatus:()=>{},onTokens:()=>{},onPreview:()=>{},onSelectedTitle:()=>{},onComplete:()=>{},
   openRuntimeFolder:async()=>{},openChromeInstallAndQuit:async()=>{},loadHistory:async()=>[]};
 });
 try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.getByText('2개 모델 조회됨.',{exact:false}).waitFor();
 assert.equal(await page.locator('#chatgptConnectionBadge').innerText(),'연결됨');
 const modelBox=await page.locator('#codexModel').boundingBox(),effortBox=await page.locator('#mainAgentModel').boundingBox();assert.ok(modelBox.x+modelBox.width<=effortBox.x,'Model and effort controls overlap');
 await page.locator('#codexModel').selectOption('gpt-6-astra');await page.waitForFunction(()=>window.fixture.settings.codexModel==='gpt-6-astra');
 assert.equal(await page.locator('option[value="gpt-6.1-terra"]').evaluate(option=>option.disabled),true);
 await page.locator('#quickBlogAddress').fill('https://example.com/blog');await page.locator('#connectNaverButton').click();
 assert.equal(await page.evaluate(()=>window.fixture.sessionRequests),0);
 await page.locator('#quickBlogAddress').fill('https://m.blog.naver.com/PostList.naver?blogId=dakdariz&tab=1');await page.locator('#connectNaverButton').click();
 await page.waitForFunction(()=>document.querySelector('#naverConnectionBadge').textContent==='연결됨');
 assert.equal(await page.evaluate(()=>window.fixture.store.accounts[0].blogId),'dakdariz');
 await page.locator('#connectNaverButton').click();assert.equal(await page.evaluate(()=>window.fixture.store.accounts.length),1);
 assert.equal(await page.evaluate(()=>window.fixture.jobs),0);
 await page.locator('#prepareFirstDraftButton').click();
 assert.equal(await page.locator('#topicMode').inputValue(),'manual');assert.equal(await page.locator('#publishAfterGenerate').isChecked(),false);
 await page.locator('#categoryName').fill('자세관리');await page.locator('#categoryKeyword').fill('앉은 자세 목 어깨');await page.locator('#addCategoryButton').click();
 await page.waitForFunction(()=>window.fixture.store.accounts[0].categories.length===1);
 await page.locator('#connectChatgptButton').click();assert.equal(await page.evaluate(()=>window.fixture.loginRequests),1);assert.equal(await page.evaluate(()=>window.fixture.jobs),0);
 await page.locator('#refreshChatgptButton').click();
 await page.locator('#openHelpButton').click();assert.equal(await page.locator('#usageGuide').isVisible(),true);await page.locator('#closeHelpButton').click();
 await page.screenshot({path:'verification-output/onboarding-ui.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Onboarding UI: Astra selection/save, unavailable models, URL validation, account reuse, first draft, help and login without publishing passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
fs.mkdirSync('verification-output',{recursive:true});main().catch(error=>{console.error(error);process.exitCode=1});
