import { imageSuggestions } from './layout.js';
import { richPlan, planText } from './rich.js';
const $=selector=>document.querySelector(selector);
const title=$('#title'),body=$('#body'),approve=$('#confirm'),button=$('#insert'),status=$('#status');
let activeTab,slots=[],media={},original,loaded=false,requesting=false,timer;
const tabId=Number(new URL(location.href).searchParams.get('tabId')) || null;
if(tabId){document.body.classList.add('large');$('#large').hidden=true;}
const stateKey=()=> 'draft-state-'+(activeTab?.id || 'standalone');
const mediaKey=()=> 'media-state-'+(activeTab?.id || 'standalone');
const options=()=>({headings:$('#headings').checked,bodySize:Number($('#body-size').value),headingSize:Number($('#heading-size').value),headingColor:$('#heading-color').value,stickerPanel:$('#sticker').checked});
const plan=()=>richPlan(body.value,slots,media,options());
const draftState=()=>({schema:5,title:title.value,body:body.value,align:$('#align').value,slots,options:options()});
async function save(){
  await chrome.storage.local.set({[stateKey()]:draftState()});
  await chrome.storage.session.set({[mediaKey()]:media});
}
function update(){button.disabled=requesting||!loaded||!approve.checked||!title.value.trim()||!body.value.trim();}
function sourceInfo(){
  const total=Array.from(body.value).length,originalLength=Array.from(original?.body||'').length;
  $('#source-info').textContent='현재 본문 '+total.toLocaleString()+'자 / 원본 '+originalLength.toLocaleString()+'자 · '+body.value.split('\n').length+'줄 · 마지막 부분: '+body.value.slice(-110);
}
function preview(){
  const target=$('#preview');target.replaceChildren();target.style.textAlign=$('#align').value;
  const h=document.createElement('h3');h.textContent=title.value;target.append(h);
  for(const block of plan()){
    if(block.kind==='image'){
      const img=document.createElement('img');img.src=block.dataUrl;img.alt=block.caption;target.append(img);continue;
    }
    const el=document.createElement(block.heading?'h4':'div');el.className='rich-block';
    el.style.fontSize=(block.heading?$('#heading-size').value:$('#body-size').value)+'px';
    if(block.heading&&$('#heading-color').value)el.style.color=$('#heading-color').value;
    block.lines.forEach((runs,index)=>{
      if(index)el.append(document.createElement('br'));
      for(const run of runs){
        const span=document.createElement('span');span.textContent=run.text;
        if(block.heading||run.bold)span.style.fontWeight='700';
        if(run.italic)span.style.fontStyle='italic';
        if(run.underline)span.style.textDecoration='underline';
        if(run.highlight)span.style.background='#fff2b2';
        el.append(span);
      }
    });
    if(el.textContent.startsWith('【이미지'))el.className+=' image-marker';
    target.append(el);
  }
}
function changed(){
  sourceInfo();preview();update();
  if(loaded){clearTimeout(timer);timer=setTimeout(()=>save().catch(error=>{status.textContent='로컬 저장 실패: '+error.message;}),250);}
}
async function raster(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20_000_000)throw new Error('20MB 이하 PNG·JPG·WebP 사진을 선택해주세요.');
  const bitmap=await createImageBitmap(file);
  try{
    for(const limit of [1400,1100,800,600]){
      const scale=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const dataUrl=canvas.toDataURL('image/png');
      if(dataUrl.length<1_500_000)return dataUrl;
    }
    throw new Error('이미지가 너무 큽니다. 해상도를 줄인 사진을 선택해주세요.');
  }finally{bitmap.close();}
}
function renderSlots(){
  $('#slots').replaceChildren();
  for(const slot of slots){
    const card=document.createElement('div');card.className='slot';
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=Boolean(slot.checked);
    label.append(check,document.createTextNode(' '+slot.label+' 뒤'));
    const description=document.createElement('input');description.type='text';description.value=slot.description;description.setAttribute('aria-label','이미지 설명');
    check.addEventListener('change',()=>{slot.checked=check.checked;changed();});description.addEventListener('input',()=>{slot.description=description.value;changed();});
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.setAttribute('aria-label','이 위치에 넣을 사진');
    file.addEventListener('change',async()=>{
      try{
        const selected=file.files[0];if(!selected)return;
        const dataUrl=await raster(selected);
        const size=Object.entries(media).filter(([id])=>id!==slot.id).reduce((sum,[,item])=>sum+item.dataUrl.length,0)+dataUrl.length;
        if(size>4_000_000)throw new Error('선택한 사진 용량이 많습니다. 사진 수나 크기를 줄여주세요.');
        media[slot.id]={dataUrl,name:selected.name};slot.checked=true;
        await save();renderSlots();changed();status.textContent='사진 선택 완료. 승인 후 이 사진을 네이버에 붙여넣습니다. 클립보드 내용이 사진으로 바뀝니다.';
      }catch(error){status.textContent=error.message;}
    });
    card.append(label,description,file);
    if(media[slot.id]){
      const img=document.createElement('img');img.src=media[slot.id].dataUrl;img.alt=slot.description;
      const name=document.createElement('p');name.textContent=media[slot.id].name;
      const remove=document.createElement('button');remove.className='secondary';remove.textContent='사진 선택 해제';remove.addEventListener('click',()=>{delete media[slot.id];renderSlots();changed();});
      card.append(img,name,remove);
    }
    $('#slots').append(card);
  }
}
for(const el of [title,body,$('#align'),$('#body-size'),$('#heading-size'),$('#heading-color'),$('#headings'),$('#sticker')])el.addEventListener('input',changed);
approve.addEventListener('input',update);
for(const tool of document.querySelectorAll('[data-wrap]'))tool.addEventListener('click',()=>{
  const start=body.selectionStart,end=body.selectionEnd,wrap=tool.dataset.wrap;
  if(start===end){status.textContent='본문에서 강조할 문구를 먼저 드래그해 선택해주세요.';return;}
  body.setRangeText(wrap+body.value.slice(start,end)+wrap,start,end,'select');body.focus();changed();
});
$('#copy-all').addEventListener('click',async()=>{
  try{const text=title.value+'\n\n'+planText(plan());await navigator.clipboard.writeText(text);status.textContent='제목과 본문 전체 '+Array.from(text).length+'자를 복사했습니다.';}
  catch{body.focus();body.select();status.textContent='본문 전체를 선택했습니다. Ctrl+C를 눌러 복사해주세요.';}
});
$('#reset').addEventListener('click',async()=>{
  if(!original)return;
  if(body.value!==original.body&&!window.confirm('현재 편집본을 보관한 뒤 원본 전체를 다시 불러올까요?'))return;
  await chrome.storage.local.set({['backup-'+stateKey()]:draftState()});
  title.value=original.title;body.value=original.body;slots=imageSuggestions(body.value);media={};renderSlots();changed();
  status.textContent='원본 전체를 다시 불러왔습니다. 현재 글자 수와 마지막 문단을 확인해주세요.';
});
$('#suggest').addEventListener('click',()=>{slots=imageSuggestions(body.value);renderSlots();changed();});
$('#open-blog').addEventListener('click',async()=>{
  try{
    let target;
    try{const current=await chrome.tabs.get(activeTab.id),url=new URL(current.url);if(url.hostname==='blog.naver.com'&&/PostWriteForm[.]naver$/.test(url.pathname)&&url.searchParams.get('blogId')==='dakdariz')target=current;}catch{}
    if(!target){const windows=await chrome.windows.getAll({windowTypes:['normal']});const browser=windows.find(item=>item.id===activeTab?.windowId)||windows[0];if(!browser)throw new Error('일반 크롬 창을 열어주세요.');target=await chrome.tabs.create({windowId:browser.id,url:'https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz',active:false});}
    activeTab=target;await save();await chrome.tabs.update(target.id,{active:true});await chrome.windows.update(target.windowId,{focused:true});status.textContent='새 탭이면 그 탭에서 확장 프로그램을 한 번 다시 열어주세요.';
  }catch(error){status.textContent=error.message;}
});
$('#large').addEventListener('click',async()=>{await save();await chrome.windows.create({url:chrome.runtime.getURL('popup.html')+'?tabId='+activeTab.id,type:'popup',width:1220,height:950});window.close();});
try{
  try{activeTab=tabId?await chrome.tabs.get(tabId):(await chrome.tabs.query({active:true,currentWindow:true}))[0];}catch{activeTab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];}
  original=await(await fetch('draft.json')).json();
  const key='status-'+activeTab.id,state=await chrome.storage.local.get([key,stateKey()]),saved=state[stateKey()]||{};
  media=(await chrome.storage.session.get(mediaKey()))[mediaKey()]||{};
  title.value=saved.title??original.title;body.value=saved.body??original.body;$('#align').value=saved.align||'center';slots=saved.slots||imageSuggestions(body.value);
  if(saved.options){const o=saved.options;$('#body-size').value=o.bodySize||15;$('#heading-size').value=o.headingSize||19;$('#heading-color').value=o.headingColor||'';$('#headings').checked=o.headings!==false;$('#sticker').checked=Boolean(o.stickerPanel);}
  status.textContent=state[key]||'버전 0.5.0 · 원본/현재 분량과 마지막 문단을 확인해주세요. 저장된 글이 짧으면 원본 다시 불러오기를 누르세요.';
  chrome.storage.onChanged.addListener((changes,area)=>{const k='status-'+activeTab.id;if(area==='local'&&changes[k])status.textContent=changes[k].newValue;});
  loaded=true;renderSlots();changed();
}catch(error){status.textContent=error.message;}
button.addEventListener('click',async()=>{
  requesting=true;update();
  try{
    const tab=await chrome.tabs.get(activeTab.id),url=new URL(tab.url);
    if(url.hostname!=='blog.naver.com'||!/PostWriteForm[.]naver$/.test(url.pathname)||url.searchParams.get('blogId')!=='dakdariz')throw new Error('dakdariz 새 글쓰기 탭을 열어주세요.');
    const prepared=plan();
    const result=await chrome.runtime.sendMessage({type:'insert-post',tabId:activeTab.id,post:{title:title.value,body:planText(prepared),plan:prepared,align:$('#align').value,...options()}});
    if(!result?.accepted)throw new Error(result?.reason||'입력 시작 실패');approve.checked=false;
  }catch(error){status.textContent=error.message;}finally{requesting=false;update();}
});
