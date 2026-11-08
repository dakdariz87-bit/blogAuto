import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { editorAction } from './chrome-extension/editor.js';

test('contenteditable이 아닌 화면을 실제 마우스·키 입력으로 처리한다', async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.setContent(`<div class="se-content"><div class="se-documentTitle"><p class="se-text-paragraph"><span class="se-placeholder">제목</span></p></div><div class="se-component se-text"><p class="se-text-paragraph"><span class="se-placeholder">본문</span></p></div></div><textarea style="position:fixed;left:-2000px"></textarea>
    <script>let target;const input=document.querySelector('textarea');document.querySelectorAll('.se-text-paragraph').forEach(p=>p.addEventListener('mousedown',e=>{if(e.isTrusted){target=p;input.value='';input.focus();e.preventDefault();}}));input.addEventListener('input',()=>{if(target)target.innerText=input.value;});</script>`);
    const run=(mode,args)=>page.evaluate(({source,mode,args})=>(0,eval)('('+source+')')(mode,args),{source:editorAction.toString(),mode,args});
    assert.equal((await run('probe')).ready,true);
    const cdp=await page.context().newCDPSession(page);
    for(const [field,text] of [['title','제목 입력 테스트'],['body','첫 문장\n두 번째 문장']]){
      const {point}=await run('locate',{field});
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      await cdp.send('Input.insertText',{text});
      assert.equal((await run('read'))[field],text);
    }
    assert.equal((await run('probe')).ready,false);
  } finally {await browser.close();}
});
