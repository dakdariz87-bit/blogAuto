// chrome.scripting에 전달하므로 외부 변수 없이 실행하는 함수입니다.
export function editorAction(mode, post) {
  const visible = el => el.getClientRects().length > 0;
  const text = el => {
    let value = el.innerText || '';
    el.querySelectorAll('.se-placeholder').forEach(node => {
      value = value.replace(node.innerText || node.textContent || '', '');
    });
    return value.replace(/[\u200b\ufeff]/g, '').trim();
  };
  const pick = selectors => {
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      if (nodes.length === 1) return nodes[0];
    }
    return null;
  };
  const title = pick(['.se-documentTitle .se-text-paragraph', '.se-section-documentTitle .se-text-paragraph', '.se-documentTitle [contenteditable="true"]']);
  const body = pick([
    '.se-main-container .se-component.se-text .se-text-paragraph',
    '.se-content .se-component.se-text .se-text-paragraph',
    '.se-component.se-text .se-text-paragraph',
    '.se-section-text .se-text-paragraph',
    '.se-component.se-text [contenteditable="true"]',
    '.se-component.se-text'
  ]);
  const counts = {};
  for (const selector of ['.se-documentTitle', '.se-section-documentTitle', '.se-component.se-text', '.se-text-paragraph', '[contenteditable="true"]', 'iframe']) {
    counts[selector] = [...document.querySelectorAll(selector)].filter(visible).length;
  }
  const diagnostic = { title: Boolean(title), body: Boolean(body), counts };
  if (!title || !body) return { found: false, diagnostic, reason: '제목·본문 영역을 정확히 찾지 못했습니다. 새 글 로딩과 도움말 창을 확인해주세요.' };
  if (mode === 'read') {
    return { found: true, title: text(title), body: text(body.closest('.se-component.se-text') || body) };
  }
  if (mode === 'locate') {
    const el = post?.field === 'title' ? title : body;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = el.getBoundingClientRect();
    let x = rect.left + Math.min(12, rect.width / 2);
    let y = rect.top + rect.height / 2;
    let current = window;
    try {
      while (current !== current.top) {
        const owner = current.frameElement;
        if (!owner) return { found: false, reason: '프레임의 입력 위치를 확인하지 못했습니다.' };
        const outer = owner.getBoundingClientRect();
        x += outer.left + owner.clientLeft;
        y += outer.top + owner.clientTop;
        current = current.parent;
      }
      if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= current.innerWidth || y >= current.innerHeight) {
        return { found: false, reason: '입력 칸이 화면 안에 보이지 않습니다.' };
      }
    } catch {
      return { found: false, reason: '다른 출처의 프레임이라 입력 위치를 확인할 수 없습니다.' };
    }
    return { found: true, point: { x, y } };
  }
  const editorRoot = body.closest('.se-content, .se-main-container') || document;
  const components = [...editorRoot.querySelectorAll('.se-component')].filter(visible);
  const nonText = components.filter(el => !el.classList.contains('se-documentTitle') && !el.classList.contains('se-text'));
  if (text(title) || text(body) || nonText.length) return { found: true, ready: false, reason: '이미 내용 또는 이미지가 있습니다. 덮어쓰지 않았습니다. 새 빈 글에서 실행해주세요.' };
  if (mode === 'probe') return { found: true, ready: true };
  if (!post?.title?.trim() || !post?.body?.trim()) return { found: true, ready: false, reason: '초안의 제목과 본문을 채워주세요.' };
  function insert(el, value) {
    el.scrollIntoView({ block: 'center' });
    const editingHost = el.closest('[contenteditable="true"]');
    if (editingHost) editingHost.focus();
    el.click();
    el.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!el.isContentEditable) throw new Error('입력 칸이 편집 가능한 상태가 아닙니다.');
    if (!document.execCommand('insertText', false, value)) throw new Error('네이버 편집기가 텍스트 입력을 받지 않았습니다.');
  }
  try {
    insert(title, post.title);
    if (!text(title).includes(post.title)) throw new Error('제목 입력 확인 실패');
    insert(body, post.body);
    const component = body.closest('.se-component.se-text') || body;
    const normalized = text(component).replace(/\s+/g, ' ');
    if (!normalized.includes(post.body.replace(/\s+/g, ' ').trim())) throw new Error('본문 전체 입력 확인 실패');
    return { found: true, ready: true, inserted: true };
  } catch (error) {
    return { found: true, ready: false, partial: true, reason: error.message + ' 일부 내용이 들어갔을 수 있으니 재입력 전에 화면을 확인해주세요.' };
  }
}
