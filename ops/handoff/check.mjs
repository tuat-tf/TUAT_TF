// Offline inventory only. Never decrypts, connects, starts services or reads secret contents.
import { lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = [
  'archive', 'producerReceipt', 'runtimeConfig', 'backupConfig', 'offsiteConfig',
  'appEnvironment', 'dbEnvironment', 'authEnvironment', 'restEnvironment', 'mixedJwks',
  'vaultKey', 'recoveryKey', 'jobsConfig', 'releaseManifest', 'releaseBundle',
  'hostConfig', 'tunnelCredentials', 'offsiteCredentials', 'bootstrapBundle',
];
export const REVIEWS = [
  'independentKeyCustody', 'releaseMatchesSnapshot', 'authAndSigningKeys',
  'jobsHistoryAndExternalOutcomes', 'googleOAuthAdministration',
  'sheetsGasAdministration', 'cloudflareAdministration', 'backupStorageAdministration',
  'repositoryAdministration', 'privateFilePermissions',
];
export const LEGACY_REVIEWS = REVIEWS.map(id => id === 'backupStorageAdministration' ? 'r2Administration' : id);
const shaPattern = /^[a-f0-9]{64}$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const iso = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) ||
      !Number.isFinite(Date.parse(v))) return false;
  const utc = v.replace(/\+00:00$/, 'Z');
  const normalized = utc.includes('.') ? utc.replace(/\.(\d+)Z$/, (_, digits) => `.${digits.slice(0, 3).padEnd(3, '0')}Z`) : utc.replace('Z', '.000Z');
  return new Date(v).toISOString() === normalized;
};

function regular(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('invalid');
  for (let part = resolve(path); ; part = dirname(part)) {
    const s = lstatSync(part);
    if (s.isSymbolicLink()) throw Error('link');
    if (part === dirname(part)) break;
  }
  const s = lstatSync(path);
  if (!s.isFile() || s.nlink !== 1 || s.size === 0) throw Error('file');
  return s;
}

// Only metadata JSON and ciphertext are read. Do not pass key/environment files here.
function readChecked(path, limit, json = false) {
  const before = regular(path);
  if (before.size > limit) throw Error('large');
  const fd = openSync(path, 'r');
  try {
    const current = fstatSync(fd);
    if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino ||
        current.size !== before.size) throw Error('changed');
    const hash = createHash('sha256');
    const chunks = [];
    const buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      total += n;
      if (total > limit) throw Error('large');
      hash.update(buffer.subarray(0, n));
      if (json) chunks.push(Buffer.from(buffer.subarray(0, n)));
    }
    const after = fstatSync(fd);
    const pathAfter = regular(path);
    if (total !== before.size || after.size !== before.size || after.nlink !== 1 || after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs || pathAfter.ino !== before.ino ||
        pathAfter.dev !== before.dev) throw Error('changed');
    return json ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : hash.digest('hex');
  } finally { closeSync(fd); }
}

