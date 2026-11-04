const $ = (id) => document.getElementById(id);
const button = $('download');

function validate(data) {
  if (!data || data.packageName !== 'com.qiuzizhao.issueapp' || !Number.isSafeInteger(data.versionCode) || data.versionCode < 1 ||
      typeof data.versionName !== 'string' || !data.versionName || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > 209715200 ||
      typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256) || !Array.isArray(data.notes) || data.notes.length > 20 ||
      !data.notes.every((note) => typeof note === 'string' && note.length <= 1000)) throw new Error('Invalid release');
  const url = new URL(data.apkUrl);
  if (url.origin !== 'https://updates.qiuzizhao.com' || url.username || url.password || url.search || url.hash ||
      !/^\/issue\/releases\/[A-Za-z0-9._-]+\.apk$/.test(url.pathname)) throw new Error('Invalid download URL');
  return data;
}

async function loadRelease() {
  button.classList.add('disabled'); button.removeAttribute('href'); button.setAttribute('aria-disabled', 'true');
  $('download-label').textContent = '加载中…'; $('download-version').textContent = '正在获取版本…';
  $('release-status').hidden = true; $('retry').hidden = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/issue/latest.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Release not available');
    const release = validate(await response.json());
    $('download-version').textContent = `v${release.versionName} · ${(release.size / 1024 / 1024).toFixed(1)} MB`;
    button.href = release.apkUrl; button.classList.remove('disabled'); button.setAttribute('aria-disabled', 'false');
    $('download-label').textContent = '下载 APK';
  } catch {
    $('download-version').textContent = '版本获取失败'; $('download-label').textContent = '暂时无法下载';
    $('release-status').textContent = '暂时无法获取安装包，请重试'; $('release-status').hidden = false; $('retry').hidden = false;
  } finally { clearTimeout(timer); }
}
$('retry').addEventListener('click', () => void loadRelease());
button.addEventListener('click', (event) => { if (button.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
void loadRelease();
