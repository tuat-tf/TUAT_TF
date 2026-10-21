import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FILES, REVIEWS, LEGACY_REVIEWS, inspectInventory, runCli } from './check.mjs';

const now = Date.parse('2026-10-20T12:00:00Z');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'tuat-handoff-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = Object.fromEntries(FILES.map(id => {
    const path = join(dir, id);
    writeFileSync(path, id === 'archive' ? 'encrypted-fixture' : 'SECRET_SENTINEL');
    return [id, path];
  }));
  const receipt = {
    version: 1, sourceId: 'fixture-source',
    archiveSha256: createHash('sha256').update('encrypted-fixture').digest('hex'),
    verifiedAt: '2026-10-20T11:00:00Z', restoreVerifiedAt: '2026-10-20T11:05:00Z',
    independentRecoveryCopyChecked: true,
  };
  writeFileSync(files.producerReceipt, JSON.stringify(receipt));
  const evidence = join(dir, 'review');
  writeFileSync(evidence, 'private evidence');
  const manifest = {
    version: 2, backupStorage: 'google-drive', releaseSha: 'a'.repeat(40), sourceId: receipt.sourceId, maxSnapshotAgeHours: 24, files,
    reviews: Object.fromEntries(REVIEWS.map(id => [id, { checkedAt: '2026-10-20T11:06:00Z', evidenceFile: evidence }])),
  };
  return { dir, manifest, receipt };
}
const status = (report, id) => report.checks.find(c => c.id === id)?.status;

