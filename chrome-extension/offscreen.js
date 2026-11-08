chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message?.type!=='prepare-image-clipboard')return;
  (async()=>{
    if(!/^data:image\/png;base64,/.test(message.dataUrl || '') || message.dataUrl.length>3_000_000)throw new Error('이미지 형식 또는 크기를 확인해주세요.');
    const blob=await(await fetch(message.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    respond({ok:true});
  })().catch(error=>respond({ok:false,error:error.message}));
  return true;
});
