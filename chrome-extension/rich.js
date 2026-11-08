export function inlineRuns(text) {
  const tokens=text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|==[^=]+==)/g).filter(Boolean);
  return tokens.map(token=>{
    if(token.startsWith('**')&&token.endsWith('**'))return {text:token.slice(2,-2),bold:true};
    if(token.startsWith('__')&&token.endsWith('__'))return {text:token.slice(2,-2),underline:true};
    if(token.startsWith('==')&&token.endsWith('=='))return {text:token.slice(2,-2),highlight:true};
    if(token.startsWith('*')&&token.endsWith('*'))return {text:token.slice(1,-1),italic:true};
    return {text:token};
  });
}

export function richPlan(source,slots=[],media={},options={}) {
  const blocks=source.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/).map(v=>v.trim()).filter(Boolean);
  const result=[];
  for(let index=0;index<blocks.length;index++){
    let block=blocks[index];
    const heading=options.headings!==false && (!block.includes('\n') && (block.startsWith('## ') || (/([?？]$|^오늘은 하나만|^자세를 바꿨다면)/.test(block)&&block.length<70)));
    block=block.replace(/^## /,'').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'$1 ($2)');
    result.push({kind:'text',heading,lines:block.split('\n').map(inlineRuns)});
    for(const slot of slots.filter(slot=>slot.checked&&slot.after===index)){
      if(media[slot.id]?.dataUrl)result.push({kind:'image',dataUrl:media[slot.id].dataUrl,name:media[slot.id].name || '',caption:slot.description || ''});
      else result.push({kind:'text',heading:false,lines:[[{text:'【이미지 삽입 위치: '+(slot.description || '설명 이미지')+'】'}]]});
    }
  }
  return result;
}

export function planText(plan){
  return plan.filter(block=>block.kind==='text').map(block=>block.lines.map(runs=>runs.map(run=>run.text).join('')).join('\n')).join('\n\n');
}

export async function keypress(command,key,code,modifiers=0){
  const event={key,code,modifiers};
  if(/^[a-z]$/i.test(key))event.windowsVirtualKeyCode=key.toUpperCase().charCodeAt(0);
  if(key==='Enter')Object.assign(event,{windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyDown',...event});
  const {text,unmodifiedText,...up}=event;
  await command('Input.dispatchKeyEvent',{type:'keyUp',...up});
}

export async function sendRichPlan(command,plan,hooks={}){
  let started=false;
  const state={bold:false,italic:false,underline:false};
  const setStyle=async desired=>{
    for(const [style,key]of [['bold','B'],['italic','I'],['underline','U']]){
      if(state[style]!==Boolean(desired[style])){
        await keypress(command,key,'Key'+key,2);state[style]=Boolean(desired[style]);
      }
    }
  };
  for(let index=0;index<plan.length;index++){
    const block=plan[index];
    if(started){await setStyle({});await keypress(command,'Enter','Enter');await keypress(command,'Enter','Enter');}
    if(block.kind==='image'){
      await setStyle({});
      if(!hooks.image)throw new Error('이미지 입력 처리가 연결되지 않았습니다.');
      await hooks.image(block);
    }else{
      if(hooks.block)await hooks.block(block,index);
      for(let line=0;line<block.lines.length;line++){
        if(line)await keypress(command,'Enter','Enter');
        for(const run of block.lines[line]){
          await setStyle({...run,bold:block.heading||run.bold});
          if(run.highlight && hooks.highlight)await hooks.highlight(true);
          if(run.text)await command('Input.insertText',{text:run.text});
          if(run.highlight && hooks.highlight)await hooks.highlight(false);
        }
      }
    }
    if(block.kind==='text' && hooks.afterBlock)await hooks.afterBlock(block,index);
    started=true;
    if(hooks.progress)await hooks.progress(index+1,plan.length);
  }
  await setStyle({});
}
