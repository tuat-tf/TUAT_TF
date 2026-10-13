// Exercise the actual gateway handler with synthetic credentials and in-memory I/O.
// No listening sockets, environment files, DB, Auth service or external requests are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(sourceDirectory, 'gateway.mjs'), 'utf8')
  .replace(/^import .*?;\r?\n/gm, '')
  .replaceAll('import.meta.dirname', JSON.stringify(sourceDirectory));
const hash = value => createHash('sha256').update(value).digest('hex');
const device = 'd'.repeat(64);

function gateway({ connected = false, expired = false, loginDelay, authFailure = false, redirectTo, upstreamCookies = [], persistenceFailure, failSaves = 1, fixedEntry = false } = {}) {
  const config = {
    project: 'tuat-quality-review', origin: 'http://127.0.0.1:18000',
    restPassword: 'r'.repeat(64), accessCode: 'a'.repeat(64),
    anonKey: 'synthetic-anon', serviceKey: 'synthetic-service',
    ownerEmail: 'review-owner@example.invalid', ownerPassword: 'synthetic-password',
    ownerId: '00000000-0000-4000-8000-000000000001',
  };
  let stored = { deviceHash: connected || expired ? hash(device) : null, expiresAt: expired ? Date.now() - 1 : connected ? Date.now() + 60_000 : 0, publicOrigin: 'https://review-only.example.invalid' };
  if (fixedEntry) Object.assign(stored, { publicOrigin: 'https://tuat-review.track-app.workers.dev', tunnelOrigin: 'https://gateway-bridge.trycloudflare.com' });
  const temporaryFiles = new Map();
  let saveFailures = failSaves;
  const requests = [], logins = [];
  let handler;
  runInNewContext(source, {
    Buffer, Headers, URL, URLSearchParams, AbortSignal, Date, Map, Error,
    createHash, timingSafeEqual, randomBytes, resolve,
    console: { log() {} }, process: { on() {} },
    readFileSync: path => JSON.stringify(path.endsWith('config.json') ? config : stored),
    chmodSync() {},
    writeFileSync: (path, value) => {
      if (persistenceFailure === 'write' && saveFailures-- > 0) throw new Error('Synthetic write failure');
      temporaryFiles.set(path, JSON.parse(value));
    },
    renameSync: from => {
      if (persistenceFailure === 'rename' && saveFailures-- > 0) throw new Error('Synthetic rename failure');
      stored = temporaryFiles.get(from);
      temporaryFiles.delete(from);
    },
    unlinkSync: path => temporaryFiles.delete(path),
    createServer: callback => { handler = callback; return { listen() {}, close() {} }; },
    createServerClient: (url, key, options) => ({ auth: {
      async signInWithPassword(input) {
        logins.push({ url, key, options, input });
        if (loginDelay) await loginDelay();
        if (authFailure) return { data: { session: null, user: null }, error: new Error('Synthetic Auth unavailable') };
        options.cookies.setAll([{ name: 'sb-pc-trial-auth', value: 'synthetic-auth-cookie', options: { maxAge: 3600 } }]);
        return { data: { session: { access_token: 'synthetic-user-jwt' }, user: { id: config.ownerId } }, error: null };
      },
    } }),
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (upstreamCookies.length) {
        const headers = new Headers();
        for (const value of upstreamCookies) headers.append('set-cookie', value);
        return new Response('synthetic upstream', { status: 200, headers });
      }
      return redirectTo
        ? new Response(null, { status: 302, headers: { location: redirectTo } })
        : new Response('synthetic upstream', { status: 200 });
    },
  }, { filename: resolve(sourceDirectory, 'gateway.mjs') });

  async function request(path, { method = 'GET', headers = {}, body = '', withDevice = connected, publicHost = false } = {}) {
    const host = publicHost ? 'review-only.example.invalid' : '127.0.0.1:18000';
    const request = {
      url: path, method, socket: { remoteAddress: '127.0.0.1' },
      headers: { host, ...(withDevice ? { cookie: `tuat-review-device=${device}; sb-pc-trial-auth=synthetic-auth-cookie` } : {}), ...headers },
      async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); },
    };
    const result = { status: 0, headers: {}, body: '', ended: false };
    const response = {
      headersSent: false,
      writeHead(status, values) { result.status = status; result.headers = values; this.headersSent = true; },
      write(chunk) { result.body += Buffer.isBuffer(chunk) ? chunk.toString() : Buffer.from(chunk).toString(); },
      end(body = '') { result.body += body; result.ended = true; },
    };
    await handler(request, response);
    assert.equal(result.ended, true);
    if ('content-length' in result.headers) assert.equal(result.headers['content-length'], Buffer.byteLength(result.body));
    return result;
  }
  const login = extra => request('/login', {
    method: 'POST', headers: { origin: config.origin }, body: new URLSearchParams({ code: config.accessCode }).toString(), ...extra,
  });
  return { request, login, requests, logins, config, state: () => stored, temporaryFiles };
}

