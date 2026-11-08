import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {richPlan,planText,sendRichPlan} from './chrome-extension/rich.js';

test('긴 원본 끝까지 보존하고 굵게·이미지 위치를 계획한다',()=>{
  const ending='마지막 문단이 모두 남아야 합니다.';
  const source='## 소제목\n\n**강조**와 __밑줄__\n\n'+Array.from({length:1000},(_,i)=>'본문 '+i).join('\n')+'\n\n'+ending;
  const result=richPlan(source,[{id:'a',after:1,checked:true}],{a:{dataUrl:'data:image/png;base64,AAA',name:'사진'}},{headings:true});
  assert.equal(result[0].heading,true);assert.equal(result[1].lines[0][0].bold,true);
  assert.equal(result[2].kind,'image');assert.ok(planText(result).endsWith(ending));
  assert.equal(planText(result).includes('본문 999'),true);
});

test('실제 키 입력으로 여러 문단과 굵게를 적용한다',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setContent('<div contenteditable="true" id="editor"><p><br></p></div>');
    await page.locator('#editor').click();
    const cdp=await page.context().newCDPSession(page);
    const p=richPlan('## 소제목\n\n첫 줄\n두 번째 줄\n\n**강조**와 일반 글\n\n마지막 문단',[],{},{headings:true});
    await sendRichPlan((method,params)=>cdp.send(method,params),p);
    const text=await page.locator('#editor').innerText();
    const paragraphs=await page.locator('#editor p').allInnerTexts();
    assert.deepEqual(paragraphs.map(text=>text.trim()),['소제목','','첫 줄','두 번째 줄','','강조와 일반 글','','마지막 문단']);
    assert.ok(text.endsWith('마지막 문단'));
    const bold=await page.locator('#editor').evaluate(el=>[...el.querySelectorAll('*')].some(node=>node.textContent==='소제목'&&Number(getComputedStyle(node).fontWeight)>=600));
    assert.equal(bold,true);
  }finally{await browser.close();}
});

test('원본 복원·전체 복사·사진 선택 UI가 뒷부분을 보존한다',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      window.messages=[];window.saved={};window.copied='';
      chrome.tabs={get:async id=>({id,windowId:3,url:'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz'}),query:async()=>[{id:7,windowId:3,url:'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz'}]};
      chrome.storage={local:{get:async()=>({'draft-state-7':{title:'이전',body:'앞부분만 저장'}}),set:async value=>Object.assign(window.saved,value)},session:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:()=>{}}};
      chrome.runtime={getURL:p=>'http://rich.test/'+p,sendMessage:async m=>{window.messages.push(m);return {accepted:true};}};
      chrome.windows={create:async()=>{}};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text;}}});
    });
    await page.route('http://rich.test/**',async route=>{
      const name=new URL(route.request().url()).pathname.slice(1),types={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json'};
      await route.fulfill({body:await readFile(new URL('./chrome-extension/'+name,import.meta.url)),contentType:types[name.split('.').at(-1)]});
    });
    page.on('dialog',dialog=>dialog.accept());
    await page.goto('http://rich.test/popup.html?tabId=7');
    await page.waitForFunction(()=>document.querySelector('#body').value==='앞부분만 저장');
    assert.match(await page.locator('#source-info').innerText(),/현재 본문/);
    await page.locator('#reset').click();
    await page.waitForFunction(()=>document.querySelector('#body').value.includes('work-routine.htm'));
    await page.locator('#copy-all').click();
    assert.ok((await page.evaluate(()=>window.copied)).endsWith('work-routine.htm)'));
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});
    await page.locator('#slots input[type=file]').first().setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelector('#slots img'));
    await page.locator('#confirm').check();await page.locator('#insert').click();
    await page.waitForFunction(()=>window.messages.length>0);
    const [message]=await page.evaluate(()=>window.messages);
    assert.ok(message.post.body.endsWith('work-routine.htm)'));
    assert.ok(message.post.plan.some(block=>block.kind==='image'&&block.dataUrl.startsWith('data:image/png;')));
    assert.ok((await page.evaluate(()=>window.saved))['backup-draft-state-7']);
  }finally{await browser.close();}
});
