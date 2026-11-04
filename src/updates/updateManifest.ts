export type UpdateManifest = {
  packageName: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  sha256: string;
  size: number;
  notes: string[];
};

export function parseUpdateManifest(value: unknown): UpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('更新信息格式错误');
  const data = value as Record<string, unknown>;
  if (data.packageName !== 'com.qiuzizhao.issueapp' || typeof data.versionName !== 'string' || !data.versionName ||
      !Number.isSafeInteger(data.versionCode) || (data.versionCode as number) < 1 ||
      !Number.isSafeInteger(data.size) || (data.size as number) < 1 || (data.size as number) > 209715200 ||
      typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256) ||
      typeof data.apkUrl !== 'string' || !Array.isArray(data.notes) || data.notes.length > 20 ||
      !data.notes.every((note) => typeof note === 'string' && note.length <= 1000)) {
    throw new Error('更新信息格式错误');
  }
  const url = new URL(data.apkUrl);
  if (url.origin !== 'https://updates.qiuzizhao.com' || url.username || url.password ||
      !/^\/issue\/releases\/[A-Za-z0-9._-]+\.apk$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('更新下载地址无效');
  }
  return data as UpdateManifest;
}
