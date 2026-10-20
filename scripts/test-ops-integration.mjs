import { globSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// These fixtures exercise the Windows wrapper mutex and launch configuration.
// Linux FLOCK/unprivileged-launch contracts are required in test:ops:linux.
const windowsOnlyTests = ['ops/pc-host/backup-lifecycle.test.mjs', 'ops/pc-host/runner-lock.test.mjs'];
const windowsTests = [...windowsOnlyTests, 'ops/pc-host/account-preflight.test.mjs', 'ops/pc-host/release.test.mjs'];
const root = fileURLToPath(new URL('../', import.meta.url));
const [platform, ...patterns] = process.argv.slice(2);
if (!['linux', 'win32'].includes(platform) || process.platform !== platform || process.versions.node.split('.')[0] !== '24') {
  console.error('Required integration tests need the selected OS and Node 24. Run test:ops:integration on Linux and test:ops:windows on Windows; the portable test:ops group alone is incomplete. See ops/README.md.');
  process.exitCode = 2;
} else {
  const files = platform === 'win32' ? windowsTests.map(file => resolve(root, file))
    : [...new Set(globSync(patterns, { cwd: root }))]
      .filter(file => !windowsOnlyTests.includes(relative(root, resolve(root, file)).replaceAll('\\', '/')))
      .sort().map(file => resolve(root, file));
  if (!files.length || (platform === 'linux' && !patterns.length) || (platform === 'win32' && patterns.length)) {
    throw Error('Explicit nonempty integration group required');
  }
  console.log(platform === 'linux' ? 'Linux integration; two Windows fixtures run separately via test:ops:windows.'
    : 'Windows wrapper and platform fixtures; Linux integration and Python operations tests are also required.');
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
