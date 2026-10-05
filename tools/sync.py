#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Install or check a pinned Kurt snapshot without overwriting local edits."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from export import ROOT, PROFILES, digest, source_stamp


def revision():
    dirty = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True)
    if dirty.strip():
        raise ValueError('Commit Kurt changes before syncing: consumers must point to a reproducible revision.')
    return subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()


def safe(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or path == root.resolve():
        raise ValueError(f'Path outside consumer: {relative}')
    return path


def desired(profile):
    config = PROFILES[profile]
    exported = ROOT / '.build/exports' / profile / 'assets'
    if not (exported / 'manifest.json').is_file():
        raise ValueError('Run npm run export first.')
    if json.loads((exported.parent / 'inputs.json').read_text()) != source_stamp(profile):
        raise ValueError(f'{profile}: stale export. Run npm run export first.')
    files = {f'{config["assets"]}/{p.name}': p for p in exported.iterdir() if p.is_file()}
    files.update({target: ROOT / source for source, target in config['runtime'].items()})
    files.update({f'{config["assets"]}/KURT-LICENSE.md': ROOT / 'LICENSE.md'})
    license_name = 'GPL-2.0-or-later.txt' if profile == 'mutti' else 'AGPL-3.0-only.txt'
    if license_name:
        files[f'{config["assets"]}/{license_name}'] = ROOT / 'licenses' / license_name
    files[f'{config["assets"]}/CC-BY-4.0.txt'] = ROOT / 'licenses/CC-BY-4.0.txt'
    files[f'{config["assets"]}/ATTRIBUTION.md'] = ROOT / 'ATTRIBUTION.md'
    return files


def prepare(profile, consumer, commit, adopt=False, check=False):
    if not consumer.is_dir():
        raise ValueError(f'Consumer does not exist: {consumer}')
    targets = desired(profile)
    hashes = {name: digest(path) for name, path in sorted(targets.items())}
    version = json.loads((ROOT / 'package.json').read_text())['version']
    lock = {'repository': 'https://github.com/ralleur/kurt', 'version': version, 'revision': commit,
            'profile': profile, 'artworkVersion': json.loads((ROOT / 'assets/manifest.json').read_text())['version'], 'files': hashes}
    lock_path = consumer / 'kurt.lock.json'
    if lock_path.exists():
        previous = json.loads(lock_path.read_text())
        if previous['profile'] != profile:
            raise ValueError('Consumer profile differs from its Kurt lock.')
        old = previous['files']
    elif adopt:
        old = json.loads((ROOT / 'migration-baselines.json').read_text())[profile]
    elif check:
        raise ValueError(f'{consumer}: missing kurt.lock.json')
    else:
        old = {}
    conflicts = []
    for name in set(old) | set(targets):
        path = safe(consumer, name)
        if name in old:
            if not path.is_file() or digest(path) != old[name]:
                conflicts.append(name)
        elif path.exists():
            conflicts.append(name)
    if conflicts:
        raise ValueError(f'{profile}: local changes or unmanaged existing files; nothing overwritten: ' + ', '.join(sorted(conflicts)))
    if check:
        if json.loads(lock_path.read_text()) != lock:
            raise ValueError(f'{profile}: snapshot differs from Kurt {version} ({commit[:8]}). Run sync without --check.')
        return None
    return consumer, targets, set(old) - set(targets), lock


def install(prepared):
    consumer, targets, obsolete, lock = prepared
    for name, source in targets.items():
        path = safe(consumer, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + '.kurt-tmp')
        temporary.write_bytes(source.read_bytes())
        temporary.replace(path)
    for name in obsolete:
        safe(consumer, name).unlink()
    temporary = consumer / 'kurt.lock.json.tmp'
    temporary.write_text(json.dumps(lock, indent=2) + '\n')
    temporary.replace(consumer / 'kurt.lock.json')
    print(f'{lock["profile"]}: installed Kurt {lock["version"]} ({lock["revision"][:8]}), {len(targets)} files')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--consumer', choices=PROFILES)
    group.add_argument('--all', action='store_true')
    parser.add_argument('--root', type=Path, help='Single consumer checkout')
    parser.add_argument('--workspace', type=Path, default=ROOT.parent)
    parser.add_argument('--adopt', action='store_true', help='First migration; require exact recorded old file hashes')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.all and args.root:
        parser.error('--root is only for --consumer')
    commit = revision()
    # Preflight every consumer before writing any consumer.
    jobs = [prepare(p, args.root or args.workspace / PROFILES[p]['path'], commit, args.adopt, args.check)
            for p in PROFILES if args.all or p == args.consumer]
    if args.check:
        print(f'{len(jobs)} Kurt consumer(s) match {commit[:8]}; no local drift.')
    else:
        for job in jobs:
            install(job)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, FileNotFoundError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
