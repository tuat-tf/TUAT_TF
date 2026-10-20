// Publishable files only. The sibling manifest is never part of the assets directory.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ASSETS = [
  'favicon.ico',
  'branding/summer-og-1200x630.jpg',
  'branding/summer-icon-maskable-512.png',
  'branding/summer-icon-512.png',
  'branding/summer-icon-192.png',
  'branding/summer-icon-180.png',
  'branding/summer-icon-1024.png',
  'branding/summer-favicon.ico',
  'branding/summer-favicon-32.png',
];
export const ASSET_HEADERS = `/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
/branding/*
  Cache-Control: public, max-age=3600, must-revalidate
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
/favicon.ico
  Cache-Control: public, max-age=3600, must-revalidate
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
`;
const extensions = new Set(['.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.ico', '.wasm']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = path => process.platform === 'win32' ? path.toLowerCase() : path;
function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) &&
    !/[\\%?#:\u0000-\u001f]/.test(path) && path.split('/').every(segment => segment && !segment.startsWith('.'));
}
function allowedAsset(path) {
  return safePath(path) && (PUBLIC_ASSETS.includes(path) ||
    (path.startsWith('_next/static/') && extensions.has(extname(path).toLowerCase())));
}
async function plainPath(path, directory) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) ||
      normalized(await realpath(path)) !== normalized(resolve(path))) {
    throw Error('Static assets may not use links or special files');
  }
}
async function filesIn(directory, prefix = '') {
  await plainPath(directory, true);
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${prefix}${entry.name}`;
    if (!safePath(name)) throw Error('Unsafe static asset path');
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path, `${name}/`));
    else { await plainPath(path, false); files.push(name); }
  }
  return files;
}
async function readPlain(root, path) {
  if (!safePath(path)) throw Error('Unsafe static asset path');
  const target = resolve(root, path);
  await plainPath(target, false);
  return readFile(target);
}
function validRelease(release) {
  return release && /^[0-9a-f]{40}$/.test(release.commit) &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(release.releaseId) && !release.releaseId.startsWith('dpl_') &&
    typeof release.buildId === 'string' && /^[A-Za-z0-9_-]+$/.test(release.buildId) &&
    /^[0-9a-f]{64}$/.test(release.buildHash);
}
const sameRelease = (left, right) =>
  ['commit', 'releaseId', 'buildId', 'buildHash'].every(key => left[key] === right[key]);

/** Verify bytes, allowlist and absence of extra files before reusing/uploading a bundle. */
export async function verifyAssetsBundle(directory) {
  await plainPath(directory, true);
  const manifest = JSON.parse(await readPlain(directory, 'manifest.json'));
  if (manifest.version !== 1 || !validRelease(manifest.current) || !Array.isArray(manifest.releases) ||
      !manifest.releases.every(validRelease) || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw Error('Invalid static asset manifest');
  }
  if (!manifest.releases.some(item => sameRelease(item, manifest.current))) {
    throw Error('Current release is missing from the static asset manifest');
  }
  const root = resolve(directory, 'assets');
  const listed = new Set();
  for (const entry of manifest.files) {
    if (!allowedAsset(entry.path) || listed.has(entry.path) || !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw Error('Invalid static asset entry');
    listed.add(entry.path);
    const bytes = await readPlain(root, entry.path);
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw Error('Static asset bytes no longer match');
  }
  if ((await readPlain(root, '_headers')).toString() !== ASSET_HEADERS) throw Error('Static asset headers no longer match');
  const actual = await filesIn(root);
  if (actual.length !== listed.size + 1 || actual.some(path => path !== '_headers' && !listed.has(path))) {
    throw Error('Unlisted file in public assets directory');
  }
  return manifest;
}

/** The CLI supplies a verified prepared release; tests supply an isolated synthetic build. */
export async function prepareAssets({ releaseDirectory, outputDirectory, release, previousBundles = [] }) {
  await plainPath(releaseDirectory, true);
  // .next is intentionally read explicitly, never through the public-file allowlist.
  await plainPath(resolve(releaseDirectory, '.next'), true);
  await plainPath(resolve(releaseDirectory, '.next/BUILD_ID'), false);
  await plainPath(resolve(releaseDirectory, '.next/required-server-files.json'), false);
  const actualBuildId = (await readFile(resolve(releaseDirectory, '.next/BUILD_ID'), 'utf8')).trim();
  const config = JSON.parse(await readFile(resolve(releaseDirectory, '.next/required-server-files.json'), 'utf8')).config;
  const current = { ...release, buildId: actualBuildId };
  if (!validRelease(current) || config?.deploymentId !== current.releaseId) throw Error('Prepared build and release must match');
  const target = resolve(outputDirectory);
  const source = resolve(releaseDirectory);
  const sourceRelative = normalized(relative(source, target));
  if (!sourceRelative || ['.next', 'public'].some(part => sourceRelative === part || sourceRelative.startsWith(`${part}/`) || sourceRelative.startsWith(`${part}\\`))) {
    throw Error('Output must not overlap build or public sources');
  }
  // Read and validate every source before creating a new output. Never replace a previous bundle.
  const files = new Map();
  const releases = new Map([[current.commit + ':' + current.releaseId, current]]);
  const add = (path, bytes) => {
    if (!allowedAsset(path)) throw Error('File is outside the static asset allowlist');
    const old = files.get(path);
    if (old && hash(old) !== hash(bytes)) throw Error('Immutable asset collision; preserve the existing release');
    files.set(path, bytes);
  };
  for (const bundle of previousBundles) {
    const manifest = await verifyAssetsBundle(bundle);
    for (const item of manifest.releases) {
      const key = item.commit + ':' + item.releaseId;
      if (releases.has(key) && !sameRelease(releases.get(key), item)) throw Error('Prepared release identity collision');
      releases.set(key, item);
    }
    for (const entry of manifest.files) {
      // Unhashed branding uses the new release. Old tabs retain all previous Next assets.
      if (entry.path.startsWith('_next/static/')) add(entry.path, await readPlain(resolve(bundle, 'assets'), entry.path));
    }
  }
  const staticRoot = resolve(source, '.next/static');
  const staticFiles = await filesIn(staticRoot);
  for (const path of staticFiles) {
    if (path.endsWith('.map')) continue;
    add(`_next/static/${path}`, await readPlain(staticRoot, path));
  }
  if (!files.size || !staticFiles.some(path => path.endsWith('.js'))) throw Error('Production static JavaScript required');
  const publicRoot = resolve(source, 'public');
  await plainPath(publicRoot, true);
  for (const path of PUBLIC_ASSETS) add(path, await readPlain(publicRoot, path));
  await plainPath(dirname(target), true);
  await mkdir(target); // EEXIST is intentional: no deletion, replacement or partial overwrite.
  const assetsRoot = resolve(target, 'assets');
  await mkdir(assetsRoot);
  const entries = [];
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = resolve(assetsRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    entries.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  await writeFile(resolve(assetsRoot, '_headers'), ASSET_HEADERS, { flag: 'wx' });
  const manifest = { version: 1, current, releases: [...releases.values()], files: entries };
  await writeFile(resolve(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return verifyAssetsBundle(target);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, configPath, output, ...previousBundles] = process.argv.slice(2);
    if (mode === '--verify' && configPath && !output) {
      const manifest = await verifyAssetsBundle(resolve(configPath));
      process.stdout.write(`Verified ${manifest.files.length} public assets for ${manifest.current.commit}; no provider operation.\n`);
    } else if (mode === '--prepare' && configPath && output) {
      const { loadHost, verifyPrepared } = await import('../release.mjs');
      const { config, env } = loadHost(resolve(configPath));
      const proof = verifyPrepared(config, env);
      const manifest = await prepareAssets({ releaseDirectory: config.releaseDirectory, outputDirectory: resolve(output),
        release: { commit: config.releaseCommit, releaseId: config.releaseId, buildHash: proof.buildHash },
        previousBundles: previousBundles.map(path => resolve(path)) });
      process.stdout.write(`Prepared ${manifest.files.length} public assets for ${manifest.current.commit}; no provider operation.\n`);
    } else throw Error('Usage: prepare-assets.mjs --prepare HOST_CONFIG NEW_OUTPUT [PREVIOUS_BUNDLE ...] | --verify BUNDLE');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