test('complete inventory is never restoration or cutover approval and leaks no values', t => {
  const { manifest, dir } = fixture(t);
  const report = inspectInventory(manifest, { now });
  assert.equal(report.inventoryComplete, true);
  assert.equal(report.restoreVerified, false);
  assert.equal(report.cutoverReady, false);
  const output = JSON.stringify(report);
  for (const privateValue of [dir, 'SECRET_SENTINEL', manifest.sourceId, manifest.releaseSha]) {
    assert.equal(output.includes(privateValue), false);
  }
  assert.equal(readFileSync(manifest.files.recoveryKey, 'utf8'), 'SECRET_SENTINEL');
});
test('example enumerates missing resources instead of accepting placeholders', () => {
  const example = JSON.parse(readFileSync(new URL('./inventory.example.json', import.meta.url)));
  const report = inspectInventory(example, { now });
  assert.equal(report.inventoryComplete, false);
  assert.equal(status(report, 'sourceId'), 'missing-or-invalid');
  for (const id of FILES) assert.equal(status(report, id), 'missing');
  for (const id of REVIEWS) assert.equal(status(report, id), 'manual-review-needed');
});
test('wrong archive, wrong source and stale or future receipts fail closed', t => {
  const { manifest, receipt } = fixture(t);
  writeFileSync(manifest.files.archive, 'changed');
  assert.equal(status(inspectInventory(manifest, { now }), 'archiveReceiptHash'), 'mismatched');
  for (const patch of [
    { sourceId: 'other' }, { verifiedAt: '2026-10-21T00:00:00Z' }, { restoreVerifiedAt: 'bad' },
    { verifiedAt: '2026-02-31T00:00:00Z' },
  ]) {
    writeFileSync(manifest.files.producerReceipt, JSON.stringify({ ...receipt, ...patch }));
    assert.equal(status(inspectInventory(manifest, { now }), 'receiptBinding'), 'invalid-or-mismatched');
  }
  writeFileSync(manifest.files.producerReceipt, JSON.stringify({ ...receipt, verifiedAt: '2026-10-18T00:00:00Z' }));
  assert.equal(status(inspectInventory(manifest, { now }), 'snapshotAge'), 'stale');
});
test('missing, duplicate, empty, directory and relative files cannot satisfy inventory', t => {
  const { manifest, dir } = fixture(t);
  manifest.files.recoveryKey = manifest.files.vaultKey;
  assert.equal(status(inspectInventory(manifest, { now }), 'distinctFiles'), 'duplicate-file');
  manifest.files.recoveryKey = join(dir, 'absent');
  assert.equal(status(inspectInventory(manifest, { now }), 'recoveryKey'), 'missing-unreadable-or-unsafe');
  manifest.files.recoveryKey = dir;
  assert.equal(inspectInventory(manifest, { now }).inventoryComplete, false);
  manifest.files.recoveryKey = 'relative-file';
  assert.equal(inspectInventory(manifest, { now }).inventoryComplete, false);
  writeFileSync(manifest.files.vaultKey, '');
  assert.equal(status(inspectInventory(manifest, { now }), 'vaultKey'), 'missing-unreadable-or-unsafe');
});
test('a linked parent cannot satisfy resource presence', t => {
  const { manifest, dir } = fixture(t);
  const actual = join(dir, 'actual'), link = join(dir, 'link');
  mkdirSync(actual);
  writeFileSync(join(actual, 'key'), 'private');
  symlinkSync(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
  manifest.files.recoveryKey = join(link, 'key');
  assert.equal(status(inspectInventory(manifest, { now }), 'recoveryKey'), 'missing-unreadable-or-unsafe');
});
test('malformed input and CLI errors do not echo input or paths', t => {
  const { manifest, dir } = fixture(t);
  assert.equal(inspectInventory({ ...manifest, extra: 'SECRET_SENTINEL' }).inventoryComplete, false);
  const input = join(dir, 'inventory.json');
  writeFileSync(input, '{SECRET_SENTINEL');
  const result = runCli(['--inventory', input]);
  assert.equal(result.exitCode, 2);
  assert.equal(JSON.stringify(result).includes(dir), false);
  assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'), false);
  assert.equal(runCli(['--unknown']).exitCode, 2);
  writeFileSync(input, JSON.stringify(manifest));
  assert.equal(runCli(['--inventory', input], { now }).exitCode, 0);
  manifest.files.recoveryKey = null;
  writeFileSync(input, JSON.stringify(manifest));
  assert.equal(runCli(['--inventory', input], { now }).exitCode, 1);
});
test('missing and future manual evidence stay unresolved', t => {
  const { manifest } = fixture(t);
  manifest.reviews.independentKeyCustody = null;
  manifest.reviews.googleOAuthAdministration.checkedAt = '2099-01-01T00:00:00Z';
  const report = inspectInventory(manifest, { now });
  assert.equal(status(report, 'independentKeyCustody'), 'manual-review-needed');
  assert.equal(status(report, 'googleOAuthAdministration'), 'invalid-review');
  assert.equal(report.inventoryComplete, false);
});

test('accepts actual Python producer UTC microseconds without rewriting receipts', t => {
  const { manifest, receipt } = fixture(t);
  const actual = { ...receipt, verifiedAt: '2026-10-20T11:00:00.276415+00:00', restoreVerifiedAt: '2026-10-20T11:00:10.394626+00:00' };
  writeFileSync(manifest.files.producerReceipt, JSON.stringify(actual));
  assert.equal(status(inspectInventory(manifest, { now }), 'receiptBinding'), 'matched');
  assert.deepEqual(JSON.parse(readFileSync(manifest.files.producerReceipt, 'utf8')), actual);
  for (const value of ['2026-02-31T11:00:00.123456+00:00', '2026-10-20T25:00:00+00:00', '2026-10-20T11:00:00+09:00']) {
    writeFileSync(manifest.files.producerReceipt, JSON.stringify({ ...actual, verifiedAt: value }));
    assert.equal(status(inspectInventory(manifest, { now }), 'receiptBinding'), 'invalid-or-mismatched');
  }
});

test('Drive requires the current storage review; legacy R2 inventories remain readable', t => {
  const { manifest } = fixture(t);
  manifest.reviews.backupStorageAdministration = null;
  assert.equal(status(inspectInventory(manifest, { now }), 'backupStorageAdministration'), 'manual-review-needed');
  manifest.reviews.r2Administration = manifest.reviews.repositoryAdministration;
  assert.equal(status(inspectInventory(manifest, { now }), 'inventory'), 'invalid-format');
  delete manifest.reviews.backupStorageAdministration;
  delete manifest.backupStorage;
  manifest.version = 1;
  assert.deepEqual(Object.keys(manifest.reviews).sort(), [...LEGACY_REVIEWS].sort());
  assert.equal(inspectInventory(manifest, { now }).inventoryComplete, true);
  manifest.version = 2;
  manifest.backupStorage = 'google-drive';
  assert.equal(status(inspectInventory(manifest, { now }), 'inventory'), 'invalid-format');
});
