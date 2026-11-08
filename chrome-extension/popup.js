import { editorAction } from './editor.js';
const title = document.querySelector('#title');
const body = document.querySelector('#body');
const confirm = document.querySelector('#confirm');
const button = document.querySelector('#insert');
const status = document.querySelector('#status');
let loaded = false;
const update = () => { button.disabled = !loaded || !confirm.checked || !title.value.trim() || !body.value.trim(); };
for (const el of [title, body, confirm]) el.addEventListener('input', update);
try {
  const response = await fetch('draft.json');
  if (!response.ok) throw new Error('초안을 읽지 못했습니다.');
  const draft = await response.json();
  title.value = draft.title;
  body.value = draft.body;
  loaded = true;
  update();
} catch (error) { status.textContent = error.message; }
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.hostname !== 'blog.naver.com' || !/PostWriteForm\.naver$/.test(url.pathname) || url.searchParams.get('blogId') !== 'dakdariz') {
      throw new Error('dakdariz 새 글쓰기 탭을 선택한 뒤 확장 프로그램을 다시 열어주세요.');
    }
    status.textContent = '편집기를 확인하는 중입니다…';
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: 'MAIN', func: editorAction, args: ['probe'] });
    const found = results.filter(result => result.result?.found);
    if (found.length !== 1) throw new Error('제목·본문 영역을 정확히 찾지 못했습니다. 새 글 로딩과 도움말 창을 확인해주세요.');
    if (!found[0].result.ready) throw new Error(found[0].result.reason);
    const input = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [found[0].frameId] }, world: 'MAIN', func: editorAction, args: ['insert', { title: title.value, body: body.value }] });
    if (!input[0]?.result?.inserted) throw new Error(input[0]?.result?.reason || '입력을 확인하지 못했습니다. 네이버 화면을 확인해주세요.');
    status.textContent = '제목·본문 입력 완료. 네이버 화면에서 내용을 확인하고 사진을 첨부해주세요. 아직 발행하지 않았습니다.';
    confirm.checked = false;
  } catch (error) { status.textContent = error.message; }
  finally { update(); }
});
