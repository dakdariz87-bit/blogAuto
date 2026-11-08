const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _private: { runCodexTask } } = require('./src/lib/codexRunner');
const { JobProgress } = require('./src/lib/jobProgress');

function fixture(t, response, mode = 'normal') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-result 한글 & '));
  const bin = path.join(root, 'node_modules', '@openai', 'codex', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const config = { response, mode };
  fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(bin, 'codex.js'), `
const fs=require('fs'),path=require('path');const config=JSON.parse(fs.readFileSync('fixture.json'));const args=process.argv.slice(2);
fs.writeFileSync('actual-args.json',JSON.stringify(args));let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>prompt+=d);process.stdin.on('end',()=>{
 fs.writeFileSync('actual-prompt.txt',prompt);
 const out=args[args.indexOf('--output-last-message')+1];
 const response=typeof config.response==='string'?config.response:JSON.stringify(config.response);
 if(config.mode!=='stdout-only')fs.writeFileSync(out,response);
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:response}}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:50,output_tokens:100}}));
 if(config.mode==='exit-error')process.exitCode=1;
});`);
  const cmd = path.join(root, 'codex.cmd'); fs.writeFileSync(cmd, 'fixture');
  const originalHome = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(root, 'empty-home');
  t.after(() => { if (originalHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = originalHome; fs.rmSync(root, { recursive: true, force: true }); });
  return { root, cmd };
}
async function task(f, fileName = 'research-title-result.json', onTaskProgress = () => {}) {
  return runCodexTask({ options: { jobDir: f.root, codexCmdPath: f.cmd, agentModels: { research: 'high', writer: 'high' }, onTaskProgress }, prompt: 'Required output: JSON object. Output JSON path: result', promptFileName: 'prompt.txt', resultFileName: fileName, agent: fileName === 'agent-result.json' ? 'writer' : 'research' });
}
test('모델이 결과 파일을 쓰지 않아도 CLI 최종 응답을 앱이 저장한다', async t => {
  const f = fixture(t, { status: 'PASS', finalTitle: '목과 어깨를 위한 자세 점검', searchNeed: 'skip' });
  const phases = []; const result = await task(f, undefined, p => phases.push(p));
  assert.equal(result.finalTitle, '목과 어깨를 위한 자세 점검');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'research-title-result.json'))).status, 'PASS');
  const args = JSON.parse(fs.readFileSync(path.join(f.root, 'actual-args.json')));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(args.includes('--output-last-message')); assert.equal(phases.at(-1).state, 'completed');
  assert.match(fs.readFileSync(path.join(f.root, 'actual-prompt.txt'), 'utf8'), /application saves/i);
});
test('긴 한국어 본문의 마지막 문단까지 저장한다', async t => {
  const article = ('자세는 편안하게 조절하세요.\n\n').repeat(1500) + '마지막 문단입니다.';
  const f = fixture(t, { status: 'success', title: '앉은 자세 점검', article });
  const result = await task(f, 'agent-result.json'); assert.equal(result.article, article);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'agent-result.json'))).article, article);
});
test('최종 응답 파일이 없어도 완료된 assistant JSON 이벤트에서 결과를 받는다', async t => {
  const f = fixture(t, { status: 'PASS', finalTitle: '완성된 제목' }, 'stdout-only');
  assert.equal((await task(f)).finalTitle, '완성된 제목');
});
test('JSON 대신 작업 예정 설명만 반환하면 성공 처리하거나 자동 재호출하지 않는다', async t => {
  const f = fixture(t, '본문을 작성하겠습니다. BLOGAUTO_RESULT_READY');
  const phases = []; await assert.rejects(task(f, undefined, p => phases.push(p)), { code: 'CODEX_RESULT_INVALID' });
  assert.equal(phases.some(p => p.state === 'completed'), false);
  assert.equal(fs.existsSync(path.join(f.root, 'research-title-result.json')), false);
});
test('CLI가 실패한 경우 저장된 응답이 있어도 작업을 성공 처리하지 않는다', async t => {
  const f = fixture(t, { status: 'PASS', finalTitle: '제목' }, 'exit-error');
  await assert.rejects(task(f), /종료 코드 1/);
});
test('단계 진행률은 역행하지 않고 실패를 100%로 표시하지 않는다', () => {
  const p = new JobProgress(); p.status('generating'); p.task({ agent: 'research', state: 'completed' });
  assert.equal(p.snapshot().percent, 30);
  p.task({ agent: 'writer', state: 'started' }); assert.equal(p.snapshot().percent, 35);
  p.task({ agent: 'research', state: 'started' }); assert.equal(p.snapshot().percent, 35);
  p.status('failed', '본문 결과 누락'); assert.equal(p.snapshot().percent, 35); assert.equal(p.snapshot().terminal, true);
  p.task({ agent: 'image', state: 'completed' }); assert.equal(p.snapshot().percent, 35);
  const next = new JobProgress(); next.status('generated'); assert.equal(next.snapshot().percent, 100);
});
