const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {neckDeskSources,mergeEvidence}=require('./src/lib/institutionEvidence');
const {_private:s}=require('./src/lib/search');const {_private:r}=require('./src/lib/codexRunner');
test('주제에 맞는 기관 원문은 한국어 제목을 통해 후보 필터와 전달 단계를 통과한다',()=>{
 const options={topic:'오래 앉아 있을 때 목과 어깨가 뻐근한 이유',keyword:'필라테스',searchNeed:'strict'};
 for(const seed of neckDeskSources(options)){
  assert.equal(s.candidateMatchesSearchIntent(seed,options),true);
  const item={...seed,excerpt:'Neck pain can result from sitting at a desk for a long time. Change position regularly.',contentLength:300};
  const relevance=s.scoreCandidate(item,[],options,s.buildSearchProfile(options));
  assert.ok(relevance.score>=3);assert.ok(relevance.topicMatchedTerms.length>0);
  assert.ok(r.compactSearchResultsForPrompt([{...item,relevance}])[0].excerpt.includes('Change position'));
 }
 assert.equal(neckDeskSources({topic:'무릎 수술'}).length,0);
});
test('모바일·데스크톱 네이버 글은 합치고 서로 다른 글 ID는 보존한다',()=>{
 const result=mergeEvidence([{url:'https://blog.naver.com/a/123',excerpt:'short'}],[{url:'https://m.blog.naver.com/PostView.naver?blogId=a&logNo=123',excerpt:'longer body'},{url:'https://blog.naver.com/a/456',excerpt:'different'}]);
 assert.equal(result.length,2);assert.equal(result[0].excerpt,'longer body');assert.notEqual(result[0].sourceId,result[1].sourceId);
 assert.equal(mergeEvidence([result[0]])[0].sourceId,result[0].sourceId);
});
test('다른 URL에 같은 본문이 있으면 독립 출처처럼 중복 계산하지 않는다',()=>{
 assert.equal(mergeEvidence([{url:'https://a.test/a',excerpt:'same content '.repeat(50)},{url:'https://b.test/b',excerpt:'same content '.repeat(50)}]).length,1);
});
test('403 차단 안내 본문을 수집 성공 근거로 취급하지 않는다',async()=>{
 const server=http.createServer((req,res)=>res.writeHead(403).end('Medical institution authority text '.repeat(50)));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const result=await s.fetchCandidateContent({url:'http://127.0.0.1:'+server.address().port+'/'});assert.equal(result.contentLength,0);assert.equal(result.excerpt,'');}
 finally{await new Promise(resolve=>server.close(resolve));}
});
