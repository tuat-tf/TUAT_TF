// Browser acceptance against the independent Next build and synthetic database.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
const {chromium,webkit}=await import(pathToFileURL(resolve(process.argv[2])).href);
const directory=resolve(import.meta.dirname,'../../.contingency/review');
const config=JSON.parse(readFileSync(resolve(directory,'config.json'),'utf8'));
const ids=JSON.parse(readFileSync(resolve(directory,'seed.json'),'utf8'));
const state=JSON.parse(readFileSync(resolve(directory,'device.json'),'utf8'));
if(config.project!=='tuat-quality-review')throw Error('Invalid review scope');
const origin=state.publicOrigin;
if(!/^https:\/\/(?:[a-z0-9-]+\.trycloudflare\.com|tuat-review\.[a-z0-9-]+\.workers\.dev)$/.test(origin))throw Error('Review HTTPS origin missing');
const paths=['/home','/schedule','/timeline','/notices','/ranking','/members',`/members/${ids.owner}`,'/mypage','/mypage/settings','/mypage/settings/records','/mypage/pb','/mypage/monthly-results','/settings/sheet-setup','/competitions','/competitions/review-meet','/competitions/review-meet/manage','/competitions/review-meet/goals','/competitions/review-meet/program','/events','/goals','/goals/past','/venues','/notes',`/notes/${ids.note}`,`/notes/${ids.note}/articles/${ids.article}`,`/notes/threads/${ids.thread}`,'/ob-entries','/admin','/admin/services','/blog','/maintenance','/offline'];
const redirects={'/settings/sheet-setup':'/mypage/settings/records','/ob-entries':'/competitions/3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5/program'};
for(const [table,kind] of [['practice_records','record'],['tweets','tweet']]) {
  const response=await fetch(`http://127.0.0.1:18002/${table}?select=id&limit=1`,{headers:{authorization:`Bearer ${config.serviceKey}`}});
  if(!response.ok)throw Error('Synthetic timeline fixture not available');
  const rows=await response.json();if(rows[0])paths.push(`/timeline/${kind}/${rows[0].id}`);
}
const report={origin,engines:[],security:[]};
for(const [name,engine,width] of [['Chrome',chromium,390],['WebKit',webkit,320]]) {
  const browser=await engine.launch(name==='Chrome'?{channel:'chrome',headless:true}:{headless:true});
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>localStorage.setItem('tuat-ob-entry-prompt','done'));
  let page=await context.newPage();
  const pending=new Map();
  const blockedApi=/^\/api\/(?:google|sheets|sheet-sync|schedule-sheets|menu-sheets|middle-long-menus|competition-program\/sync|push|cron|legacy-access|admin\/services|pc-supabase)(?:\/|$)/;
  const errors=[];const errorContexts=[];const failedRequests=[];const foreign=new Set();
  let stage='login';
  function observe() {
    page.on('request',request=>{
    const headers=request.headers();
    if(headers['next-router-prefetch']||headers['next-router-segment-prefetch']||/prefetch/i.test(headers.purpose??headers['sec-purpose']??''))return;
    pending.set(request,{path:new URL(request.url()).pathname,kind:request.resourceType(),rsc:headers.rsc});
    });
    page.on('requestfinished',request=>pending.delete(request));
    page.on('requestfailed',request=>pending.delete(request));
  // The review intentionally rejects these integrations. An unread 403 fetch body can
  // remain in Playwright's networkidle accounting after the UI handled its status.
    page.on('response',response=>{if(response.status()===403&&blockedApi.test(new URL(response.url()).pathname))pending.delete(response.request());});
    page.on('pageerror',error=>{errors.push(error.message);errorContexts.push({stage,path:new URL(page.url()).pathname,message:error.message});});
    page.on('requestfailed',request=>failedRequests.push({stage,path:new URL(request.url()).pathname,prefetch:!!request.headers()['next-router-prefetch'],failure:request.failure()?.errorText}));
    page.on('request',request=>{const url=new URL(request.url());if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))foreign.add(url.origin);});
  }
  observe();
  async function freshPage() {
    // Test document loads separately from the real SPA tab flow above. Closing a
    // completed test page intentionally cancels its unused background prefetches.
    page.removeAllListeners();await page.close();pending.clear();
    page=await context.newPage();observe();
  }
  async function settle() {
    let quiet=Date.now();const deadline=quiet+20000;
    while(Date.now()<deadline) {
      if(pending.size)quiet=Date.now();
      else if(Date.now()-quiet>=600) {
        await page.getByRole('button',{name:'起動画面をスキップ'}).waitFor({state:'hidden',timeout:10000});
        return;
      }
      await page.waitForTimeout(100);
    }
    throw Error('Page still has unfinished application requests: '+JSON.stringify([...pending.values()]));
  }
  try {
  await page.goto(origin+'/home');
  if(new URL(page.url()).origin!==origin||!page.url().endsWith('/login'))throw Error('Unauthenticated navigation escaped review login');
  await page.getByLabel('本人用アクセスコード').fill(config.accessCode);
  await Promise.all([page.waitForURL('**/home'),page.getByRole('button',{name:'検証版を開く'}).click()]);
  await page.getByText('検証 オーナー',{exact:false}).first().waitFor({timeout:30000});
  if(process.argv[3]==='debug') {
    await page.waitForTimeout(5000);
    const initialErrors=errors.splice(0);
    await page.getByRole('link',{name:'予定',exact:true}).last().click();
    await page.waitForURL('**/schedule');await page.waitForTimeout(5000);
    console.log(JSON.stringify({name,initialErrors,navigationErrors:errors,failedRequests},null,2));
    await page.getByRole('button',{name:'検証版からログアウト'}).click();await page.waitForURL('**/login');
    await browser.close();continue;
  }
  const entry={name,width,pages:[],errors,errorContexts,failedRequests,redirects:[],foreignOrigins:[]};
  report.engines.push(entry);
  for(const [label,path] of [['予定','/schedule'],['タイムライン','/timeline'],['ノート','/notes'],['マイページ','/mypage'],['ホーム','/home']]) {
    stage='tab:'+path;
    await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('link',{name:label,exact:true}).click();
    await page.waitForURL(origin+path);await settle();
    if(new URL(page.url()).origin!==origin)throw Error('Tab navigation escaped review');
  }
  for(const path of paths) {
    stage='document:'+path;
    if(redirects[path]) {
      const redirectResponse=await context.request.get(origin+path,{maxRedirects:0});
      const location=redirectResponse.headers().location;
      if(redirectResponse.status()!==307||location!==redirects[path])throw Error('Legacy URL did not redirect before rendering');
      entry.redirects.push({path,status:redirectResponse.status(),location});
    }
    await freshPage();
    const started=Date.now();const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000});
    if(redirects[path])await page.waitForURL(origin+redirects[path]);
    await settle();
    const status=response?.status();
    const body=await page.locator('body').innerText();
    const problem=status!==200||new URL(page.url()).origin!==origin||/Application error|問題が発生しました|取得できませんでした。接続/.test(body);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    entry.pages.push({path,status,problem,overflow,ms:Date.now()-started});
    await page.screenshot({path:resolve(directory,`${name}-${path.replace(/[^a-z0-9]/gi,'_')}.png`),fullPage:path==='/home'||problem||overflow});
    if(path==='/blog') {
      const article=page.locator('main a[href^="/blog/"]').first();
      const href=await article.count()?await article.getAttribute('href'):null;
      entry.blogArticleAvailable=!!href;
      if(href&&!paths.includes(href))paths.push(href);
    }
  }
  entry.foreignOrigins=[...foreign];
  // Actual refresh and cookie isolation: a new review session, same origin and separate name.
  const cookieNames=(await context.cookies()).map(cookie=>cookie.name);
  if(!cookieNames.some(name=>name.startsWith('sb-pc-trial-auth'))||cookieNames.includes('sb-tuat-auth'))throw Error('Review session cookie is not isolated');
  if(name==='Chrome') {
    const unsupportedEntry=await context.request.get(origin+'/competitions/review-meet/entry',{maxRedirects:0});
    if(unsupportedEntry.status()!==404)throw Error('Non-OB legacy entry unexpectedly redirected');
    report.security.push({nonObLegacyEntryNotRedirected:true});
    const version=await (await context.request.get(origin+'/api/version')).json();
    if(version.version!==readFileSync(resolve(directory,'build-id.txt'),'utf8').trim())throw Error('Review version does not match its completed build');
    report.security.push({reviewBuildVersionVerified:true});
    const manifest=await (await context.request.get(origin+'/manifest.webmanifest')).json();
    if(!manifest.name.endsWith('検証版')||['id','start_url','scope'].some(key=>new URL(manifest[key],origin).origin!==origin)||manifest.start_url!=='/home')throw Error('Review manifest can leave its origin');
    const registrations=await page.evaluate(async()=>('serviceWorker' in navigator?(await navigator.serviceWorker.getRegistrations()).length:0));
    if(registrations!==0)throw Error('Review registered a persistent service worker');
    report.security.push({manifestUsesReviewOrigin:true,serviceWorkerRegistrations:0});
    const originalCookie=(await context.cookies()).find(cookie=>cookie.name==='sb-pc-trial-auth');
    if(!originalCookie)throw Error('Expected review session cookie missing');
    const session=JSON.parse(Buffer.from(originalCookie.value.slice(7),'base64url').toString());
    const foreignIdentity={...session,user:{...session.user,id:ids.members[0]}};
    await context.addCookies([{...originalCookie,value:'base64-'+Buffer.from(JSON.stringify(foreignIdentity)).toString('base64url')}]);
    await freshPage();await page.goto(origin+'/mypage');await settle();
    await page.getByRole('heading',{name:'検証 オーナー',exact:true}).waitFor();
    report.security.push({profileIdentityMatchesVerifiedToken:true});
    await context.addCookies([originalCookie]);
    const [header,payload]=session.access_token.split('.');
    const claims=JSON.parse(Buffer.from(payload,'base64url').toString());claims.exp=Math.floor(Date.now()/1000)-60;
    const expired=`${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    session.access_token=`${expired}.${createHmac('sha256',config.jwtSecret).update(expired).digest('base64url')}`;session.expires_at=claims.exp;
    await context.addCookies([{...originalCookie,value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}]);
    await freshPage();await page.goto(origin+'/home');await settle();
    const renewed=(await context.cookies()).find(cookie=>cookie.name==='sb-pc-trial-auth');
    const renewedSession=JSON.parse(Buffer.from(renewed.value.slice(7),'base64url').toString());
    if(renewedSession.access_token===session.access_token||renewedSession.expires_at<=Date.now()/1000||!page.url().endsWith('/home'))throw Error('Expired session did not refresh on the same origin');
    const deviceCookieSecure=(await context.cookies()).find(cookie=>cookie.name==='tuat-review-device')?.secure;
    if(!renewed.secure||!deviceCookieSecure)throw Error('HTTPS review cookies lost their Secure flag after refresh');
    report.security.push({expiredSessionRefreshedAtSameOrigin:true,renewedAuthCookieSecure:renewed.secure,deviceCookieSecure});
    const refresh=await page.evaluate(async()=>{const value=document.cookie.split('; ').find(value=>value.startsWith('sb-pc-trial-auth='))?.split('=').slice(1).join('=');if(!value)return false;const json=JSON.parse(atob(value.slice(7).replace(/-/g,'+').replace(/_/g,'/')));const response=await fetch('/_pc/supabase/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:json.refresh_token})});return response.ok;});
    report.security.push({refresh});
    const second=await browser.newContext();const outsider=await second.newPage();await outsider.goto(origin+'/login');await outsider.getByLabel('本人用アクセスコード').fill(config.accessCode);const refused=await Promise.all([outsider.waitForResponse(response=>response.url()===origin+'/login'&&response.request().method()==='POST'),outsider.getByRole('button',{name:'検証版を開く'}).click()]);if(refused[0].status()!==403)throw Error('Second browser was accepted');await second.close();report.security.push({secondBrowserRejected:true});
    for(const path of ['/auth/callback','/api/google/sheets/create','/api/middle-long-menus','/api/competition-program/sync','/api/pc-supabase/rest/v1/profiles','/api/%67oogle/sheets/create']) {
      const response=await context.request.get(origin+path);if(response.status()!==403)throw Error('External integration route was not blocked');
    }
    report.security.push({externalIntegrationsBlocked:true});
  }
  await freshPage();await page.goto(origin+'/home');await settle();await Promise.all([page.waitForURL('**/login'),page.getByRole('button',{name:'検証版からログアウト'}).click()]);
  if((await context.cookies()).some(cookie=>cookie.name==='tuat-review-device'||cookie.name.startsWith('sb-pc-trial-auth')))throw Error('Review logout left credentials');
  } finally {
    try { await context.request.post(origin+'/_pc/logout',{headers:{origin}}); } catch { /* Preserve a test failure while releasing the gate when reachable. */ }
    if(process.argv[3]!=='debug')writeFileSync(resolve(directory,'browser-report.json'),JSON.stringify(report,null,2),{mode:0o600});
    await browser.close();
  }
}
if(process.argv[3]!=='debug')writeFileSync(resolve(directory,'browser-report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({engines:report.engines.map(engine=>({name:engine.name,pages:engine.pages.length,problems:engine.pages.filter(page=>page.problem||page.overflow),errors:engine.errorContexts,failedRequests:engine.failedRequests,foreignOrigins:engine.foreignOrigins})),security:report.security},null,2));
if(report.engines.some(engine=>engine.errors.length||engine.pages.some(page=>page.problem||page.overflow)))process.exitCode=1;