test('unknown Host is rejected and no upstream is contacted', async () => {
  const app = gateway();
  assert.equal((await app.request('/home', { headers: { host: 'tuat-tf.vercel.app' } })).status, 421);
  assert.equal(app.requests.length, 0);
});

test('fixed entry uses only its pinned tunnel and retains browser authentication', async () => {
  const app = gateway({ fixedEntry: true });
  const headers = { host: 'gateway-bridge.trycloudflare.com', 'x-tuat-review-public-origin': 'https://tuat-review.track-app.workers.dev' };
  const result = await app.request('/home', { headers });
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, '/login');
  assert.equal(app.requests.length, 0);
  assert.equal((await app.request('/home', { headers: { ...headers, host: 'outside.trycloudflare.com' } })).status, 421);
  assert.equal((await app.request('/home', { headers: { ...headers, 'x-tuat-review-public-origin': 'https://outside.invalid' } })).status, 421);
});

test('fixed entry rejects a foreign write before application dispatch', async () => {
  const app = gateway({ fixedEntry: true, connected: true });
  const result = await app.request('/notes', { method: 'POST', body: 'synthetic', headers: { host: 'gateway-bridge.trycloudflare.com', 'x-tuat-review-public-origin': 'https://tuat-review.track-app.workers.dev', origin: 'https://outside.invalid' } });
  assert.equal(result.status, 403);
  assert.equal(app.requests.length, 0);
});

test('unauthorised pages stay at the same login URL and APIs require the device gate', async () => {
  const app = gateway();
  const page = await app.request('/home');
  assert.equal(page.status, 303);
  assert.equal(page.headers.location, '/login');
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles')).status, 401);
  assert.equal((await app.request('/api/schedule-page')).status, 401);
  assert.equal(app.requests.length, 0);
});

test('valid access logs in to the isolated Auth and returns only same-origin cookies and a relative home URL', async () => {
  const app = gateway();
  const result = await app.login();
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, '/home');
  assert.equal(app.logins.length, 1);
  assert.equal(app.logins[0].url, app.config.origin);
  assert.equal(app.logins[0].options.global.headers['x-tuat-review-internal'], app.config.restPassword);
  const setCookies = result.headers['set-cookie'];
  assert.ok(setCookies.some(value => value.startsWith('sb-pc-trial-auth=')));
  assert.ok(setCookies.some(value => value.startsWith('tuat-review-device=') && value.includes('HttpOnly')));
  assert.ok(setCookies.every(value => !/Domain=/i.test(value)));
  assert.ok(!JSON.stringify(result).includes('tuat-tf.vercel.app'));
});

test('a second browser is denied even with the access code or a valid Auth token', async () => {
  const app = gateway({ connected: true });
  assert.equal((await app.login({ withDevice: false })).status, 403);
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles', { withDevice: false, headers: { authorization: 'Bearer synthetic-user-jwt' } })).status, 401);
  assert.equal(app.logins.length, 0);
  assert.equal(app.requests.length, 0);
});

test('foreign and missing Origin cannot log in or mutate review data', async () => {
  const app = gateway({ connected: true });
  assert.equal((await app.login({ headers: { origin: 'https://tuat-tf.vercel.app' } })).status, 403);
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles', { method: 'PATCH' })).status, 403);
  assert.equal(app.logins.length, 0);
  assert.equal(app.requests.length, 0);
});

test('browser writes to external integrations are blocked before upstream work', async () => {
  const app = gateway({ connected: true });
  for (const path of ['/api/google/sheets/create', '/api/sheets/push-record', '/api/middle-long-menus', '/api/push/register', '/api/cron/cleanup-stories']) {
    assert.equal((await app.request(path, { method: 'POST', headers: { origin: app.config.origin } })).status, 403, path);
  }
  assert.equal(app.requests.length, 0);
});

