# Issue Android online updates

The server serves `https://updates.qiuzizhao.com/issue/latest.json` and immutable
APK URLs under `/issue/releases/`. Other apps can use their own directories.

- Origin directory: `/var/www/app-updates` on the existing Ubuntu server.
- Nginx site: `/etc/nginx/sites-available/app-updates`.
- Nginx locations: `/etc/nginx/snippets/app-updates-locations.conf` (source in `server/updates/locations.conf`).
- DNS: Cloudflare proxied A record `updates` to the existing server.
- HTTPS: independent Let's Encrypt certificate. The HTTP listener also supports the existing Cloudflare Flexible mode by respecting the forwarded visitor scheme; direct HTTP visits redirect to HTTPS. Flexible leaves the Cloudflare-to-origin leg unencrypted. A future per-host Full (strict) rule can enable encrypted origin traffic without changing this site configuration.
- Metadata: `Cache-Control: no-store` plus CDN-specific no-store headers.
- APK: versioned filename, one-year immutable cache; never overwrite a released file.
- All other app-update paths are inaccessible, including staging and previous metadata.

The app checks on cold start and offers a manual Settings check. Automatic checks
are quiet on network failure. Choosing Later suppresses that release on automatic
checks; a manual check always allows finding it. The app downloads only from the
update hostname, validates size and SHA-256, and checks the package, increasing
version code and signing certificate against the installed app before installation.
The user grants Android's installation permission and confirms the system installer.
No account login or local issue data is involved in checking for updates.

Native integration is preserved by `plugins/with-android-updates.js` and
`plugins/android/IssueUpdates.kt`. The release signing key remains outside Git.

## Publish a release

1. Increase `expo.android.versionCode` (and update the visible version as needed).
2. Commit/push source before prebuild.
3. Run `CI=1 npx expo prebuild --platform android` and `npm run apk`.
4. Publish with Python 3 + Paramiko and the local Android SDK:

```sh
python3 scripts/publish-android.py --note '更新说明'
```

SSH uses known-host verification and a local agent/key, `ISSUE_DEPLOY_PASSWORD`,
or an interactive password prompt. Credentials are never part of the APK.
The publisher verifies the configured signing key, the uploaded file checksum,
and a full public HTTPS download before it atomically replaces `latest.json`.
It refuses downgrades or changes to already published version codes. The previous
manifest remains on the server for operator rollback of release discovery (not
Android application downgrades).

Validate cache behavior after publishing: metadata must not return a CDN HIT;
a versioned APK should return `CF-Cache-Status: HIT` after an initial download.
APK paths support HTTP range requests. Do not enable HTML-only challenges or
interactive bot challenges on these machine-readable update paths.

## Verified release

On 2026-11-04, Issue 1.0.10 (16) was published and tested on an Android 15
ARM64 emulator. The installed build 14 discovered the public manifest, downloaded
and validated build 16, requested install-source permission and completed the
system installer update. Local issue data survived, and the updated app reported
that build 16 was current. Cloudflare returned HIT for the versioned APK, DYNAMIC
with no-store for metadata, and 206 for range downloads. Existing Flexible mode
was retained; the HTTP listener avoids redirecting HTTPS visitors forwarded by
Cloudflare. Existing users install this updater-enabled APK once before future
in-app updates can be offered.
