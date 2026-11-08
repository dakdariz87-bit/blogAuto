const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');

function invocation(command, args, env = process.env) {
  if (!/\.(cmd|bat)$/i.test(command)) return { file: command, args, env };
  let resolved = command;
  if (!path.isAbsolute(resolved)) {
    const pathValue = env.Path || env.PATH || '';
    resolved = pathValue.split(path.delimiter).map(dir => path.join(dir, command)).find(file => fs.existsSync(file)) || command;
  }
  const dir = path.dirname(resolved);
  const entry = [path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), path.join(dir, '..', '@openai', 'codex', 'bin', 'codex.js')].find(file => fs.existsSync(file));
  if (!entry) throw new Error('Codex CLI를 찾지 못했습니다. 바로실행.cmd로 다시 실행해주세요.');
  return { file: process.execPath, args: [entry, ...args], env: { ...env, ELECTRON_RUN_AS_NODE: '1' } };
}

class CodexConnection {
  constructor(command, { cwd, timeoutMs = 20000, env = process.env, onLogin = () => {} } = {}) {
    this.command = command; this.cwd = cwd; this.timeoutMs = timeoutMs; this.env = env; this.onLogin = onLogin;
    this.pending = new Map(); this.nextId = 0;
  }
  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const cmd = invocation(this.command, ['app-server'], this.env);
      const child = this.child = spawn(cmd.file, cmd.args, { cwd: this.cwd, env: cmd.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stderr.on('data', () => {}); // Never expose raw auth diagnostics or OAuth URLs.
      const fail = () => {
        for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Codex 연결이 종료됐습니다. 연결 상태 확인을 다시 눌러주세요.')); }
        this.pending.clear(); this.ready = null;
      };
      child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail);
      readline.createInterface({ input: child.stdout }).on('line', line => {
        let message; try { message = JSON.parse(line); } catch { return; }
        if (message.id !== undefined && this.pending.has(message.id)) {
          const item = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(item.timer);
          // Do not forward server diagnostics: these can contain auth details.
          if (message.error) item.reject(new Error('Codex 요청을 처리하지 못했습니다 (' + (message.error.code || '서버 오류') + '). 바로실행.cmd로 CLI를 확인해주세요.'));
          else item.resolve(message.result);
        } else if (message.method === 'account/login/completed') {
          this.loginId = null; clearTimeout(this.loginExpiry);
          this.onLogin({ success: message.params?.success === true });
        }
      });
      try {
        await this.request('initialize', { clientInfo: { name: 'blogauto_naver', title: 'BlogAuto', version: '0.2.0' }, capabilities: {} });
        child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
      } catch (error) { this.close(); throw error; }
    })();
    return this.ready;
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex 응답이 '+Math.ceil(this.timeoutMs/1000)+'초 안에 오지 않았습니다. 연결 상태 확인을 다시 눌러주세요.')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => {
        if (error && this.pending.has(id)) { this.pending.delete(id); clearTimeout(timer); reject(new Error('Codex에 연결할 수 없습니다.')); }
      });
    });
  }
  async status() {
    await this.start();
    const result = await this.request('account/read', { refreshToken: false });
    const account = result.account;
    return { connected: !!account, type: account?.type || '', label: account?.type === 'chatgpt' ? 'ChatGPT · ' + (account.email || '로그인됨') : account ? 'Codex 기존 인증 연결됨' : '연결 필요', plan: account?.planType || '' };
  }
  async models() {
    await this.start(); const all = []; let cursor = null;
    for (let page = 0; page < 10; page++) {
      const result = await this.request('model/list', { limit: 100, cursor, includeHidden: false });
      for (const model of result.data || []) {
        const id = model.model || model.id;
        if (/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(id || '')) all.push({ id, name: model.displayName || id, isDefault: !!model.isDefault });
      }
      cursor = result.nextCursor; if (!cursor) break;
    }
    return all.filter((model, index) => all.findIndex(other => other.id === model.id) === index);
  }
  async login() {
    await this.start();
    if (this.loginId) return { waiting: true };
    const result = await this.request('account/login/start', { type: 'chatgpt' });
    if (result.type !== 'chatgpt' || !safeLoginUrl(result.authUrl)) throw new Error('공식 로그인 주소를 확인하지 못했습니다.');
    this.loginId = result.loginId;
    this.loginExpiry = setTimeout(() => { this.cancelLogin().catch(() => {}); }, 10 * 60 * 1000);
    this.loginExpiry.unref?.();
    return { authUrl: result.authUrl };
  }
  async cancelLogin() {
    if (!this.loginId) return;
    const loginId = this.loginId; this.loginId = null; clearTimeout(this.loginExpiry);
    await this.request('account/login/cancel', { loginId });
  }
  close() {
    clearTimeout(this.loginExpiry);
    if (this.child?.pid && this.child.exitCode === null) {
      if (process.platform === 'win32') spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
      this.child.kill();
    }
    this.ready = null;
  }
}
function safeLoginUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(u.hostname) && !u.username && !u.password; } catch { return false; }
}
module.exports = { CodexConnection, invocation, safeLoginUrl };
