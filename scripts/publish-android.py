#!/usr/bin/env python3
"""Publish an immutable signed APK, verify its public URL, then atomically update latest.json."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import urllib.request
import uuid

import paramiko

DOMAIN = 'https://updates.qiuzizhao.com'
ROOT = '/var/www/app-updates/issue'

def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output or 'Remote operation failed')
    return output.strip()

def inspect(apk):
    sdk = Path(os.environ.get('ANDROID_HOME', os.environ.get('ANDROID_SDK_ROOT', str(Path.home() / 'Library/Android/sdk'))))
    tools = sorted((sdk / 'build-tools').iterdir(), key=lambda p: tuple(int(x) for x in re.findall(r'\d+', p.name)))[-1]
    subprocess.run([str(tools / 'apksigner'), 'verify', str(apk)], check=True)
    badging = subprocess.check_output([str(tools / 'aapt2'), 'dump', 'badging', str(apk)], text=True)
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not match or match[1] != 'com.qiuzizhao.issueapp':
        raise ValueError('This is not an Issue APK')
    certs = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--print-certs', str(apk)], text=True)
    props = dict(line.split('=', 1) for line in (Path.home() / '.config/issue/android-signing.properties').read_text().splitlines() if '=' in line)
    env = dict(os.environ, ISSUE_SIGNING_PASSWORD=props['storePassword'])
    cert = subprocess.check_output(['keytool', '-exportcert', '-alias', props['keyAlias'], '-keystore', props['storeFile'], '-storepass:env', 'ISSUE_SIGNING_PASSWORD'], env=env, stderr=subprocess.DEVNULL)
    if hashlib.sha256(cert).hexdigest() not in certs:
        raise ValueError('APK does not use the configured Issue release signing key')
    return match[3], int(match[2])

def publish(ssh, apk, notes):
    if not notes or len(notes) > 20 or any(not isinstance(note, str) or not note or len(note) > 1000 for note in notes):
        raise ValueError('Provide 1-20 release notes of at most 1000 characters each')
    if not 0 < apk.stat().st_size <= 209715200: raise ValueError('APK size is outside the supported limit')
    version, code = inspect(apk)
    if not re.fullmatch(r'[0-9A-Za-z._-]+', version): raise ValueError('Unsafe version name')
    filename = f'Issue-{version}-{code}.apk'
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    manifest = dict(packageName='com.qiuzizhao.issueapp', versionName=version, versionCode=code,
                    apkUrl=f'{DOMAIN}/issue/releases/{filename}', sha256=digest, size=apk.stat().st_size, notes=notes)
    remote_apk = f'{ROOT}/releases/{filename}'
    old = run(ssh, f'if test -f {ROOT}/latest.json; then cat {ROOT}/latest.json; fi')
    if old:
        current = json.loads(old)
        if current['versionCode'] > code or (current['versionCode'] == code and current['sha256'] != digest):
            raise ValueError('Refusing to downgrade or replace an already published version')
    run(ssh, f'sudo -n mkdir -p {ROOT}/releases')
    current_digest = run(ssh, f'if test -f {shlex.quote(remote_apk)}; then sha256sum {shlex.quote(remote_apk)}; fi')
    if current_digest and current_digest.split()[0] != digest: raise ValueError('Immutable APK path already exists with different content')
    temp = f'/tmp/issue-publish-{uuid.uuid4().hex}'
    sftp = ssh.open_sftp()
    try:
        if not current_digest:
            sftp.put(str(apk), temp)
            assert run(ssh, f'sha256sum {temp}').split()[0] == digest, 'Remote upload checksum mismatch'
            staging = shlex.quote(remote_apk + '.new')
            run(ssh, f'sudo -n install -m 644 {temp} {staging} && sudo -n mv {staging} {shlex.quote(remote_apk)}')
        print('APK uploaded, checking public HTTPS download', flush=True)
        actual = hashlib.sha256()
        with urllib.request.urlopen(urllib.request.Request(manifest['apkUrl'], headers={'User-Agent': 'IssueUpdater/1.0'}), timeout=90) as response:
            while chunk := response.read(1024 * 1024): actual.update(chunk)
        if actual.hexdigest() != digest: raise ValueError('Public CDN APK checksum mismatch')
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
        with sftp.open(temp, 'wb') as f: f.write(manifest_bytes)
        run(ssh, f'sudo -n install -m 644 {temp} {ROOT}/latest.json.new')
        run(ssh, f'if test -f {ROOT}/latest.json; then sudo -n cp {ROOT}/latest.json {ROOT}/latest.json.previous; fi')
        run(ssh, f'sudo -n mv {ROOT}/latest.json.new {ROOT}/latest.json')
        with urllib.request.urlopen(urllib.request.Request(f'{DOMAIN}/issue/latest.json?verify={uuid.uuid4().hex}', headers={'User-Agent': 'IssueUpdater/1.0'}), timeout=20) as response:
            if json.load(response) != manifest: raise ValueError('Published manifest verification failed')
        print(f'Published Issue {version} ({code}): {manifest["apkUrl"]}')
    finally:
        run(ssh, f'rm -f {temp}')
        sftp.close()
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=Path('artifacts/Issue.apk'))
    parser.add_argument('--host', default='43.155.250.122')
    parser.add_argument('--port', type=int, default=23456)
    parser.add_argument('--user', default='ubuntu')
    parser.add_argument('--note', action='append', required=True)
    args = parser.parse_args()
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys()
    try:
        password = os.environ.get('ISSUE_DEPLOY_PASSWORD')
        try: ssh.connect(args.host, port=args.port, username=args.user, password=password, timeout=15)
        except paramiko.AuthenticationException:
            ssh.connect(args.host, port=args.port, username=args.user, password=getpass.getpass('SSH password: '), timeout=15)
        publish(ssh, args.apk.resolve(), args.note)
    finally: ssh.close()

if __name__ == '__main__': main()
