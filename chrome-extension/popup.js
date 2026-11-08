import { imageSuggestions, composeBody, paragraphs } from './layout.js';
const $=selector=>document.querySelector(selector);
const title=$('#title'), body=$('#body'), confirm=$('#confirm'), button=$('#insert'), status=$('#status');
let activeTab,slots=[],loaded=false,requesting=false;
const tabId=Number(new URL(location.href).searchParams.get('tabId')) || null;
if(tabId) { document.body.classList.add('large'); $('#large').hidden=true; }
const stateKey=()=> 'draft-state-'+activeTab.id;
let timer;
function saveSoon(){clearTimeout(timer);timer=setTimeout(()=>chrome.storage.local.set({[stateKey()]:{title:title.value,body:body.value,align:$('#align').value,slots}}),200);}
function renderPreview(){
  const preview=$('#preview'); preview.replaceChildren(); preview.style.textAlign=$('#align').value;
  const heading=document.createElement('h3');heading.textContent=title.value;preview.append(heading);
  for(const block of paragraphs(composeBody(body.value,slots))){
    const el=document.createElement(block.startsWith('【이미지 ')?'div':'p');
    if(block.startsWith('【이미지 ')) el.className='image-marker';
    el.textContent=block;preview.append(el);
  }
}
function renderSlots(){
  $('#slots').replaceChildren();
  for(const slot of slots){
    const card=document.createElement('div');card.className='slot';
    const label=document.createElement('label'), check=document.createElement('input');
    check.type='checkbox';check.checked=Boolean(slot.checked);
    label.append(check,document.createTextNode(' '+slot.label+' 뒤'));
    const description=document.createElement('input');description.type='text';description.value=slot.description;description.setAttribute('aria-label','이미지 설명');
    check.addEventListener('change',()=>{slot.checked=check.checked;changed();});
    description.addEventListener('input',()=>{slot.description=description.value;changed();});
    card.append(label,description);$('#slots').append(card);
  }
}
function update(){button.disabled=requesting || !loaded || !confirm.checked || !title.value.trim() || !body.value.trim();}
function changed(){renderPreview();update();if(loaded)saveSoon();}
for(const el of [title,body,$('#align')])el.addEventListener('input',changed);
confirm.addEventListener('input',update);
$('#suggest').addEventListener('click',()=>{slots=imageSuggestions(body.value);renderSlots();changed();});
$('#open-blog').addEventListener('click',async()=>{
  try{
    let target;
    try{
      const current=await chrome.tabs.get(activeTab.id),url=new URL(current.url);
      if(url.hostname==='blog.naver.com' && /PostWriteForm[.]naver$/.test(url.pathname) && url.searchParams.get('blogId')==='dakdariz')target=current;
    }catch{}
    if(!target){
      const windows=await chrome.windows.getAll({windowTypes:['normal']});
      const browser=windows.find(item=>item.id===activeTab?.windowId) || windows[0];
      if(!browser)throw new Error('일반 크롬 창을 하나 열고 다시 눌러주세요.');
      target=await chrome.tabs.create({windowId:browser.id,url:'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz',active:false});
    }
    activeTab=target;
    await chrome.storage.local.set({[stateKey()]:{title:title.value,body:body.value,align:$('#align').value,slots}});
    await chrome.tabs.update(target.id,{active:true});
    await chrome.windows.update(target.windowId,{focused:true});
    status.textContent='네이버 글쓰기 탭을 열었습니다. 편집기로 돌아와 초안을 입력하세요.';
  }catch(error){status.textContent=error.message;}
});
$('#large').addEventListener('click',async()=>{
  if(!activeTab)return;
  await chrome.storage.local.set({[stateKey()]:{title:title.value,body:body.value,align:$('#align').value,slots}});
  await chrome.windows.create({url:chrome.runtime.getURL('popup.html')+'?tabId='+activeTab.id,type:'popup',width:1180,height:900});
  window.close();
});
try{
  activeTab=tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({active:true,currentWindow:true}))[0];
  const draft=await(await fetch('draft.json')).json();
  const key='status-'+activeTab.id, state=await chrome.storage.local.get([key,stateKey()]);
  const saved=state[stateKey()] || {};
  title.value=saved.title ?? draft.title; body.value=saved.body ?? draft.body;
  $('#align').value=saved.align || 'center';
  slots=saved.slots || imageSuggestions(body.value);
  status.textContent=state[key] || '버전 0.4.1 · 가운데 정렬과 줄바꿈을 적용합니다. 이미지 위치는 원하는 항목을 체크하세요.';
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes['status-'+activeTab.id])status.textContent=changes['status-'+activeTab.id].newValue;});
  loaded=true;renderSlots();changed();
}catch(error){status.textContent=error.message;}
button.addEventListener('click',async()=>{
  requesting=true;update();
  try{
    const tab=await chrome.tabs.get(activeTab.id),url=new URL(tab.url);
    if(url.hostname!=='blog.naver.com'||!/PostWriteForm[.]naver$/.test(url.pathname)||url.searchParams.get('blogId')!=='dakdariz') throw new Error('원래 dakdariz 새 글쓰기 탭이 열려 있는지 확인해주세요.');
    status.textContent='입력 준비 중… 네이버 탭으로 전환합니다.';
    const result=await chrome.runtime.sendMessage({type:'insert-post',tabId:activeTab.id,post:{title:title.value,body:composeBody(body.value,slots),align:$('#align').value}});
    if(!result?.accepted)throw new Error(result?.reason || '입력을 시작하지 못했습니다.');
    confirm.checked=false;
  }catch(error){status.textContent=error.message;}finally{requesting=false;update();}
});
