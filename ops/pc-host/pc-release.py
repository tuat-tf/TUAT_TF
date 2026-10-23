#!/usr/bin/env python3
"""Repeatable PC release switch. Run as root inside WSL.

  pc-release.py replay-check <old-short> <new-short>   generator must reproduce a past installation exactly
  pc-release.py build <commit>                          new release dir (git clone + npm ci + isolated next build)
  pc-release.py prepare <commit>                        new installation dir from the running one (no service change)
  pc-release.py switch <commit> [--execute]            drain jobs/timer, stop app once, swap units+runtime, start, verify;
                                                        rolls back to the previous units/runtime if the new app does not come up

Without --execute, switch only prints its plan. Every step refuses instead of guessing.
The generator copies the running installation and changes only release-specific values,
so secrets and keys are carried over byte-for-byte and never printed.
"""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True  # importing checkers from a sealed release must not add __pycache__ to it

ROOT = Path('/var/lib/tuat-local')
PRIVATE = ROOT / 'private'
RELEASES = ROOT / 'releases'
ETC_RUNTIME = Path('/etc/tuat-local/runtime.json')
UNIT_DIR = Path('/etc/systemd/system')
SERVICE_UNITS = ('tuat-local-app.service', 'tuat-local-jobs.service', 'tuat-local-backup.service')
TIMER = 'tuat-local-backup.timer'
NODE = '/opt/node-v24.19.0-linux-x64/bin/node'
SOURCE_REPO = '/mnt/d/TUAT_TF'
APP_UID = APP_GID = 65530
LOOPBACK_VERSION = 'http://127.0.0.1:18200/api/version'
PUBLIC_VERSION = 'https://app.tuat-tf.workers.dev/api/version'
# Files that only describe one past transition; never carried into a new installation.
TRANSIENT = {'configuration-preparation.json', 'preparation.intent.json', 'final-verification.json',
             'jobs-ready-before-timer.json', 'jobs-terminal-before-timer.json', 'resume-background.intent.json',
             'resume-background.result.json', 'previous-runtime-status.json', 'migration-completion-audit.json'}
CONFIGS = ('host.json', 'jobs.json', 'backup.json', 'node-backup.json', 'offsite.json')


class Refused(Exception):
    pass


def need(ok, why):
    if not ok:
        raise Refused(why)


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def short(commit):
    need(re.fullmatch('[0-9a-f]{40}', commit), 'full 40-hex commit required')
    return commit[:7]


def json_text(value, like):
    """Serialize exactly like an existing file (indent / trailing newline), so unchanged values stay byte-identical."""
    raw = Path(like).read_text()
    for indent in (2, None, 4):
        for seps in ((', ', ': '), (',', ':')):
            for nl in ('\n', ''):
                text = json.dumps(json.loads(raw), indent=indent, separators=seps if indent is None else (',', ': '),
                                  ensure_ascii=False) + nl
                if text == raw:
                    return json.dumps(value, indent=indent, separators=seps if indent is None else (',', ': '),
                                      ensure_ascii=False) + nl
    raise Refused(f'unknown JSON layout: {like}')


class Swap:
    """Release-specific substitutions. Only full path segments / full commit / release id are replaced."""

    def __init__(self, old_commit, new_commit):
        o, n = short(old_commit), short(new_commit)
        self.pairs = [(old_commit, new_commit), (f'pc-local-{o}', f'pc-local-{n}')]
        for prefix in ('installation-', 'releases/', 'host-state-', 'runtime-logs-'):
            self.pairs.append((prefix + o, prefix + n))

    def text(self, value):
        for a, b in self.pairs:
            value = re.sub(re.escape(a) + r'(?![0-9a-f])', b, value)
        return value


