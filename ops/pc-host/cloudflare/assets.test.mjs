import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { ASSET_HEADERS, PUBLIC_ASSETS, prepareAssets, verifyAssetsBundle } from './prepare-assets.mjs';
import { validateConfig } from './check-config.mjs';
import worker from './worker.mjs';

const commit = 'a'.repeat(40);
const release = { commit, releaseId: 'release-a', buildHash: 'b'.repeat(64) };
async function put(root, path, value = 'synthetic') {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tuat-public-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'release');
  await put(source, '.next/BUILD_ID', 'build-a');
  await put(source, '.next/required-server-files.json', JSON.stringify({ config: { deploymentId: release.releaseId }, env: 'never publish' }));
  await put(source, '.next/static/chunks/app-a1.js', 'console.log("synthetic")');
  await put(source, '.next/static/css/style-a1.css', 'body{}');
  await put(source, '.next/static/media/font-a1.woff2', 'synthetic font');
  await put(source, '.next/static/chunks/app-a1.js.map', 'private source map');
  await put(source, '.next/server/app/page.html', 'private server output');
  await put(source, '.env.local', 'not a credential, must still be excluded');
  await put(source, 'public/private-image.jpg', 'not allowlisted');
  await put(source, 'public/sw.js', 'must remain on Next');
  for (const asset of PUBLIC_ASSETS) await put(source, `public/${asset}`, 'synthetic image');
  const output = join(root, 'bundle-a');
  return { root, source, output, args: { releaseDirectory: source, outputDirectory: output, release } };
}

test('only Next static files and explicit branding are public; receipt and source maps stay outside', async t => {
  const { output, args } = await fixture(t);
  const result = await prepareAssets(args);
  assert.equal(result.files.length, PUBLIC_ASSETS.length + 3);
  assert.equal(result.current.commit, commit);
  assert.deepEqual(result.current, { ...release, buildId: 'build-a' });
  assert.equal(result.files.some(file => /env|map$|server|private|sw\.js|manifest\.json/.test(file.path)), false);
  assert.equal(await readFile(join(output, 'assets/_headers'), 'utf8'), ASSET_HEADERS);
  assert.match(ASSET_HEADERS, /max-age=31536000, immutable/);
  for (const header of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', "Content-Security-Policy: frame-ancestors 'none'"]) {
    assert.equal(ASSET_HEADERS.split(header).length - 1, 3);
  }
  await assert.rejects(readFile(join(output, 'assets/manifest.json')), { code: 'ENOENT' });
  await assert.rejects(prepareAssets(args), { code: 'EEXIST' });
});

test('new release retains old Next files for open tabs and uses current unhashed branding', async t => {
  const { root, source, output, args } = await fixture(t);
  await prepareAssets(args);
  await put(source, '.next/static/chunks/app-new.js', 'new tab');
  await rm(join(source, '.next/static/chunks/app-a1.js'));
  await put(source, 'public/branding/summer-icon-192.png', 'new branding');
  const next = await prepareAssets({ ...args, outputDirectory: join(root, 'bundle-b'),
    release: { ...release, commit: 'c'.repeat(40) }, previousBundles: [output] });
  assert.equal(next.releases.length, 2);
  assert.ok(next.files.some(file => file.path === '_next/static/chunks/app-a1.js'));
  assert.ok(next.files.some(file => file.path === '_next/static/chunks/app-new.js'));
  assert.equal(await readFile(join(root, 'bundle-b/assets/branding/summer-icon-192.png'), 'utf8'), 'new branding');
  // The previous bundle remains valid, so reverting requires no regeneration of its contents.
  await verifyAssetsBundle(output);
});

test('old immutable filenames cannot silently be replaced by different bytes', async t => {
  const { root, source, output, args } = await fixture(t);
  await prepareAssets(args);
  await put(source, '.next/static/chunks/app-a1.js', 'different bytes at the same URL');
  await assert.rejects(prepareAssets({ ...args, outputDirectory: join(root, 'next'), previousBundles: [output] }), /collision/);
});