test('encoding normal route letters cannot bypass the external integration or Auth restrictions', async () => {
  const app = gateway({ connected: true });
  for (const path of ['/api/%67oogle/sheets/create', '/%61pi/middle-long-menus', '/%61uth/callback']) {
    assert.equal((await app.request(path, { method: 'POST', headers: { origin: app.config.origin } })).status, 403, path);
  }
  assert.equal(app.requests.length, 0);
});

test('encoded separators, repeated encoding and malformed URL bytes cannot reach Next', async () => {
  const app = gateway({ connected: true });
  for (const path of ['/api%2fgoogle/sheets/create', '/api%5cgoogle/sheets/create', '/api/%2567oogle/sheets/create', '/api/%E0%A4%A']) {
    assert.equal((await app.request(path, { method: 'POST', headers: { origin: app.config.origin } })).status, 400, path);
  }
  assert.equal(app.requests.length, 0);
});

test('browser database calls use only the review REST endpoint and do not forward private transport credentials', async () => {
  const app = gateway({ connected: true });
  const result = await app.request('/_pc/supabase/rest/v1/profiles?select=id', { headers: { authorization: 'Bearer synthetic-user-jwt' } });
  assert.equal(result.status, 200);
  assert.equal(app.requests[0].url, 'http://127.0.0.1:18002/profiles?select=id');
  assert.equal(app.requests[0].init.headers.get('x-tuat-review-internal'), null);
});

test('private SSR Auth and REST calls work without browser cookies or Origin', async () => {
  const app = gateway();
  const headers = { 'x-tuat-review-internal': app.config.restPassword };
  assert.equal((await app.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await app.request('/rest/v1/profiles', { headers })).status, 200);
  assert.deepEqual(app.requests.map(value => value.url), ['http://127.0.0.1:18001/token?grant_type=refresh_token', 'http://127.0.0.1:18002/profiles']);
});

test('a forged private transport credential cannot open the device gate', async () => {
  const app = gateway();
  const result = await app.request('/_pc/supabase/rest/v1/profiles', { headers: { 'x-tuat-review-internal': 'wrong-private-key' } });
  assert.equal(result.status, 401);
  assert.equal(app.requests.length, 0);
});

test('browser service-role credentials are denied even after the device gate', async () => {
  const app = gateway({ connected: true });
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles', { headers: { apikey: app.config.serviceKey } })).status, 403);
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles', { headers: { authorization: `Bearer ${app.config.serviceKey}` } })).status, 403);
  assert.equal(app.requests.length, 0);
});

test('production and other external redirects never leave the review origin', async () => {
  const app = gateway({ connected: true, redirectTo: 'https://tuat-tf.vercel.app/home' });
  const result = await app.request('/home');
  assert.equal(result.status, 502);
  assert.equal(result.headers.location, undefined);
});

test('local upstream redirects become relative paths on the phone URL', async () => {
  const app = gateway({ connected: true, redirectTo: 'http://127.0.0.1:18003/mypage?setup=1' });
  const result = await app.request('/home', { publicHost: true });
  assert.equal(result.status, 302);
  assert.equal(result.headers.location, '/mypage?setup=1');
  assert.equal(app.requests[0].init.headers.get('x-forwarded-host'), 'review-only.example.invalid');
  assert.equal(app.requests[0].init.headers.get('x-forwarded-proto'), 'https');
});

test('same-origin logout releases the one-browser gate and removes its cookies', async () => {
  const app = gateway({ connected: true });
  const result = await app.request('/_pc/logout', { method: 'POST', headers: { origin: app.config.origin } });
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, '/login');
  assert.ok(!app.state().deviceHash || app.state().expiresAt <= Date.now());
  assert.ok(result.headers['set-cookie'].some(value => value.startsWith('tuat-review-device=') && value.includes('Max-Age=0')));
  assert.ok(result.headers['set-cookie'].some(value => value.startsWith('sb-pc-trial-auth=') && value.includes('Max-Age=0')));
  assert.equal(app.requests.length, 0);
});

