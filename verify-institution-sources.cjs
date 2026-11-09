// Live public-source retrieval only. No login or AI calls.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {neckDeskSources}=require('./src/lib/institutionEvidence');
const {_private:s}=require('./src/lib/search');
const {_private:r}=require('./src/lib/codexRunner');
(async()=>{
 const options={topic:'오래 앉아 있을 때 목과 어깨가 뻐근한 이유와 일상에서 점검할 습관',keyword:'필라테스,운동정보,자주하면 좋은 동작'};
 const fetched=await Promise.all(neckDeskSources(options).map(seed=>s.fetchCandidateContent(seed)));
 const valid=fetched.filter(x=>x.contentLength>300);
 assert.ok(valid.some(x=>x.url.includes('nhs.uk')), 'NHS source retrieval failed');
 assert.ok(valid.some(x=>x.url.includes('osha.gov')||x.url.includes('hse.gov.uk')), 'Workstation source retrieval failed');
 const profile={...s.buildSearchProfile(options),strictEvidence:true,authorityEvidence:true};
 const enriched=valid.map(x=>({...x,relevance:s.scoreCandidate(x,[],options,profile)}));
 for(const x of enriched)assert.ok(x.relevance.topicMatchedTerms.length>0);
 const prompt=r.buildResearchTitleRetryPrompt({...options,jobDir:'.',searchResults:enriched},{});
 for(const x of enriched)assert.ok(prompt.includes(x.url));
 fs.mkdirSync('verification-output',{recursive:true});
 const report=fetched.map(x=>({url:x.url,chars:x.contentLength,usable:x.contentLength>300}));
 fs.writeFileSync('verification-output/institution-sources.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({realSourceRetrieval:true,aiUsed:false,sources:report}));
})().catch(e=>{console.error(e);process.exitCode=1});
