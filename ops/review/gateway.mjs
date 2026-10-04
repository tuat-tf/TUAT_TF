// One-browser review access and same-origin API. Never load production environment files.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.contingency/review');
const config = JSON.parse(readFileSync(resolve(directory, 'config.json'), 'utf8'));
if (config.project !== 'tuat-quality-review' || config.origin !== 'http://127.0.0.1:18000') throw Error('Invalid review scope');
// Atomic state files inherit the same private directory ACL as the review secrets.
if (process.platform === 'win32') {
  const account = execFileSync('whoami', { encoding: 'utf8', windowsHide: true }).trim();
  execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)(F)`, 'SYSTEM:(OI)(CI)(F)'], { stdio: 'ignore', windowsHide: true });
} else {
  chmodSync(directory, 0o700);
}
const statePath = resolve(directory, 'device.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookies = request => (request.headers.cookie ?? '').split(';').flatMap(value => {
  const at = value.indexOf('='); return at < 0 ? [] : [{ name: value.slice(0,at).trim(), value: value.slice(at+1) }];
});
const connected = request => {
  const token = cookies(request).find(value => value.name === 'tuat-review-device')?.value;
  return !!token && equal(hash(token), state.deviceHash) && Date.now() < state.expiresAt;
};
const approvedOrigin = request => {
  const host = request.headers.host ?? '';
  if (host === '127.0.0.1:18000' || host === 'localhost:18000') return `http://${host}`;
  return state.publicOrigin && host === new URL(state.publicOrigin).host ? state.publicOrigin : null;
};
const saveState = next => {
  const temporary = `${statePath}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, statePath);
    Object.assign(state, next);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed, or retain the old state on failure. */ }
  }
};
const write = (response, status, body, headers={}) => {
  response.writeHead(status, { 'content-length':Buffer.byteLength(body), 'cache-control':'no-store, private', 'x-robots-tag':'noindex, nofollow', 'x-content-type-options':'nosniff', ...headers });
  response.end(body);
};
const redirect = (response, path, setCookies=[]) => write(response, 303, '', { location: path, 'set-cookie': setCookies });
const json = (response, status, message) => write(response,status,JSON.stringify({ error:message }), { 'content-type':'application/json' });
const loginPage = message => `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TUAT T&F 検証版</title><style>body{font:16px system-ui;background:#f2f2f7;padding:24px;margin:auto;max-width:420px}main{margin-top:15vh}input,button{box-sizing:border-box;width:100%;min-height:48px;margin-top:12px;border-radius:12px;border:1px solid #aaa;padding:12px;font:inherit}button{background:#1160cc;color:white}p{line-height:1.6}.error{color:#b21}</style><main><h1>TUAT T&F 検証版</h1><p>テストデータだけを使います。変更は本番へ反映されません。</p>${message?'<p class="error" role="alert">'+message+'</p>':''}<form method="post" action="/login"><label for="code">本人用アクセスコード</label><input id="code" name="code" type="password" autocomplete="off" required maxlength="100"><button type="submit">検証版を開く</button></form></main></html>`;
async function bodyOf(request, max=1024*1024) {
  let size=0; const chunks=[];
  for await (const chunk of request) { size+=chunk.length; if(size>max) throw Error('too-large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const externalApi = /^\/api\/(?:google|sheets|sheet-sync|schedule-sheets|menu-sheets|middle-long-menus|competition-program\/sync|push|cron|legacy-access|admin\/services|pc-supabase)(?:\/|$)/;
const attempts = new Map();
let loginInProgress = false;
const server = createServer(async (request, response) => {
  try {
    const origin = approvedOrigin(request);
    if (!origin) return json(response,421,'検証版のURLで開いてください');
    const url = new URL(request.url,origin);
    let pathname;
    try { pathname=decodeURIComponent(url.pathname); } catch { return json(response,400,'操作先を確認できません'); }
    const internal = request.headers['x-tuat-review-internal'] && equal(request.headers['x-tuat-review-internal'],config.restPassword);
    const method = request.method ?? 'GET';
    if (!['GET','HEAD','OPTIONS'].includes(method) && !internal && request.headers.origin !== origin) return json(response,403,'操作元を確認できません');
    // Reject encoded separators before route matching; Next must not decode an external route later.
    if (/%(?:2f|5c|25)/i.test(url.pathname) || pathname.includes('\\')) return json(response,400,'操作先を確認できません');
    if (externalApi.test(pathname) || !internal && /^\/auth(?:\/|$)/.test(pathname)) return json(response,403,'検証版では外部連携を停止しています');
    if (url.pathname === '/login') {
      if (method === 'GET') return write(response,200,loginPage(''),{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
      if (method !== 'POST') return json(response,405,'操作を確認してください');
      const address=request.socket.remoteAddress??'';
      const attempt=attempts.get(address)??{count:0,until:0};
      if (Date.now()<attempt.until) return json(response,429,'少し待ってからお試しください');
      const form = new URLSearchParams((await bodyOf(request,4096)).toString());
      if (!equal(form.get('code'),config.accessCode)) {
        attempt.count++; if(attempt.count>=5){attempt.until=Date.now()+15*60000;attempt.count=0;} attempts.set(address,attempt);
        return write(response,401,loginPage('アクセスコードを確認してください'),{'content-type':'text/html; charset=utf-8'});
      }
      if (state.deviceHash && Date.now()<state.expiresAt && !connected(request)) return write(response,403,loginPage('別のブラウザで使用中です。本人用の接続を解除してから開いてください'),{'content-type':'text/html; charset=utf-8'});
      if (loginInProgress) return json(response,409,'ログイン処理中です。少し待ってから開いてください');
      loginInProgress = true;
      try {
      const outgoing=[];
      const auth=createServerClient(config.origin,config.anonKey,{cookieOptions:{name:'sb-pc-trial-auth'},global:{headers:{'x-tuat-review-internal':config.restPassword}},cookies:{getAll:()=>cookies(request),setAll:values=>outgoing.push(...values)}});
      const {data,error}=await auth.auth.signInWithPassword({email:config.ownerEmail,password:config.ownerPassword});
      if(error||!data.session||data.user.id!==config.ownerId) return json(response,503,'検証用ログインを完了できません');
      const token=connected(request)?cookies(request).find(value=>value.name==='tuat-review-device').value:randomBytes(32).toString('hex');
      saveState({...state,deviceHash:hash(token),expiresAt:Date.now()+7*86400000});attempts.delete(address);
      const secure=origin.startsWith('https:')?'; Secure':'';
      const setCookies=outgoing.map(value=>`${value.name}=${value.value}; Path=/; SameSite=Lax${secure}${value.options.maxAge!==undefined?'; Max-Age='+value.options.maxAge:''}`);
      setCookies.push(`tuat-review-device=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
      return redirect(response,'/home',setCookies);
      } finally { loginInProgress = false; }
    }
    const allowed=internal||connected(request);
    if (!allowed) return url.pathname.startsWith('/api/')||url.pathname.startsWith('/_pc/')?json(response,401,'本人用ログインが必要です'):redirect(response,'/login');
    if (url.pathname === '/_pc/logout') {
      if (method !== 'POST' || !connected(request)) return json(response,403,'本人用の接続解除を確認できません');
      const secure=origin.startsWith('https:')?'; Secure':'';
      const names=new Set(['tuat-review-device','sb-pc-trial-auth',...cookies(request).filter(value=>value.name.startsWith('sb-pc-trial-auth.')).map(value=>value.name)]);
      saveState({...state,deviceHash:null,expiresAt:0});
      return redirect(response,'/login',[...names].map(name=>`${name}=; Path=/; SameSite=Lax; Max-Age=0${secure}${name==='tuat-review-device'?'; HttpOnly':''}`));
    }
    let target;
    const headers=new Headers();
    for(const [name,value] of Object.entries(request.headers)) if(value && !['host','connection','content-length','x-tuat-review-internal'].includes(name)) headers.set(name,Array.isArray(value)?value.join(','):value);
    if (url.pathname.startsWith('/_pc/supabase/') || internal && /^(?:\/auth|\/rest)\/v1\//.test(url.pathname)) {
      const path=url.pathname.replace(/^\/_pc\/supabase/,'');
      if(path.startsWith('/auth/v1/')) target=`http://127.0.0.1:18001${path.replace('/auth/v1','')}${url.search}`;
      else if(path.startsWith('/rest/v1/')) target=`http://127.0.0.1:18002${path.replace('/rest/v1','')}${url.search}`;
      else return json(response,403,'検証版ではこの連携を停止しています');
      if(!internal&&(headers.get('apikey')===config.serviceKey||headers.get('authorization')===`Bearer ${config.serviceKey}`)) return json(response,403,'操作を確認できません');
    } else {
      target=`http://127.0.0.1:18003${url.pathname}${url.search}`;
      headers.set('x-forwarded-host',new URL(origin).host);headers.set('x-forwarded-proto',new URL(origin).protocol.slice(0,-1));
    }
    const body=['GET','HEAD'].includes(method)?undefined:await bodyOf(request);
    const upstream=await fetch(target,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(60000)});
    const outgoing=new Headers();
    upstream.headers.forEach((value,name)=>{if(!['connection','transfer-encoding','content-encoding','content-length','set-cookie'].includes(name))outgoing.set(name,value);});
    const location=outgoing.get('location');
    if(location){const destination=new URL(location,target);if(destination.origin!=='http://127.0.0.1:18003'&&destination.origin!==origin)return json(response,502,'検証版の移動先を確認できません');outgoing.set('location',destination.pathname+destination.search+destination.hash);}
    outgoing.set('cache-control','no-store, private');outgoing.set('x-tuat-environment','review');outgoing.set('x-robots-tag','noindex, nofollow');
    const finalHeaders=Object.fromEntries(outgoing);
    // SSR sees loopback HTTP, but the phone's session stays HTTPS after refresh too.
    finalHeaders['set-cookie']=upstream.headers.getSetCookie().map(value=>origin.startsWith('https:')&&!/;\s*secure(?:;|$)/i.test(value)?`${value}; Secure`:value);
    response.writeHead(upstream.status,finalHeaders);
    if(upstream.body)for await(const chunk of upstream.body)response.write(chunk);
    response.end();
  }catch(error){if(!response.headersSent)json(response,error.message==='too-large'?413:503,'検証版に接続できません');else response.end();}
});
server.listen(18000,'127.0.0.1',()=>console.log('Independent review gateway listening on loopback 18000.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
