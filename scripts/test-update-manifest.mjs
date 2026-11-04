import assert from 'node:assert/strict';
import { parseUpdateManifest } from '../src/updates/updateManifest.ts';
const valid = { packageName: 'com.qiuzizhao.issueapp', versionName: '1.0.10', versionCode: 15, apkUrl: 'https://updates.qiuzizhao.com/issue/releases/Issue-1.0.10-15.apk', sha256: 'a'.repeat(64), size: 45000000, notes: ['在线更新'] };
assert.deepEqual(parseUpdateManifest(valid), valid);
for (const patch of [{ packageName: 'other' }, { versionCode: 1.5 }, { size: 0 }, { size: 300000000 }, { sha256: 'no' }, { notes: 'wrong' }, { apkUrl: 'http://updates.qiuzizhao.com/issue/releases/a.apk' }, { apkUrl: 'https://other.com/issue/releases/a.apk' }, { apkUrl: 'https://updates.qiuzizhao.com/issue/../a.apk' }, { apkUrl: valid.apkUrl + '?redirect=evil' }, { apkUrl: 'https://user:pass@updates.qiuzizhao.com/issue/releases/a.apk' }]) {
  assert.throws(() => parseUpdateManifest({ ...valid, ...patch }));
}
assert.throws(() => parseUpdateManifest(null));
console.log('Update manifest validation passed: valid release and malformed/unsafe inputs.');
