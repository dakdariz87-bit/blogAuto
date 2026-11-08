export function paragraphs(body) {
  return body.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/).map(s=>s.trim()).filter(Boolean);
}

export function imageSuggestions(body) {
  const blocks=paragraphs(body);
  const selected=new Set([Math.min(3,blocks.length-1)]);
  blocks.forEach((block,index)=>{
    if (!block.includes('\n') && /[?？]$/.test(block)) selected.add(index);
  });
  return [...selected].filter(i=>i>=0).slice(0,5).map((after,index)=>({id:'image-'+index,after,label:blocks[after].replace(/\n/g,' ').slice(0,60),description:index===0?'대표 이미지 또는 주제를 설명하는 사진':'이 내용을 설명하는 사진·도표'}));
}

export function composeBody(body, slots=[]) {
  const blocks=paragraphs(body);
  let number=0;
  return blocks.map((block,index)=>{
    const markers=slots.filter(slot=>slot.checked && slot.after===index).map(slot=>{
      number++;
      const description=(slot.description || '설명 이미지').replace(/[\r\n]/g,' ').trim();
      return '【이미지 '+number+' 삽입 위치: '+description+'】';
    });
    return [block,...markers].join('\n\n');
  }).join('\n\n');
}

export async function sendParagraphs(command, body, onProgress=()=>{}) {
  const lines=body.replace(/\r\n?/g,'\n').split('\n');
  for(let index=0;index<lines.length;index++){
    if(index){
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    if(lines[index]) await command('Input.insertText',{text:lines[index]});
    if(index%8===0) await onProgress(index+1,lines.length);
  }
}