export function inspectInventory(manifest, { now = Date.now() } = {}) {
  const checks = [];
  const add = (id, status) => checks.push({ id, status });
  const invalid = () => ({
    version: 1, inventoryComplete: false, restoreVerified: false, cutoverReady: false,
    checks: [{ id: 'inventory', status: 'invalid-format' }],
  });
  const legacy = manifest?.version === 1;
  const reviews = legacy ? LEGACY_REVIEWS : REVIEWS;
  const fields = ['version', 'releaseSha', 'sourceId', 'maxSnapshotAgeHours', 'files', 'reviews'];
  if (!exact(manifest, legacy ? fields : [...fields, 'backupStorage']) ||
      ![1, 2].includes(manifest.version) ||
      (!legacy && !['google-drive', 'r2'].includes(manifest.backupStorage)) ||
      !Number.isInteger(manifest.maxSnapshotAgeHours) || manifest.maxSnapshotAgeHours < 1 ||
      manifest.maxSnapshotAgeHours > 8760 ||
      !exact(manifest.files, FILES) || !exact(manifest.reviews, reviews)) return invalid();
  add('releaseSha', typeof manifest.releaseSha === 'string' && /^[a-f0-9]{40}$/.test(manifest.releaseSha) ? 'matched' : 'missing-or-invalid');
  add('sourceId', typeof manifest.sourceId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(manifest.sourceId) &&
    !/replace/i.test(manifest.sourceId) ? 'matched' : 'missing-or-invalid');
  const present = {};
  for (const id of FILES) {
    const path = manifest.files[id];
    if (path === null) { add(id, 'missing'); continue; }
    try { regular(path); present[id] = true; add(id, 'present-content-unverified'); }
    catch { add(id, 'missing-unreadable-or-unsafe'); }
  }
  // Distinct roles must not be satisfied by repeating a single placeholder file.
  const paths = FILES.filter(id => present[id]).map(id => {
    const p = resolve(manifest.files[id]);
    return process.platform === 'win32' ? p.toLowerCase() : p;
  });
  add('distinctFiles', new Set(paths).size === paths.length ? 'matched' : 'duplicate-file');
  let receipt;
  if (present.producerReceipt) {
    try {
      receipt = readChecked(manifest.files.producerReceipt, 65536, true);
      if (!object(receipt) || receipt.version !== 1 || receipt.sourceId !== manifest.sourceId ||
          !shaPattern.test(receipt.archiveSha256) || !iso(receipt.verifiedAt) ||
          !iso(receipt.restoreVerifiedAt)) throw Error('receipt');
      const captured = Date.parse(receipt.verifiedAt), restored = Date.parse(receipt.restoreVerifiedAt);
      if (captured > restored || restored > now || captured > now) throw Error('time');
      add('receiptBinding', 'matched');
      add('snapshotAge', now - captured <= manifest.maxSnapshotAgeHours * 3600000 ? 'within-selected-age' : 'stale');
    } catch { receipt = null; add('receiptBinding', 'invalid-or-mismatched'); }
  } else { add('receiptBinding', 'missing'); }
  if (receipt && present.archive) {
    try {
      // Same bounded size as the current offsite example; larger archives require explicit review.
      const actual = readChecked(manifest.files.archive, 268435456);
      add('archiveReceiptHash', actual === receipt.archiveSha256 ? 'matched' : 'mismatched');
    } catch { add('archiveReceiptHash', 'unreadable-unsafe-or-too-large'); }
  } else { add('archiveReceiptHash', 'unverified'); }
  for (const id of reviews) {
    const review = manifest.reviews[id];
    if (review === null) { add(id, 'manual-review-needed'); continue; }
    if (!exact(review, ['checkedAt', 'evidenceFile']) || !iso(review.checkedAt) ||
        Date.parse(review.checkedAt) > now) { add(id, 'invalid-review'); continue; }
    try { regular(review.evidenceFile); add(id, 'operator-record-present-unverified'); }
    catch { add(id, 'review-evidence-missing-or-unsafe'); }
  }
  const accepted = new Set(['present-content-unverified', 'matched', 'within-selected-age', 'operator-record-present-unverified']);
  return {
    version: manifest.version,
    inventoryComplete: checks.every(c => accepted.has(c.status)),
    // Existence, a self-supplied receipt and manual records cannot prove restoration or authorization.
    restoreVerified: false, cutoverReady: false, checks,
  };
}

export function runCli(args, options = {}) {
  if (args.length !== 2 || args[0] !== '--inventory') {
    return { exitCode: 2, report: { error: 'usage: node ops/handoff/check.mjs --inventory ABSOLUTE_PRIVATE_JSON' } };
  }
  try {
    const report = inspectInventory(readChecked(args[1], 65536, true), options);
    return { exitCode: report.inventoryComplete ? 0 : 1, report };
  } catch {
    return { exitCode: 2, report: { error: 'inventory-unreadable-unsafe-or-invalid', inventoryComplete: false, restoreVerified: false, cutoverReady: false } };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result.report, null, 2));
  process.exitCode = result.exitCode;
}
