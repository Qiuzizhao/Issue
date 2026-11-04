const apps = { issue: 'com.qiuzizhao.issueapp', booky: 'com.qiuzizhao.booky' };

function validate(data, app) {
  if (!data || data.packageName !== apps[app] || !Number.isSafeInteger(data.versionCode) || data.versionCode < 1 ||
      typeof data.versionName !== 'string' || !data.versionName || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > 209715200 ||
      typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256) || !Array.isArray(data.notes) || data.notes.length > 20 ||
      !data.notes.every((note) => typeof note === 'string' && note.length <= 1000)) throw new Error('Invalid release');
  const url = new URL(data.apkUrl);
  const allowed = new RegExp(`^https://updates\\.qiuzizhao\\.com/${app}/releases/[A-Za-z0-9._-]+\\.apk$`);
  if (!allowed.test(data.apkUrl) || url.origin !== 'https://updates.qiuzizhao.com' || url.username || url.password || url.search || url.hash) throw new Error('Invalid download URL');
  return data;
}

for (const card of document.querySelectorAll('.app-card')) {
  // Keep supporting the previous Issue-only HTML while cached pages expire.
  const app = card.dataset.app || 'issue';
  if (!Object.hasOwn(apps, app)) continue;
  const find = (role, legacy) => card.querySelector(`[data-role="${role}"]`) || card.querySelector(`#${legacy}`);
  const button = find('download', 'download');
  const label = find('label', 'download-label');
  const version = find('version', 'download-version');
  const status = find('status', 'release-status');
  const retry = find('retry', 'retry');
  async function loadRelease() {
    button.classList.add('disabled'); button.removeAttribute('href'); button.setAttribute('aria-disabled', 'true');
    label.textContent = '加载中…'; version.textContent = '正在获取版本…';
    status.hidden = true; retry.hidden = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/${app}/latest.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Release not available');
      const release = validate(await response.json(), app);
      version.textContent = `v${release.versionName} · ${(release.size / 1024 / 1024).toFixed(1)} MB`;
      button.href = release.apkUrl; button.classList.remove('disabled'); button.setAttribute('aria-disabled', 'false');
      label.textContent = '安卓下载';
    } catch {
      version.textContent = '版本获取失败'; label.textContent = '暂时无法下载';
      status.textContent = '暂时无法获取安装包，请重试'; status.hidden = false; retry.hidden = false;
    } finally { clearTimeout(timer); }
  }
  retry.addEventListener('click', () => void loadRelease());
  button.addEventListener('click', (event) => { if (button.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
  void loadRelease();
}
