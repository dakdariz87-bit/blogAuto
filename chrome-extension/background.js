import { editorAction } from './editor.js';
import { sendParagraphs } from './layout.js';
import { sendRichPlan, keypress } from './rich.js';

const normalized = text => (text || '').replace(/[\s\u200b\ufeff]/g, '');
const statusKey = tabId => 'status-' + tabId;
async function status(tabId, message) {
  await chrome.storage.local.set({ [statusKey(tabId)]: message });
}
async function run(tabId, post) {
  let attached = false;
  let touched = false;
  let stage = '편집기 확인';
  const warnings=[];
  const debuggee = { tabId };
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    if (url.hostname !== 'blog.naver.com' || !/PostWriteForm\.naver$/.test(url.pathname) || url.searchParams.get('blogId') !== 'dakdariz') {
      throw new Error('dakdariz의 새 글쓰기 화면에서 실행해주세요.');
    }
    if (!post?.title?.trim() || !post?.body?.trim()) throw new Error('제목과 본문이 필요합니다.');
    await chrome.tabs.update(tabId,{active:true});
    await chrome.windows.update(tab.windowId,{focused:true});
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
    const click=async point=>{
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    };
    const warn=message=>{if(!warnings.includes(message))warnings.push(message);};
    async function toolbar(menu,value){
      const first=await invoke('tool',{name:menu});
      if(!first?.point)return false;
      await click(first.point);
      await new Promise(resolve=>setTimeout(resolve,80));
      const choice=await invoke('tool',{name:menu==='size-menu'?'size-value':'color-value',value});
      if(choice?.point){await click(choice.point);return true;}
      await keypress(command,'Escape','Escape');return false;
    }
    let lastSize;
    async function pasteImage(block){
      stage='선택한 사진 업로드';
      await status(tabId,'버전 0.5.0 · 선택한 사진 업로드 확인 중: '+(block.name || '사진'));
      try{
      const before=await invoke('metrics');
      if(!await chrome.offscreen.hasDocument())await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['CLIPBOARD'],justification:'사용자가 선택한 사진을 네이버 글의 지정 위치에 붙여넣습니다.'});
      const ready=await chrome.runtime.sendMessage({type:'prepare-image-clipboard',dataUrl:block.dataUrl});
      if(!ready?.ok)throw new Error(ready?.error || '사진 붙여넣기 준비 실패');
      await keypress(command,'v','KeyV',2);
      for(let attempt=0;attempt<100;attempt++){
        const after=await invoke('metrics');
        if(after?.images>before.images && after.loadedImages>before.loadedImages)return;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw new Error('사진 업로드를 확인하지 못했습니다. 네이버 화면에서 사진 상태를 확인해주세요.');
      }catch(error){
        warn('사진 확인 필요: '+(block.name || '사진')+' — '+error.message);
        await command('Input.insertText',{text:'【사진 확인 필요: '+(block.name || '사진').replace(/[\r\n】]/g,' ')+'】'});
      }
    }
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
      if (post.align) {
        const key=post.align==='center'?'E':'L', code=post.align==='center'?69:76;
        await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:'Key'+key,windowsVirtualKeyCode:code,modifiers:10});
        await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:'Key'+key,windowsVirtualKeyCode:code,modifiers:10});
        await new Promise(resolve=>setTimeout(resolve,150));
        const align=await invoke('alignment',{field});
        if(align?.align!==post.align && !(post.align==='left' && ['start','left'].includes(align?.align))) {
          let alignment=await invoke('align-button',{align:post.align});
          if(!alignment?.point){
            const menu=await invoke('align-menu');
            if(menu?.point){
              await command('Input.dispatchMouseEvent',{type:'mousePressed',...menu.point,button:'left',clickCount:1});
              await command('Input.dispatchMouseEvent',{type:'mouseReleased',...menu.point,button:'left',clickCount:1});
              await new Promise(resolve=>setTimeout(resolve,100));
              alignment=await invoke('align-button',{align:post.align});
            }
          }
          if(alignment?.point){
            const p=alignment.point;
            await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
            await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
          }
          const checked=await invoke('alignment',{field});
          if(checked?.align!==post.align && !(post.align==='left' && ['start','left'].includes(checked?.align))) warnings.push((field==='title'?'제목':'본문')+' 정렬은 확인되지 않아 네이버 정렬 메뉴에서 확인이 필요합니다.');
          await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
          await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
          const refocus=await invoke('locate',{field});
          if(!refocus?.point) throw new Error('정렬 후 입력 위치를 다시 확인하지 못했습니다.');
          await command('Input.dispatchMouseEvent',{type:'mousePressed',...refocus.point,button:'left',clickCount:1});
          await command('Input.dispatchMouseEvent',{type:'mouseReleased',...refocus.point,button:'left',clickCount:1});
        }
      }
      if(field==='body' && Array.isArray(post.plan)){
        await sendRichPlan(command,post.plan,{
          progress:async(current,total)=>status(tabId,'버전 0.5.0 · 글·효과·사진 입력 중 '+current+'/'+total),
          image:pasteImage,
          block:async block=>{
            const desired=String(block.heading?(post.headingSize||19):(post.bodySize||15));
            if(lastSize!==desired){
              if(!await toolbar('size-menu',desired))warn('글자 크기 메뉴를 확인하지 못해 네이버에서 크기 확인이 필요합니다.');
              lastSize=desired;
            }
            if(post.headingColor && !await toolbar('color-menu',block.heading?post.headingColor:'#000000'))warn('글자 색상 적용을 확인하지 못했습니다.');
          },
          highlight:async enabled=>{
            if(!await toolbar('highlight-menu',enabled?'#fff2b2':'#ffffff'))warn('배경 강조 적용을 확인하지 못했습니다.');
          },
          afterBlock:async block=>{
            const style=await invoke('style');
            if(block.heading && !(Number(style?.fontWeight)>=600 || style?.fontWeight==='bold'))warn('소제목 굵게 적용 여부를 네이버에서 확인해주세요.');
            const desired=block.heading?(post.headingSize||19):(post.bodySize||15);
            if(style && Math.abs(parseFloat(style.fontSize)-desired)>1)warn('일부 글자 크기가 요청한 크기와 다릅니다. 네이버에서 확인해주세요.');
          }
        });
      }else if(field==='body')await sendParagraphs(command,value);
      else await command('Input.insertText', {text:value});
      for (let attempt=0; attempt<20; attempt++) {
        const result = await invoke('read');
        const actual=(result?.[field] || '').replace(/【사진 확인 필요:[^】]*】/g,'');
        if (result?.found && normalized(actual) === normalized(value)) return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('화면에서 입력 결과를 확인하지 못했습니다.');
    }
    await enter('title', post.title.trim());
    await enter('body', post.body.trim());
    if(post.stickerPanel){
      const sticker=await invoke('tool',{name:'sticker'});
      if(sticker?.point){await click(sticker.point);warn('스티커 패널을 열었습니다. 원하는 스티커를 직접 선택해주세요.');}
      else warn('스티커 버튼을 찾지 못했습니다. 네이버의 스티커 버튼을 직접 눌러주세요.');
    }
    await status(tabId, '버전 0.5.0 · 제목·본문 입력 확인 완료. 선택한 사진과 서식, 본문 마지막 문단까지 확인해주세요. 사진 없는 이미지 위치 표시는 직접 교체해주세요. 아직 발행하지 않았습니다.'+(warnings.length?'\n'+warnings.join('\n'):''));
  } catch (error) {
    await status(tabId, '버전 0.5.0 · ' + stage + ' 실패: ' + error.message + (touched ? '\n일부 내용이 들어갔을 수 있습니다. 반복 입력 전에 네이버 화면을 확인해주세요.' : ''));
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
  status(tabId, '버전 0.5.0 · 입력 준비 중…').then(() => {
    respond({accepted:true});
    return run(tabId,post);
  }).catch(error => status(tabId, '처리 실패: ' + error.message)).finally(()=>busy.delete(tabId));
  return true;
});
