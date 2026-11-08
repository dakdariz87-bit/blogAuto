const fs=require('node:fs');const path=require('node:path');
const root=process.env.BLOGAUTO_RUNTIME_ROOT || path.resolve(__dirname,'../runtime');
fs.mkdirSync(root,{recursive:true});
const settings=require('../src/lib/settings');settings.ensureSettingsFile(root);
const accounts=require('../src/lib/accountStore');
const file=accounts.getAccountStorePath(root);
if(!fs.existsSync(file))accounts.writeAccountStore(root,{selectedAccountId:'dakdariz-test',accounts:[{
  id:'dakdariz-test',label:'dakdariz 테스트',blogId:'dakdariz',useDefaultChromeProfile:true,checked:true,
  categories:[{id:'exercise',name:'운동학·몸교정',keyword:'운동학 몸교정 자세 필라테스 움직임',
    publishPurpose:'독자가 몸의 움직임과 운동 습관을 이해하도록 설명합니다. 실제 네이버 카테고리명으로 변경 후 발행하세요. 출처 없는 치료 효과와 가공의 회원 사례는 쓰지 않습니다.',
    preferredTone:'안녕하세요 :)로 시작하는 편안한 해요체. 전문용어는 쉬운 말로 풀고, 짧은 문장과 충분한 문단 간격을 사용합니다. 과장된 광고 표현을 피합니다.',
    searchChannel:'web',freshnessLevel:'auto',trustBlogAsSource:false,checked:true}]
}]});
console.log('테스트 대상 dakdariz 설정을 확인했습니다. 실제 네이버 카테고리명은 앱에서 변경해주세요.');
