const $ = (id) => document.getElementById(id);
let currentHash = '';
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
  $('download-label').textContent = '正在获取安装包…'; $('release-status').textContent = '正在连接更新服务…';
  $('release-status').classList.remove('error'); $('retry').hidden = true; $('copy-hash').disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/issue/latest.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Release not available');
    const release = validate(await response.json());
    $('download-version').textContent = `v${release.versionName}`;
    $('download-meta').textContent = `Build ${release.versionCode} · ${(release.size / 1024 / 1024).toFixed(1)} MB · APK`;
    $('release-version').textContent = `v${release.versionName} (${release.versionCode})`;
    const notes = release.notes.length ? release.notes : ['本版本暂无更新说明。'];
    $('release-notes').replaceChildren(...notes.map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    currentHash = release.sha256; $('checksum').textContent = currentHash; $('copy-hash').disabled = false;
    button.href = release.apkUrl; button.classList.remove('disabled'); button.setAttribute('aria-disabled', 'false');
    $('download-label').textContent = '下载 Android 版'; $('release-status').textContent = '已获取最新版本';
  } catch {
    $('download-version').textContent = '暂时无法获取版本'; $('download-meta').textContent = '请稍后重试';
    $('download-label').textContent = '暂时无法下载'; $('release-version').textContent = '获取失败';
    $('release-notes').replaceChildren(Object.assign(document.createElement('li'), { textContent: '暂时无法加载更新说明，请重新获取版本。' }));
    $('release-status').textContent = '更新服务暂不可用，请重试'; $('release-status').classList.add('error'); $('retry').hidden = false;
    $('checksum').textContent = '等待版本信息'; currentHash = '';
  } finally { clearTimeout(timer); }
}
$('retry').addEventListener('click', () => void loadRelease());
$('copy-hash').addEventListener('click', async () => {
  if (!currentHash) return;
  try { await navigator.clipboard.writeText(currentHash); $('copy-hash').textContent = '已复制'; }
  catch { $('copy-hash').textContent = '请选择上方校验值复制'; }
  setTimeout(() => { $('copy-hash').textContent = '复制校验值'; }, 2500);
});
button.addEventListener('click', (event) => { if (button.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
void loadRelease();