test('phone URL login uses secure same-origin cookies and keeps the relative home URL', async () => {
  const app = gateway();
  const result = await app.login({ publicHost: true, headers: { origin: 'https://review-only.example.invalid' } });
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, '/home');
  assert.ok(result.headers['set-cookie'].every(value => value.includes('; Secure') && value.includes('; SameSite=Lax') && !/Domain=/i.test(value)));
  assert.equal(result.headers['cache-control'], 'no-store, private');
  assert.equal(result.headers['x-robots-tag'], 'noindex, nofollow');
});

test('HTTPS refresh keeps every Auth cookie chunk Secure without duplicating existing flags', async () => {
  const cookies = ['sb-pc-trial-auth.0=part-one; Path=/; SameSite=Lax', 'sb-pc-trial-auth.1=part-two; Path=/; SameSite=Lax; Secure'];
  const app = gateway({ connected: true, upstreamCookies: cookies });
  const result = await app.request('/home', { publicHost: true });
  assert.deepEqual(result.headers['set-cookie'], [cookies[0] + '; Secure', cookies[1]]);
});

test('loopback HTTP preserves upstream cookie flags for local review', async () => {
  const cookies = ['sb-pc-trial-auth=synthetic-session; Path=/; SameSite=Lax'];
  const app = gateway({ connected: true, upstreamCookies: cookies });
  const result = await app.request('/home');
  assert.deepEqual(result.headers['set-cookie'], cookies);
});

test('expired device access requires login and lets the owner replace the previous browser', async () => {
  const app = gateway({ expired: true });
  assert.equal((await app.request('/_pc/supabase/rest/v1/profiles', { withDevice: true })).status, 401);
  const result = await app.login();
  assert.equal(result.status, 303);
  assert.ok(app.state().expiresAt > Date.now());
  assert.notEqual(app.state().deviceHash, hash(device));
});

test('Auth failure leaves the gate unclaimed and permits a later login attempt', async () => {
  const app = gateway({ authFailure: true });
  assert.equal((await app.login()).status, 503);
  assert.equal((await app.login()).status, 503);
  assert.equal(app.state().deviceHash, null);
  assert.equal(app.state().expiresAt, 0);
  assert.equal(app.logins.length, 2);
  assert.equal(app.requests.length, 0);
});

for (const failure of ['write', 'rename']) {
  test(`a ${failure} failure issues no login cookies, preserves the old state and permits retry`, async () => {
    const app = gateway({ persistenceFailure: failure });
    const result = await app.login();
    assert.equal(result.status, 503);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(app.state().deviceHash, null);
    assert.equal(app.state().expiresAt, 0);
    assert.equal(app.temporaryFiles.size, 0);
    assert.equal((await app.login()).status, 303);
    assert.equal(app.logins.length, 2);
  });

  test(`a logout ${failure} failure keeps the connected browser usable until a successful retry`, async () => {
    const app = gateway({ connected: true, persistenceFailure: failure });
    const logout = () => app.request('/_pc/logout', { method: 'POST', headers: { origin: app.config.origin } });
    const result = await logout();
    assert.equal(result.status, 503);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(app.state().deviceHash, hash(device));
    assert.equal(app.temporaryFiles.size, 0);
    assert.equal((await app.request('/home')).status, 200);
    assert.equal((await logout()).status, 303);
    assert.equal(app.state().deviceHash, null);
  });
}

test('an unverified pre-existing device cookie is replaced during login', async () => {
  const app = gateway();
  const result = await app.login({ headers: { origin: app.config.origin, cookie: 'tuat-review-device=attacker-chosen' } });
  assert.equal(result.status, 303);
  const deviceCookie = result.headers['set-cookie'].find(value => value.startsWith('tuat-review-device='));
  assert.ok(!deviceCookie.includes('attacker-chosen'));
  assert.match(deviceCookie, /^tuat-review-device=[a-f0-9]{64};/);
});

test('simultaneous browser logins cannot both claim the device gate', async () => {
  let finishLogin, authEntered;
  const pause = new Promise(resolve => { finishLogin = resolve; });
  const entered = new Promise(resolve => { authEntered = resolve; });
  const app = gateway({ loginDelay: () => { authEntered(); return pause; } });
  const first = app.login();
  await entered;
  const second = app.login();
  await new Promise(resolve => setImmediate(resolve));
  finishLogin();
  const results = await Promise.all([first, second]);
  assert.equal(results.filter(value => value.status === 303).length, 1);
  assert.equal(app.logins.length, 1);
});
