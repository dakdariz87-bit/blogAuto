import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { editorAction } from './chrome-extension/editor.js';

test('기존 방식이 놓친 상위 요소의 편집 권한을 사용하고 재입력을 차단한다', async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined,args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setContent('<div contenteditable="true"><div class="se-component se-documentTitle"><p class="se-text-paragraph"><span class="se-placeholder" contenteditable="false">제목</span></p></div><div class="se-main-container"><div class="se-component se-text"><p class="se-text-paragraph"><span class="se-placeholder" contenteditable="false">글감과 함께 나의 일상을 기록해보세요!</span></p></div></div></div>');
    const action = args => page.evaluate(({source,args}) => (0,eval)('('+source+')')(...args), {source:editorAction.toString(),args});
    assert.equal((await action(['probe'])).ready,true);
    const post={title:'테스트 제목',body:'첫 문장\n\n두 번째 문장'};
    assert.equal((await action(['insert',post])).inserted,true);
    assert.notEqual((await action(['insert',post])).inserted,true);
    assert.equal((await page.locator('.se-documentTitle').innerText()).match(/테스트 제목/g).length,1);
    await page.setContent('<p>다른 페이지</p>');
    assert.equal((await action(['probe'])).found,false);
    await page.setContent('<div contenteditable="true"><div class="se-documentTitle"><p class="se-text-paragraph"></p></div><div class="se-main-container"><div class="se-component se-text"><p class="se-text-paragraph"></p></div><div class="se-component se-image">image</div></div></div>');
    assert.equal((await action(['probe'])).ready,false);
  } finally { await browser.close(); }
});