def load_runtime_module(release):
    import importlib.util
    path = Path(release) / 'ops/local-minimal/runtime.py'
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location('tuat_runtime_for_release', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def generate(prev_runtime_text, prev_units, prev_inst, new_commit, release, out):
    """Write a complete installation for `release` into `out`.

    prev_runtime_text / prev_units: the currently installed /etc/tuat-local/runtime.json and unit files.
    prev_inst: the installation directory the running runtime points at.
    """
    prev_inst, out, release = Path(prev_inst), Path(out), Path(release)
    prev_runtime = json.loads(prev_runtime_text)
    old_commit = json.loads((prev_inst / 'host.json').read_text())['releaseCommit']
    swap = Swap(old_commit, new_commit)
    final = PRIVATE / f'installation-{short(new_commit)}'
    out.mkdir(mode=0o700)
    written = {}

    def put(name, data, mode=0o600):
        p = out / name
        fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'wb') as f:
            f.write(data if isinstance(data, bytes) else data.encode())
        os.chmod(p, mode)
        written[name] = p

    # Carried over byte-for-byte (keys, offsite env) or with release-specific values swapped (configs).
    for p in sorted(prev_inst.iterdir()):
        name = p.name
        if name in TRANSIENT or name.startswith(('previous-', 'proposed-')) or name in ('runtime.json', 'release-manifest.json',
                                                                                         'control-seal.json', 'application.env'):
            continue
        mode = stat.S_IMODE(p.stat().st_mode)
        if name in CONFIGS:
            put(name, swap.text(p.read_text()), mode)
        elif name.endswith('.key') or name in ('offsite.env', 'key-recovery-evidence.json'):
            put(name, p.read_bytes(), mode)
        else:
            raise Refused(f'unexpected installation file, decide how to carry it: {name}')

    env = (prev_inst / 'application.env').read_text()
    for key, value in (('PC_APP_RELEASE_ID', f'pc-local-{short(new_commit)}'), ('VERCEL_GIT_COMMIT_SHA', new_commit)):
        env, count = re.subn(rf'^{key}=.*$', f'{key}={value}', env, flags=re.M)
        need(count == 1, f'application.env must define {key} once')
    put('application.env', env, stat.S_IMODE((prev_inst / 'application.env').stat().st_mode))

    runtime = json.loads(swap.text(prev_runtime_text))
    runtime_text = json_text(runtime, prev_inst / 'runtime.json')
    put('runtime.json', runtime_text, stat.S_IMODE((prev_inst / 'runtime.json').stat().st_mode))
    put('previous-runtime.json', prev_runtime_text, 0o600)
    for unit, text in prev_units.items():
        put(f'previous-{unit}', text, 0o600)
        put(f'proposed-{unit}', swap.text(text) if unit != TIMER else text, 0o600)

    # Release manifest: same fields as before; every digest recomputed from the new bytes.
    old_manifest = json.loads((prev_inst / 'release-manifest.json').read_text())
    rt = load_runtime_module(release)
    inventory = rt.release_inventory(release, uid=prev_runtime['appUid'], gid=prev_runtime['appGid'])
    hosted = json.loads(written['host.json'].read_text())
    sources = {
        'appEnvironmentSha256': written['application.env'], 'hostConfigPathSha256': written['host.json'],
        'jobsConfigSha256': written['jobs.json'], 'backupConfigPathSha256': written['backup.json'],
        'nodeBackupConfigSha256': written['node-backup.json'], 'offsiteConfigPathSha256': written['offsite.json'],
        'offsiteEnvironmentSha256': written['offsite.env'], 'nodeSha256': Path(NODE),
    }
    manifest = {}
    for key, value in old_manifest.items():
        if key in ('files', 'links'):
            manifest[key] = inventory[key]
        elif key in sources:
            manifest[key] = sha_file(sources[key])
        elif key == 'sourceCommit':
            manifest[key] = new_commit
        elif key == 'releaseId':
            manifest[key] = hosted['releaseId']
        elif key == 'buildId':
            manifest[key] = (release / '.next/BUILD_ID').read_text().strip()
        elif key in ('version', 'nodeVersion', 'publicOrigin', 'dbVaultKeySha256'):
            manifest[key] = value  # not release-specific
        else:
            raise Refused(f'unknown manifest field, decide how to derive it: {key}')
    put('release-manifest.json', json_text(manifest, prev_inst / 'release-manifest.json'),
        stat.S_IMODE((prev_inst / 'release-manifest.json').stat().st_mode))

    # Periodic backup seal: pinned code paths/digests, config digest, unit and runtime digests.
    old_seal = json.loads((prev_inst / 'control-seal.json').read_text())
    seal = json.loads(swap.text(json.dumps(old_seal)))
    for record in seal['sources'].values():
        record['sha256'] = sha_file(record['path'])
    seal['sourceCommit'] = new_commit
    seal['configSha256'] = sha_file(written['backup.json'])
    seal['fragmentSha256'] = sha_file(written['proposed-tuat-local-backup.service'])
    seal['timerSha256'] = sha_file(written[f'proposed-{TIMER}'])
    seal['nodeSha256'] = sha_file(NODE)
    seal['runtimeConfigSha256'] = sha_bytes(runtime_text.encode())
    for name, record in seal.get('offsiteInputs', {}).items():
        local = {'hostConfigPath': 'host.json', 'nodeBackupConfigPath': 'node-backup.json', 'offsiteConfigPath': 'offsite.json',
                 'offsiteEnvironmentPath': 'offsite.env', 'releaseManifest': 'release-manifest.json'}[name]
        need(record['path'] == str(final / local), f'seal input path mismatch: {name}')
        record['sha256'] = sha_file(written[local])
    put('control-seal.json', json_text(seal, prev_inst / 'control-seal.json'),
        stat.S_IMODE((prev_inst / 'control-seal.json').stat().st_mode))
    return written


