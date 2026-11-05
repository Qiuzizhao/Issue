const test = require('node:test');
const assert = require('node:assert/strict');
const { patchKotlinFile } = require('../plugins/with-android-display-density');

for (const name of ['MainApplication', 'MainActivity']) {
  test(`${name}: preserves lifecycle code and injects adaptation once`, () => {
    const file = { language: 'kt', contents: `package example\nclass ${name} : Base() {\n  override fun onCreate() { super.onCreate() }\n}\n` };
    patchKotlinFile(file, name);
    const once = file.contents;
    patchKotlinFile(file, name);
    assert.equal(file.contents, once);
    assert.equal((once.match(/override fun attachBaseContext/g) || []).length, 1);
    assert.ok(once.includes('override fun onCreate() { super.onCreate() }'));
    assert.ok(once.includes('val configuration = Configuration()'));
    assert.ok(once.includes('manager.defaultDisplay.getRealMetrics(metrics)'));
    assert.ok(once.includes('android.hardware.sensor.hinge_angle'));
  });
}

test('refuses to replace an unrelated context override', () => {
  const file = { language: 'kt', contents: 'package example\nclass MainActivity : Base() {\n  override fun attachBaseContext(newBase: Context) { super.attachBaseContext(customContext(newBase)) }\n}\n' };
  assert.throws(() => patchKotlinFile(file, 'MainActivity'), /自定义实现/);
});
