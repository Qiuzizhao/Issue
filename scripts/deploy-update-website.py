#!/usr/bin/env python3
"""Deploy the static download portal without changing published APKs or metadata."""
import argparse
import getpass
from pathlib import Path
import os
import shlex
import uuid
import paramiko

ROOT = Path(__file__).resolve().parents[1]

def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status(): raise RuntimeError(error or output)
    return output

def deploy(ssh):
    token = uuid.uuid4().hex
    staging = f'/tmp/issue-update-web-{token}'
    backup = f'/var/backups/app-updates-web-{token}'
    run(ssh, f'mkdir -p {staging}/assets')
    ftp = ssh.open_sftp()
    try:
        for source in (ROOT / 'server/updates/web').rglob('*'):
            if source.is_file():
                relative = source.relative_to(ROOT / 'server/updates/web').as_posix()
                ftp.put(str(source), f'{staging}/{relative}')
        ftp.put(str(ROOT / 'server/updates/locations.conf'), f'{staging}/locations.conf')
        run(ssh, f'sudo -n mkdir -p {backup} /var/www/app-updates/assets && '
            f'sudo -n cp /etc/nginx/snippets/app-updates-locations.conf {backup}/locations.conf && '
            f'if test -f /var/www/app-updates/index.html; then sudo -n cp /var/www/app-updates/index.html {backup}/index.html; fi')
        # Publish assets before HTML. APK releases and latest.json remain in place.
        for asset in (ROOT / 'server/updates/web/assets').iterdir():
            if asset.is_file():
                name = shlex.quote(asset.name)
                run(ssh, f'sudo -n install -m 644 {staging}/assets/{name} /var/www/app-updates/assets/{name}.new && sudo -n mv /var/www/app-updates/assets/{name}.new /var/www/app-updates/assets/{name}')
        run(ssh, f'sudo -n install -m 644 {staging}/index.html /var/www/app-updates/index.html.new && sudo -n mv /var/www/app-updates/index.html.new /var/www/app-updates/index.html')
        run(ssh, f'sudo -n install -m 644 {staging}/locations.conf /etc/nginx/snippets/app-updates-locations.conf')
        try: run(ssh, 'sudo -n nginx -t && sudo -n systemctl reload nginx')
        except Exception:
            run(ssh, f'sudo -n cp {backup}/locations.conf /etc/nginx/snippets/app-updates-locations.conf && sudo -n nginx -t && sudo -n systemctl reload nginx')
            raise
        print(f'Deployed https://updates.qiuzizhao.com/ (configuration backup: {backup})')
    finally:
        ftp.close()
        run(ssh, f'rm -rf {staging}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='43.155.250.122')
    parser.add_argument('--port', type=int, default=23456)
    parser.add_argument('--user', default='ubuntu')
    args = parser.parse_args()
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys()
    try:
        try: ssh.connect(args.host, port=args.port, username=args.user, password=os.environ.get('ISSUE_DEPLOY_PASSWORD'), timeout=15)
        except paramiko.SSHException as error:
            if not isinstance(error, paramiko.AuthenticationException) and 'No authentication methods available' not in str(error):
                raise
            ssh.connect(args.host, port=args.port, username=args.user, password=getpass.getpass('SSH password: '), timeout=15)
        deploy(ssh)
    finally: ssh.close()

if __name__ == '__main__': main()