def current_state():
    runtime_text = ETC_RUNTIME.read_text()
    runtime = json.loads(runtime_text)
    inst = Path(runtime['releaseManifest']).parent
    units = {u: (UNIT_DIR / u).read_text() for u in (*SERVICE_UNITS, TIMER)}
    return runtime_text, runtime, inst, units


def replay_check(old, new):
    """Regenerate installation-<new> from the records the <new> switch preserved, compare with what was installed."""
    actual = PRIVATE / f'installation-{new}'
    prev_runtime = (actual / 'previous-runtime.json').read_text()
    prev_units = {u: (actual / f'previous-{u}').read_text() for u in (*SERVICE_UNITS, TIMER)}
    commit = json.loads((actual / 'host.json').read_text())['releaseCommit']
    out = PRIVATE / f'.replay-{new}-{os.getpid()}'
    try:
        generate(prev_runtime, prev_units, PRIVATE / f'installation-{old}', commit, RELEASES / new, out)
        names = sorted(p.name for p in out.iterdir())
        bad = []
        for n in names:
            if (actual / n).read_bytes() == (out / n).read_bytes():
                continue
            if n == 'release-manifest.json':
                a, b = json.loads((actual / n).read_text()), json.loads((out / n).read_text())
                a['files'].pop('.git/index', None); b['files'].pop('.git/index', None)
                if a == b:
                    continue
            if n == 'control-seal.json':
                a, b = json.loads((actual / n).read_text()), json.loads((out / n).read_text())
                a['offsiteInputs']['releaseManifest'].pop('sha256'); b['offsiteInputs']['releaseManifest'].pop('sha256')
                if a == b:
                    continue
            bad.append(n)
        missing = sorted(p.name for p in actual.iterdir() if p.name not in names and p.name not in TRANSIENT)
        print(json.dumps({'compared': len(names), 'different': bad, 'notGenerated': missing}, ensure_ascii=False))
        return not bad and not missing
    finally:
        shutil.rmtree(out, ignore_errors=True)


def run(args, **kw):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kw).stdout


def unit_state(unit):
    out = run(['systemctl', 'show', unit, '--property=ActiveState,SubState,MainPID'])
    return dict(line.split('=', 1) for line in out.splitlines() if '=' in line)


