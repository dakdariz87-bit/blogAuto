import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';

export function parsePost(markdown) {
  const title = markdown.match(/^# (.+)$/m)?.[1]?.trim();
  const body = markdown.replace(/^# .+\r?\n/, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^## /gm, '').replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)').trim();
  if (!title || !body) throw new Error('제목 또는 본문이 없습니다.');
  return { title, body };
}

export async function fillEmptyEditor(page, post) {
  const candidates = [];
  for (const frame of page.frames()) {
    const title = frame.locator('.se-documentTitle [contenteditable="true"]');
    const body = frame.locator('.se-main-container .se-component.se-text [contenteditable="true"]');
    if (await title.count() === 1 && await body.count() === 1 &&
        await title.isVisible() && await body.isVisible()) candidates.push({ title, body });
  }
  if (candidates.length !== 1) throw new Error('빈 편집기 영역을 정확히 찾지 못했습니다. 기존 글 또는 복구 안내를 확인하세요.');
  const { title, body } = candidates[0];
  if ((await title.innerText()).trim() || (await body.innerText()).trim()) {
    throw new Error('기존 내용이 있어 자동 입력을 중단했습니다. 새 빈 글에서만 실행하세요.');
  }
  await title.click();
  await page.keyboard.insertText(post.title);
  await body.click();
  await page.keyboard.insertText(post.body);
  const actual = (await body.innerText()).replace(/\s+/g, ' ').trim();
  if (!actual.includes(post.body.slice(0, 20).replace(/\s+/g, ' ').trim())) {
    throw new Error('본문 입력 결과를 확인하지 못했습니다. 화면을 직접 확인하세요. 재실행하지 마세요.');
  }
}

async function main() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const post = parsePost(await readFile(path.join(root, 'posts/001-posture.md'), 'utf8'));
  const local = path.join(root, '.local');
  await mkdir(local, { recursive: true });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let context;
  try {
    const browserOptions = {};
    if (process.platform === 'win32') {
      const locations = [
        [process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'],
        [process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
        [process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'],
        [process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
        [process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
        [process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ].filter(parts => parts[0]).map(parts => path.join(...parts));
      browserOptions.executablePath = locations.find(candidate => existsSync(candidate));
      if (!browserOptions.executablePath) throw new Error('Chrome 또는 Edge를 설치한 뒤 다시 실행해주세요.');
      console.log('PC에 설치된 브라우저를 사용합니다. 별도 브라우저 다운로드는 없습니다.');
    }
    context = await chromium.launchPersistentContext(path.join(local, 'browser-profile'), {
      ...browserOptions, headless: false, viewport: null, args: ['--start-maximized'],
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
    console.log('\n열린 브라우저에서 직접 로그인하세요. 비밀번호는 이 창에 입력하지 마세요.');
    await rl.question('로그인 완료 후 Enter: ');
    await page.goto('https://blog.naver.com/PostWriteForm.naver?blogId=dakdariz', { waitUntil: 'domcontentloaded' });
    console.log('\n새 글 편집기를 열고 복구·도움말 안내를 직접 닫아주세요.');
    console.log('다른 계정이면 닫으세요. 기존 글이 있으면 입력하지 않습니다.');
    const answer = await rl.question('대상 블로그 dakdariz의 빈 새 글인지 확인 후 dakdariz 입력: ');
    if (answer.trim() !== 'dakdariz') throw new Error('계정 확인이 취소됐습니다.');
    if (page.url().includes('nid.naver.com')) throw new Error('로그인이 완료되지 않았습니다.');
    await fillEmptyEditor(page, post);
    console.log('\n제목과 본문을 입력했습니다. 아직 발행하지 않았습니다.');
    console.log('브라우저에서 사진 버튼으로 이전 대화의 일러스트를 직접 첨부하세요.');
    console.log('제목·본문·사진·대상 계정을 검토한 뒤 원하시면 네이버 발행 버튼을 직접 누르세요.');
    console.log('이 테스트 버전은 사진 첨부와 발행 버튼 클릭을 자동으로 처리하지 않습니다.');
    await rl.question('검토 및 게시를 마쳤거나 종료하려면 Enter: ');
    const published = (await rl.question('게시했다면 실제 게시물 주소를 붙여주세요. 미게시이면 Enter: ')).trim();
    let publishedUrl = null;
    if (published) {
      const url = new URL(published);
      if (!['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) || url.protocol !== 'https:') {
        throw new Error('네이버 블로그 HTTPS 게시물 주소만 기록할 수 있습니다.');
      }
      publishedUrl = url.href;
    }
    await writeFile(path.join(local, 'last-result.json'), JSON.stringify({
      target_blog_id: 'dakdariz', status: publishedUrl ? 'user_reported_published_unverified' : 'draft_entered',
      published_url: publishedUrl, independently_verified: false, timestamp: new Date().toISOString(),
    }, null, 2));
    console.log('로컬 결과를 기록했습니다. GitHub 발행 상태는 자동 변경하지 않습니다.');
  } finally {
    rl.close();
    if (context) await context.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('\n중단:', error.message); process.exitCode = 1; });
}
