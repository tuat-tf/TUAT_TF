"""Run required synthetic Linux operations tests; skipped tests are incomplete."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
TESTS = (
    'ops/local-minimal/backup.test.py',
    'ops/local-minimal/periodic.test.py',
    'ops/local-minimal/runtime.test.py',
    'ops/local-minimal/transport.test.py',
    'ops/local-minimal/pc/bootstrap.test.py',
    'ops/pc-host/linux-launch.test.py',
    'ops/pc-host/linux-application-sandbox.test.py',
)


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        print('Required Linux/root tests were not run. Use an isolated Linux test environment, not production services.', file=sys.stderr)
        return 2
    node = shutil.which('node')
    if not node or subprocess.run([node, '--version'], capture_output=True, text=True, check=True).stdout.split('.')[0] != 'v24':
        print('Node 24 must be on PATH for the required Linux tests.', file=sys.stderr)
        return 2
    if len(sys.argv) == 3 and sys.argv[1] == '--file' and sys.argv[2] in TESTS:
        spec = importlib.util.spec_from_file_location('required_ops_test', ROOT / sys.argv[2])
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        suite = unittest.defaultTestLoader.loadTestsFromModule(module)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        if result.skipped:
            print('Required tests were skipped; this suite is incomplete.', file=sys.stderr)
        return 0 if result.testsRun and result.wasSuccessful() and not result.skipped else 1
    if len(sys.argv) != 1:
        print('Run without arguments to execute every required Linux suite.', file=sys.stderr)
        return 2
    # Isolate module state between suites. They create synthetic temporary fixtures
    # and private namespaces; this runner never starts WSL or a production service.
    environment = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL') if key in os.environ}
    for test in TESTS:
        outcome = subprocess.run([sys.executable, '-I', '-B', str(Path(__file__).resolve()), '--file', test],
                                 cwd=ROOT, env=environment, check=False)
        if outcome.returncode:
            return outcome.returncode
    return 0


if __name__ == '__main__':
    sys.exit(main())
