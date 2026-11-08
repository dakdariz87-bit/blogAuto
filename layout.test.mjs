import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {imageSuggestions,composeBody,sendParagraphs} from './chrome-extension/layout.js';

test('선택한 이미지 위치만 표시하고 본문 줄바꿈을 유지한다',()=>{
  const body='안녕하세요 :)\n첫 문장\n\n소제목?\n\n내용';
  const slots=imageSuggestions(body);
  slots[0].checked=true;slots[0].description='책상 환경 사진';
  const text=composeBody(body,slots);
  assert.match(text,/안녕하세요 :\)\n첫 문장/);
  assert.match(text,/【이미지 1 삽입 위치: 책상 환경 사진】/);
  assert.equal((text.match(/삽입 위치/g)||[]).length,1);
  assert.equal(composeBody(body,[]),body);
});

test('여러 줄을 한 번에 보내지 않고 Enter와 텍스트를 나눠 보낸다',async()=>{
  const calls=[];
  await sendParagraphs(async(method,params)=>calls.push({method,params}),'첫 줄\n\n다음 줄');
  assert.deepEqual(calls.filter(x=>x.method==='Input.insertText').map(x=>x.params.text),['첫 줄','다음 줄']);
  assert.equal(calls.filter(x=>x.params.key==='Enter'&&x.params.type==='keyDown').length,2);
});

test('큰 창과 이미지 위치 미리보기·원래 네이버 탭 연결을 확인한다',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      window.testMessages=[];window.testWindows=[];window.testTabs=[];
      chrome.tabs={get:async id=>({id,windowId:3,url:id===9?'https://example.com/':'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz'}),query:async()=>[{id:7,windowId:3,url:'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz'}],create:async options=>{window.testTabs.push(options);return {id:10,windowId:3,url:options.url};},update:async(id,options)=>{window.focusedTab=id;}};
      chrome.storage={local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:()=>{}}};
      chrome.runtime={getURL:p=>'http://extension.test/'+p,sendMessage:async m=>{window.testMessages.push(m);return {accepted:true};}};
      chrome.windows={create:async v=>window.testWindows.push(v),getAll:async()=>[{id:3}],update:async()=>{}};
    });
    await page.route('http://extension.test/**',async route=>{
      const name=new URL(route.request().url()).pathname.slice(1);
      const types={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json'};
      await route.fulfill({body:await readFile(new URL('./chrome-extension/'+name,import.meta.url)),contentType:types[name.split('.').at(-1)]});
    });
    await page.goto('http://extension.test/popup.html?tabId=7');
    await page.locator('#title').waitFor();
    await page.waitForFunction(()=>document.querySelector('#title').value.length>0);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('large')),true);
    assert.equal(await page.locator('#large').isVisible(),false);
    await page.locator('#open-blog').click();
    await page.waitForFunction(()=>window.focusedTab===7);
    assert.equal((await page.evaluate(()=>window.testTabs)).length,0);
    await page.locator('#slots input[type=checkbox]').first().check();
    assert.equal(await page.locator('#preview .image-marker').count(),1);
    await page.locator('#confirm').check();await page.locator('#insert').click();
    await page.waitForFunction(()=>window.testMessages.length===1);
    const [message]=await page.evaluate(()=>window.testMessages);
    assert.equal(message.tabId,7);assert.equal(message.post.align,'center');assert.match(message.post.body,/【이미지/);assert.match(message.post.body,/\n\n/);
    await page.goto('http://extension.test/popup.html?tabId=9');
    await page.waitForFunction(()=>document.querySelector('#title').value.length>0);
    await page.locator('#open-blog').click();
    await page.waitForFunction(()=>window.focusedTab===10);
    assert.equal((await page.evaluate(()=>window.testTabs))[0].windowId,3);
    await page.locator('#confirm').check();await page.locator('#insert').click();
    await page.waitForFunction(()=>window.testMessages.length===1);
    assert.equal((await page.evaluate(()=>window.testMessages))[0].tabId,10);
  }finally{await browser.close();}
});
