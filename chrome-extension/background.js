import { editorAction } from './editor.js';

const normalized = text => (text || '').replace(/[\s\u200b\ufeff]/g, '');
const statusKey = tabId => 'status-' + tabId;
async function status(tabId, message) {
  await chrome.storage.local.set({ [statusKey(tabId)]: message });
}
async function run(tabId, post) {
  let attached = false;
  let touched = false;
  let stage = '편집기 확인';
  const debuggee = { tabId };
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    if (url.hostname !== 'blog.naver.com' || !/PostWriteForm\.naver$/.test(url.pathname) || url.searchParams.get('blogId') !== 'dakdariz') {
      throw new Error('dakdariz의 새 글쓰기 화면에서 실행해주세요.');
    }
    if (!post?.title?.trim() || !post?.body?.trim()) throw new Error('제목과 본문이 필요합니다.');
    const scan = await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:editorAction,args:['probe']});
    const frames = scan.filter(item => item.result?.found);
    if (frames.length !== 1) throw new Error('입력 위치를 특정하지 못했습니다. 진단: ' + JSON.stringify(scan.map(item=>({frame:item.frameId,...item.result?.diagnostic}))));
    const selected = frames[0];
    if (!selected.result.ready) throw new Error(selected.result.reason);
    const invoke = async (mode, args) => {
      const result = await chrome.scripting.executeScript({target:{tabId,frameIds:[selected.frameId]},world:'MAIN',func:editorAction,args:[mode,args ?? null]});
      return result[0]?.result;
    };
    const command = (method, params = {}) => chrome.debugger.sendCommand(debuggee, method, params);
    stage = '키보드 연결';
    await chrome.debugger.attach(debuggee, '1.3');
    attached = true;
    async function enter(field, value) {
      stage = field === 'title' ? '제목 입력' : '본문 입력';
      await status(tabId, stage + ' 중… 브라우저와 마우스를 잠시 조작하지 마세요.');
      const target = await invoke('locate', {field});
      if (!target?.point) throw new Error(target?.reason || '입력 위치 확인 실패');
      const {x,y} = target.point;
      touched = true;
      await command('Input.dispatchMouseEvent', {type:'mouseMoved',x,y});
      await command('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',clickCount:1});
      await command('Input.insertText', {text:value});
      for (let attempt=0; attempt<20; attempt++) {
        const result = await invoke('read');
        if (result?.found && normalized(result[field]) === normalized(value)) return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('화면에서 입력 결과를 확인하지 못했습니다.');
    }
    await enter('title', post.title.trim());
    await enter('body', post.body.trim());
    await status(tabId, '버전 0.3.0 · 제목·본문 입력 확인 완료. 사진을 첨부하고 전체 내용을 확인해주세요. 아직 발행하지 않았습니다.');
  } catch (error) {
    await status(tabId, '버전 0.3.0 · ' + stage + ' 실패: ' + error.message + (touched ? '\n일부 내용이 들어갔을 수 있습니다. 반복 입력 전에 네이버 화면을 확인해주세요.' : ''));
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch { /* 사용자가 탭을 닫았을 수 있음 */ }
    }
  }
}

const busy = new Set();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'insert-post') return;
  const {tabId,post} = message;
  if (busy.has(tabId)) { respond({accepted:false,reason:'입력이 진행 중입니다.'}); return; }
  busy.add(tabId);
  status(tabId, '버전 0.3.0 · 입력 준비 중…').then(() => {
    respond({accepted:true});
    return run(tabId,post);
  }).catch(error => status(tabId, '처리 실패: ' + error.message)).finally(()=>busy.delete(tabId));
  return true;
});
