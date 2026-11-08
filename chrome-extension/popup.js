const title = document.querySelector('#title');
const body = document.querySelector('#body');
const confirm = document.querySelector('#confirm');
const button = document.querySelector('#insert');
const status = document.querySelector('#status');
let loaded = false;
let activeTab;
let requesting = false;
const update = () => { button.disabled = requesting || !loaded || !confirm.checked || !title.value.trim() || !body.value.trim(); };
for (const el of [title, body, confirm]) el.addEventListener('input', update);
try {
  const response = await fetch('draft.json');
  if (!response.ok) throw new Error('초안을 읽지 못했습니다.');
  const draft = await response.json();
  title.value = draft.title;
  body.value = draft.body;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = 'status-' + activeTab.id;
  const previous = await chrome.storage.local.get(key);
  status.textContent = previous[key] || '버전 0.3.0 · 빈 새 글에서 입력해주세요.';
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[key]) status.textContent = changes[key].newValue;
  });
  loaded = true;
  update();
} catch (error) { status.textContent = error.message; }
button.addEventListener('click', async () => {
  requesting = true;
  update();
  try {
    const url = new URL(activeTab.url);
    if (url.hostname !== 'blog.naver.com' || !/PostWriteForm\.naver$/.test(url.pathname) || url.searchParams.get('blogId') !== 'dakdariz') {
      throw new Error('dakdariz 새 글쓰기 탭에서 확장 프로그램을 다시 열어주세요.');
    }
    status.textContent = '입력을 시작합니다. 잠시 브라우저를 조작하지 마세요.';
    const result = await chrome.runtime.sendMessage({ type: 'insert-post', tabId: activeTab.id, post: { title: title.value, body: body.value } });
    if (!result?.accepted) throw new Error(result?.reason || '입력을 시작하지 못했습니다.');
    confirm.checked = false;
  } catch (error) { status.textContent = error.message; }
  finally { requesting = false; update(); }
});
