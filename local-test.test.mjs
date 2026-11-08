import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parsePost, fillEmptyEditor } from './local-test.mjs';

test('게시용 본문에서 내부 이미지 안내를 제거한다', () => {
  const result = parsePost('# 제목\n\n<!-- 미첨부 이미지 안내 -->\n## 소제목\n**본문**');
  assert.equal(result.title, '제목');
  assert.equal(result.body, '소제목\n본문');
  assert.throws(() => parsePost('본문만 있음'));
});

test('빈 편집기에만 입력하고 기존 내용이 있으면 변경하지 않는다', async () => {
  const browser = await chromium.launch({headless:true, executablePath: process.env.BROWSER_EXECUTABLE || undefined, args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="se-documentTitle"><p contenteditable="true"></p></div><div class="se-main-container"><div class="se-component se-text"><p contenteditable="true"></p></div></div>');
    await fillEmptyEditor(page, {title:'제목',body:'첫 문장\n다음 문장'});
    assert.equal(await page.locator('.se-documentTitle').innerText(), '제목');
    assert.match(await page.locator('.se-main-container').innerText(), /첫 문장/);
    await assert.rejects(fillEmptyEditor(page, {title:'덮어쓰기',body:'새 글'}), /기존 내용/);
    assert.equal(await page.locator('.se-documentTitle').innerText(), '제목');
    await page.setContent('<div>로그인 또는 편집기 변경</div>');
    await assert.rejects(fillEmptyEditor(page,{title:'제목',body:'내용'}),/정확히/);
  } finally { await browser.close(); }
});