test('tampered or extra bundle files cannot be approved or reused', async t => {
  const { root, output, args } = await fixture(t);
  await prepareAssets(args);
  await put(output, 'assets/_next/static/chunks/extra.js', 'unlisted');
  await assert.rejects(verifyAssetsBundle(output), /Unlisted/);
  await rm(join(output, 'assets/_next/static/chunks/extra.js'));
  await put(output, 'assets/_next/static/chunks/app-a1.js', 'tampered');
  await assert.rejects(verifyAssetsBundle(output), /no longer match/);
  await assert.rejects(prepareAssets({ ...args, outputDirectory: join(root, 'next'), previousBundles: [output] }), /no longer match/);
});

test('a mismatched build, private extension or redirected source fails before output is created', async t => {
  const { source, args, root } = await fixture(t);
  await assert.rejects(prepareAssets({ ...args, release: { ...release, releaseId: 'other' } }), /must match/);
  await put(source, '.next/static/secret.json', '{"not":"public"}');
  await assert.rejects(prepareAssets(args), /allowlist/);
  await rm(join(source, '.next/static/secret.json'));
  const external = join(root, 'external');
  await mkdir(external);
  await put(external, 'private.js', 'private');
  await symlink(external, join(source, '.next/static/redirected'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareAssets(args), /links/);
});

test('manifest path traversal and unexpected header rules are rejected', async t => {
  const { output, args } = await fixture(t);
  await prepareAssets(args);
  await put(output, 'assets/_headers', '/*\n  Cache-Control: public');
  await assert.rejects(verifyAssetsBundle(output), /headers/);
  await put(output, 'assets/_headers', ASSET_HEADERS);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  manifest.files[0].path = '../outside.js';
  await put(output, 'manifest.json', JSON.stringify(manifest));
  await assert.rejects(verifyAssetsBundle(output), /Invalid static/);
});

test('assets configuration cannot enable worker-first, SPA fallbacks, alternate directories or bindings', async () => {
  const config = JSON.parse(await readFile(new URL('./wrangler.assets.example.json', import.meta.url), 'utf8'));
  config.name = 'pc-entry';
  config.vars.APP_PUBLIC_ORIGIN = 'https://pc-entry.review-account.workers.dev';
  config.vpc_services[0].service_id = '00000000-0000-0000-0000-000000000000';
  assert.doesNotThrow(() => validateConfig(config));
  for (const change of [{ run_worker_first: true }, { run_worker_first: ['/api/*'] },
    { html_handling: 'auto-trailing-slash' }, { not_found_handling: 'single-page-application' },
    { directory: '../../../public' }, { binding: 'ASSETS' }]) {
    assert.throws(() => validateConfig({ ...config, assets: { ...config.assets, ...change } }), /asset-first/);
  }
});

test('asset-first routing model removes static dispatches and keeps auth, RSC, private images and 404 on the PC', async t => {
  const { output, args } = await fixture(t);
  const manifest = await prepareAssets(args);
  const origin = 'https://pc-entry.review-account.workers.dev';
  let workerCalls = 0, pcCalls = 0;
  // Models the documented platform matching contract; not a deployed Cloudflare measurement.
  const route = async request => {
    const path = new URL(request.url).pathname.slice(1);
    if (['GET', 'HEAD'].includes(request.method) && manifest.files.some(file => file.path === path)) {
      return new Response(request.method === 'HEAD' ? null : await readFile(join(output, 'assets', path)));
    }
    workerCalls++;
    return worker.fetch(request, { APP_PUBLIC_ORIGIN: origin, PC_APP: { fetch: async incoming => {
      pcCalls++;
      if (new URL(incoming.url).pathname.startsWith('/_next/static/')) return new Response(null, { status: 404 });
      return new Response(null, { status: incoming.method === 'POST' ? 201 : 200, headers: { 'cache-control': 'private, no-store' } });
    } } });
  };
  for (const file of manifest.files) {
    assert.equal((await route(new Request(`${origin}/${file.path}?dpl=release-a`))).status, 200);
    assert.equal((await route(new Request(`${origin}/${file.path}`, { method: 'HEAD' }))).status, 200);
  }
  assert.equal(workerCalls, 0);
  for (const path of ['/home?_rsc=synthetic', '/auth/callback?code=synthetic', '/api/local-image/private', '/api/version']) {
    const response = await route(new Request(origin + path));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal((await route(new Request(`${origin}/api/save`, { method: 'POST', headers: { origin }, body: 'save' }))).status, 201);
  assert.equal((await route(new Request(`${origin}/_next/static/missing.js`))).status, 404);
  assert.equal(workerCalls, 6);
  assert.equal(pcCalls, 6);
});