def version(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fix_release_permissions(release):
    """Sealed releases are root-owned, group-readable by the app, never group/world-writable."""
    for directory, dirs, files in os.walk(release):
        os.chown(directory, 0, APP_GID)
        os.chmod(directory, 0o750)
        for name in files:
            p = os.path.join(directory, name)
            if os.path.islink(p):
                os.lchown(p, 0, APP_GID)
                continue
            os.chown(p, 0, APP_GID)
            os.chmod(p, 0o750 if os.stat(p).st_mode & 0o100 else 0o640)
        for name in dirs:
            p = os.path.join(directory, name)
            if os.path.islink(p):
                os.lchown(p, 0, APP_GID)


def give_to_builder(path):
    """Hand only the build output location to the unprivileged builder."""
    path.mkdir(exist_ok=True)
    for directory, dirs, files in os.walk(path):
        os.chown(directory, APP_UID, APP_GID)
        for name in files:
            os.lchown(os.path.join(directory, name), APP_UID, APP_GID)


def build(commit):
    s = short(commit)
    release, records, home = RELEASES / s, PRIVATE / f'build-{s}', ROOT / f'build-home-{s}'
    need(not (release / '.next/BUILD_ID').exists(), f'release {s} already built; refusing to overwrite')
    need(not (PRIVATE / f'installation-{s}').exists(), f'installation-{s} already exists')
    if records.exists():
        # A previous failed build of this tool: start over from a clean clone.
        shutil.rmtree(records)
        if release.exists():
            shutil.rmtree(release)
    if release.exists():
        # Only an interrupted clone from this tool (no build record, no build output, no dependencies) is redone.
        need(not (release / 'node_modules').exists() and not (PRIVATE / f'installation-{s}').exists(),
             f'{release} exists in an unknown state; inspect it')
        shutil.rmtree(release)
    _, runtime, inst, _ = current_state()
    previous = Path(runtime['releaseDirectory'])
    prev_build = PRIVATE / f'build-{previous.name}'
    need(prev_build.is_dir(), f'previous build record not found: {prev_build}')
    git = ['git', '-c', 'safe.directory=*']
    run(git + ['clone', '--quiet', '--no-checkout', SOURCE_REPO, str(release)])
    run(git + ['-C', str(release), 'checkout', '--quiet', '--detach', commit])
    run(git + ['-C', str(release), 'remote', 'remove', 'origin'])
    env = {'PATH': str(Path(NODE).parent) + ':/usr/sbin:/usr/bin:/sbin:/bin'}
    # The PC has no npm. Linux dependencies are reused from the running release when the lockfile is identical.
    for name in ('package-lock.json', 'package.json'):
        need((release / name).read_bytes() == (previous / name).read_bytes(),
             f'{name} changed since {previous.name}; dependencies must be rebuilt with npm, not reused')
    subprocess.run(['cp', '-a', str(previous / 'node_modules'), str(release / 'node_modules')], check=True)

    records.mkdir(mode=0o700)
    app_env = (inst / 'application.env').read_text()
    app_env = re.sub(r'^PC_APP_RELEASE_ID=.*$', f'PC_APP_RELEASE_ID=pc-local-{s}', app_env, flags=re.M)
    app_env = re.sub(r'^VERCEL_GIT_COMMIT_SHA=.*$', f'VERCEL_GIT_COMMIT_SHA={commit}', app_env, flags=re.M)
    fd = os.open(records / 'app.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(app_env)
    host = json.loads((prev_build / 'host-config.json').read_text())
    host = json.loads(Swap(host['releaseCommit'], commit).text(json.dumps(host)))
    host.update({'environmentFile': str(records / 'app.env'), 'stateDirectory': str(records / 'state'),
                 'applicationHome': str(home), 'sandboxScript': str(release / 'ops/pc-host/linux-application-sandbox.sh')})
    fix_release_permissions(release)
    host['sandboxScriptSha256'] = sha_file(host['sandboxScript'])
    (records / 'host-config.json').write_text(json.dumps(host, indent=2) + '\n')
    os.chmod(records / 'host-config.json', 0o600)
    home.mkdir(mode=0o700, exist_ok=True)
    os.chown(home, APP_UID, APP_GID)
    os.chmod(home, 0o700)

    # Next writes .next and rewrites next-env.d.ts (same content) during the build.
    give_to_builder(release / '.next')
    (release / 'next-env.d.ts').touch(mode=0o640, exist_ok=True)  # generated, not tracked
    os.chown(release / 'next-env.d.ts', APP_UID, APP_GID)
    os.chmod(release / 'next-env.d.ts', 0o640)
    try:
        out = subprocess.run(['/usr/bin/unshare', '--net', '--', NODE, str(release / 'ops/pc-host/build.mjs'),
                              str(records / 'host-config.json')], cwd=release, env={'PATH': env['PATH']}, text=True, capture_output=True)
        (records / 'driver.log').write_text(out.stdout + out.stderr)
        need(out.returncode == 0, f'build failed; see {records}/driver.log and {records}/state/build-*.log')
    finally:
        fix_release_permissions(release)
        # The runtime pins a few files at 0644 (e.g. pg_hba.conf, compose.yaml); keep the previous release's modes.
        for directory, _, files in os.walk(previous):
            for name in files:
                old = os.path.join(directory, name)
                new = release / os.path.relpath(old, previous)
                if not os.path.islink(old) and new.is_file() and not new.is_symlink():
                    mode = stat.S_IMODE(os.lstat(old).st_mode)
                    if mode in (0o644, 0o755):
                        os.chmod(new, mode)
    need((release / '.next/BUILD_ID').is_file(), 'build produced no BUILD_ID')
    stray = [str(p) for p in release.rglob('__pycache__')]
    need(not stray, f'unexpected bytecode in release: {stray[:3]}')
    print(json.dumps({'built': s, 'buildId': (release / '.next/BUILD_ID').read_text().strip()}))


def prepare(commit):
    s = short(commit)
    release, target = RELEASES / s, PRIVATE / f'installation-{s}'
    need((release / '.next/BUILD_ID').is_file(), f'build {s} first')
    need(not target.exists(), f'{target} already exists')
    runtime_text, runtime, inst, units = current_state()
    need(Path(runtime['releaseDirectory']) != release, 'already running this release')
    generate(runtime_text, units, inst, commit, release, target)
    old = Path(runtime['releaseDirectory']).name
    for kind in ('host-state', 'runtime-logs'):
        model, made = ROOT / f'{kind}-{old}', ROOT / f'{kind}-{s}'
        if model.is_dir() and not made.exists():
            st = model.stat()
            made.mkdir(mode=stat.S_IMODE(st.st_mode))
            os.chown(made, st.st_uid, st.st_gid)
            os.chmod(made, stat.S_IMODE(st.st_mode))
    # The host verifies the build receipt from its own state directory before starting Next.
    receipt = PRIVATE / f'build-{s}' / 'state/prepared.json'
    need(receipt.is_file(), 'build receipt missing')
    shutil.copyfile(receipt, ROOT / f'host-state-{s}' / 'prepared.json')
    os.chmod(ROOT / f'host-state-{s}' / 'prepared.json', 0o600)
    print(json.dumps({'prepared': str(target), 'files': len(list(target.iterdir()))}))


def wait_version(commit, seconds):
    end, last = time.time() + seconds, None
    time.sleep(5)
    while time.time() < end:
        if unit_state('tuat-local-app.service').get('ActiveState') == 'failed':
            print(json.dumps({'appFailed': run(['journalctl', '-u', 'tuat-local-app.service', '-n', '3', '--no-pager', '-o', 'cat'])[-300:]}))
            return False
        try:
            last = version(LOOPBACK_VERSION, 5)
            if last.get('version') == commit:
                return True
        except Exception as error:  # still starting
            last = repr(error)
        time.sleep(3)
    print(json.dumps({'versionWaitTimedOut': str(last)[:200]}))
    return False


def install_files(pairs):
    for source, destination in pairs:
        st = Path(destination).stat()
        tmp = Path(str(destination) + '.pc-release-tmp')
        tmp.write_bytes(Path(source).read_bytes())
        os.chown(tmp, st.st_uid, st.st_gid)
        os.chmod(tmp, stat.S_IMODE(st.st_mode))
        os.replace(tmp, destination)


def jobs_running():
    journal = json.loads((ROOT / 'jobs/journal.json').read_text())
    return [name for name, job in journal.get('jobs', {}).items() if job.get('status') == 'running']


def switch(commit, execute):
    s = short(commit)
    inst = PRIVATE / f'installation-{s}'
    need((inst / 'runtime.json').is_file(), f'prepare {s} first')
    _, runtime, current_inst, _ = current_state()
    old_commit = json.loads((current_inst / 'host.json').read_text())['releaseCommit']
    need(old_commit != commit, 'already running this release')
    new_files = [(inst / f'proposed-{u}', UNIT_DIR / u) for u in SERVICE_UNITS] + [(inst / 'runtime.json', ETC_RUNTIME)]
    old_files = [(inst / f'previous-{u}', UNIT_DIR / u) for u in SERVICE_UNITS] + [(inst / 'previous-runtime.json', ETC_RUNTIME)]
    for source, destination in old_files:
        need(Path(source).read_bytes() == Path(destination).read_bytes(), f'{destination} changed since prepare; prepare again')
    print(json.dumps({'from': old_commit, 'to': commit, 'steps': ['stop timer', 'stop jobs (none running)', 'stop app',
          'install 3 units + runtime.json', 'daemon-reload', 'start app', 'wait /api/version', 'start jobs', 'start timer',
          'verify backup seal'], 'rollback': 'previous units + runtime.json, start previous app'}))
    if not execute:
        return 0
    need(unit_state('tuat-local-backup.service').get('ActiveState') in ('inactive', 'failed'), 'backup is running; retry later')
    run(['systemctl', 'stop', TIMER])
    need(unit_state('tuat-local-backup.service').get('ActiveState') in ('inactive', 'failed'), 'backup started; start timer and retry')
    for _ in range(40):
        if not jobs_running():
            break
        time.sleep(3)
    if jobs_running():
        run(['systemctl', 'start', TIMER])
        raise Refused('a job is still running; nothing switched')
    run(['systemctl', 'stop', 'tuat-local-jobs.service'])
    run(['systemctl', 'stop', 'tuat-local-app.service'])
    # The app refuses to start while the backup unit is 'failed'. Keep the failure in the journal, clear only the flag.
    if unit_state('tuat-local-backup.service').get('ActiveState') == 'failed':
        print(json.dumps({'backupWasFailed': run(['journalctl', '-u', 'tuat-local-backup.service', '-n', '2', '--no-pager', '-o', 'cat'])[-300:]}))
        run(['systemctl', 'reset-failed', 'tuat-local-backup.service'])
    install_files(new_files)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'start', 'tuat-local-app.service'])
    if not wait_version(commit, 300):
        print(json.dumps({'rollingBack': True}))
        subprocess.run(['systemctl', 'stop', 'tuat-local-app.service'])
        install_files(old_files)
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'start', 'tuat-local-app.service'])
        ok = wait_version(old_commit, 300)
        if ok:
            run(['systemctl', 'start', 'tuat-local-jobs.service'])
            run(['systemctl', 'start', TIMER])
        print(json.dumps({'rolledBack': ok}))
        return 1
    run(['systemctl', 'start', 'tuat-local-jobs.service'])
    time.sleep(20)
    jobs_state = unit_state('tuat-local-jobs.service').get('ActiveState')
    run(['systemctl', 'start', TIMER])
    import importlib.util
    sys.path.insert(0, str(RELEASES / s / 'ops/local-minimal'))
    spec = importlib.util.spec_from_file_location('tuat_periodic_new', RELEASES / s / 'ops/local-minimal/periodic.py')
    periodic = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(periodic)
    try:
        periodic.seal(json.loads((inst / 'backup.json').read_text()))
        seal_state = 'valid'
    except Exception as error:
        seal_state = f'INVALID: {error!r}'[:200]
    result = {'switched': commit, 'loopback': version(LOOPBACK_VERSION), 'jobs': jobs_state,
              'timer': unit_state(TIMER).get('ActiveState'), 'backupSeal': seal_state}
    try:
        result['public'] = version(PUBLIC_VERSION, 15)
    except Exception as error:
        result['public'] = repr(error)[:200]
    print(json.dumps(result, ensure_ascii=False))
    return 0 if jobs_state == 'active' and seal_state == 'valid' else 4


