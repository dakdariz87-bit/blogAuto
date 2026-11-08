// Integration policy: user review is required for the exact article and target.
const crypto=require('node:crypto');
const fs=require('node:fs');
function imageFingerprint(file){return file?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):'';}
function reviewDigest(draft){
  const fields={blogId:draft.blogId,accountId:draft.accountId,category:draft.category,title:draft.title,article:draft.article,
    titleImagePath:draft.titleImagePath || '',titleImageHash:imageFingerprint(draft.titleImagePath),bodyImages:(draft.bodyImages || []).map(image=>({path:image.path,sequence:image.sequence,hash:imageFingerprint(image.path)})),
    tags:draft.tags || [],publishVisibility:draft.publishVisibility,publishScheduleMode:draft.publishScheduleMode,reserveAfterHours:draft.reserveAfterHours};
  return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
function isReviewed(draft){try{return Boolean(draft?.reviewedAt && draft?.approvalDigest===reviewDigest(draft));}catch{return false;}}
function assertReviewed(draft){if(!isReviewed(draft))throw new Error('이 원고와 게시 대상은 아직 승인되지 않았습니다. 본문·이미지·공개설정을 확인한 뒤 승인 버튼을 눌러주세요.');}
function approveDraft(draft,changes={}){
  if(!draft || draft.status!=='pending_naver_publish')throw new Error('검토 대기 중인 완성 원고가 없습니다.');
  for(const key of ['blogId','accountId','category'])if(changes[key]!==undefined&&changes[key]!==draft[key])throw new Error('현재 선택한 계정·카테고리와 원고의 대상이 다릅니다. 원고의 대상을 선택한 뒤 승인하세요.');
  const title=String(changes.title??draft.title).trim(),article=String(changes.article??draft.article);
  if(!title || !article.trim() || article.length>200000)throw new Error('제목과 본문 전체를 확인해주세요.');
  const visibility=changes.publishVisibility || draft.publishVisibility;
  if(!['draft','private','public'].includes(visibility))throw new Error('공개 설정을 확인해주세요.');
  const result={...draft,title,article,publishVisibility:visibility,publishPrivate:visibility!=='public',
    publishScheduleMode:visibility==='draft'?'now':changes.publishScheduleMode || draft.publishScheduleMode,
    reserveAfterHours:Number(changes.reserveAfterHours || draft.reserveAfterHours || 3),
    publishToTistoryAfterNaver:false,tistoryBlogId:'',reviewedAt:new Date().toISOString()};
  result.approvalDigest=reviewDigest(result);return result;
}
module.exports={reviewDigest,isReviewed,assertReviewed,approveDraft};
