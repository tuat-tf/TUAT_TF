import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./prepare-production.mjs', import.meta.url));

test('retired preparation refuses before opening legacy settings or producing a candidate', t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'tuat-retired-jobs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const args of [[], [resolve(directory, 'old-release')]]) {
    const result = spawnSync(process.execPath, [entry, ...args], { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /retired.*shared-pc/s);
    assert.doesNotMatch(result.stderr, /ENOENT|SECRET|\.env\.local/);
    assert.deepEqual(readdirSync(directory), []);
  }
});