def prune(keep, execute):
    """Remove release generations beyond the running one and the `keep` newest others.

    One generation = releases/<s>, private/installation-<s>, private/build-<s>, host-state-<s>, runtime-logs-<s>,
    build-home-<s>. Private transition records and backups are never touched here.
    """
    _, runtime, _, _ = current_state()
    running = Path(runtime['releaseDirectory']).name
    releases = sorted((p for p in RELEASES.iterdir() if p.is_dir() and re.fullmatch('[0-9a-f]{7}', p.name)),
                      key=lambda p: p.stat().st_mtime, reverse=True)
    kept = [running] + [p.name for p in releases if p.name != running][:keep]
    doomed = [p.name for p in releases if p.name not in kept]
    paths = []
    for s in doomed:
        paths += [RELEASES / s, PRIVATE / f'installation-{s}', PRIVATE / f'build-{s}',
                  ROOT / f'host-state-{s}', ROOT / f'runtime-logs-{s}', ROOT / f'build-home-{s}']
    known = {p.name for p in releases}
    for kind in ('host-state', 'runtime-logs', 'build-home'):
        # Leftovers of generations whose release directory is already gone (not shared, not current).
        for p in ROOT.glob(f'{kind}-*'):
            s = p.name[len(kind) + 1:]
            if s not in known and s not in kept and p not in paths and re.fullmatch('[0-9a-f]{7}', s):
                paths.append(p)
    paths = [p for p in paths if p.exists()]
    # The running configuration must not reference anything we delete.
    # Anything the running configuration still points at (e.g. a shared auth.env or app home) stays.
    inst_now = Path(runtime['releaseManifest']).parent
    referenced = ETC_RUNTIME.read_text() + ''.join((inst_now / n).read_text() for n in CONFIGS)
    protected = [str(p) for p in paths if str(p) + '/' in referenced or str(p) + '"' in referenced]
    paths = [p for p in paths if str(p) not in protected]
    if protected:
        print(json.dumps({'keptBecauseReferenced': protected}))
    size = 0
    for p in paths:
        for directory, _, files in os.walk(p):
            for name in files:
                try:
                    size += os.lstat(os.path.join(directory, name)).st_size
                except OSError:
                    pass
    print(json.dumps({'running': running, 'kept': kept, 'pruneGenerations': doomed, 'paths': len(paths),
                      'bytes': size, 'execute': execute}))
    if execute:
        for p in paths:
            shutil.rmtree(p)
    return 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    command = argv[1]
    need(os.geteuid() == 0, 'run as root inside WSL')
    if command == 'replay-check':
        return 0 if replay_check(argv[2], argv[3]) else 1
    if command == 'build':
        build(argv[2])
        return 0
    if command == 'prepare':
        prepare(argv[2])
        return 0
    if command == 'switch':
        return switch(argv[2], '--execute' in argv)
    if command == 'release':
        # build + prepare + switch in one go; each step refuses instead of guessing.
        build(argv[2])
        prepare(argv[2])
        return switch(argv[2], True)
    if command == 'prune':
        keep = int(argv[argv.index('--keep') + 1]) if '--keep' in argv else 2
        return prune(keep, '--execute' in argv)
    raise Refused(f'unknown command: {command}')


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv))
    except Refused as error:
        print(json.dumps({'refused': str(error)}, ensure_ascii=False))
        sys.exit(3)
