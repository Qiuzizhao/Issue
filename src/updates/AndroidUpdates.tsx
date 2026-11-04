import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Modal, NativeEventEmitter, NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { parseUpdateManifest, type UpdateManifest } from './updateManifest';

const native = Platform.OS === 'android' ? NativeModules.IssueUpdates : null;
export const androidInstalledVersion: { versionName: string; versionCode: number } | null = native ? { versionName: native.versionName, versionCode: native.versionCode } : null;
export function checkForAppUpdates() { DeviceEventEmitter.emit('IssueCheckForUpdates'); }
const skippedKey = '@issue/update-skipped-version';
let lastAutomaticCheck = 0;
const errorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : '请稍后重试';

export function AndroidUpdates() {
  const [update, setUpdate] = useState<UpdateManifest | null>(null);
  const [phase, setPhase] = useState<'available' | 'downloading' | 'ready'>('available');
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const checking = useRef(false);
  const busy = useRef(false);
  const check = useCallback(async (manual: boolean) => {
    if (!native || checking.current || busy.current) return;
    if (!manual && Date.now() - lastAutomaticCheck < 6 * 60 * 60 * 1000) return;
    checking.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://updates.qiuzizhao.com/issue/latest.json?t=${Date.now()}`, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error('暂时无法连接更新服务，请稍后重试');
      const next = parseUpdateManifest(await response.json());
      lastAutomaticCheck = Date.now();
      if (next.versionCode <= native.versionCode) {
        if (manual) Alert.alert('检查更新', `当前已是最新版本 ${native.versionName}（${native.versionCode}）`);
        return;
      }
      if (!manual && String(next.versionCode) === await AsyncStorage.getItem(skippedKey)) return;
      setUpdate(next); setPhase('available'); setPermissionNeeded(false); setVisible(true);
    } catch (error) {
      if (manual) Alert.alert('检查更新失败', errorMessage(error));
    } finally { clearTimeout(timeout); checking.current = false; }
  }, []);
  useEffect(() => {
    if (!native) return;
    const subscription = DeviceEventEmitter.addListener('IssueCheckForUpdates', () => void check(true));
    const progress = new NativeEventEmitter(native).addListener('IssueUpdateProgress', ({ received, total }) => {
      setPercent(total ? Math.min(100, Math.floor(received / total * 100)) : 0);
    });
    const timer = setTimeout(() => void check(false), 2000);
    return () => { clearTimeout(timer); subscription.remove(); progress.remove(); };
  }, [check]);
  const install = async () => {
    if (!update) return;
    try { setPermissionNeeded(!await native.install(update.versionCode)); }
    catch (error) { Alert.alert('安装更新失败', errorMessage(error)); }
  };
  const download = async () => {
    if (!update || busy.current) return;
    busy.current = true; setPhase('downloading'); setPercent(0);
    try {
      await native.download(update.apkUrl, update.sha256, update.size, update.versionCode);
      setPhase('ready'); await install();
    } catch (error) {
      if ((error as { code?: string })?.code !== 'CANCELLED') Alert.alert('下载更新失败', errorMessage(error));
      setPhase('available');
    } finally { busy.current = false; }
  };
  const dismiss = () => {
    if (phase === 'downloading') { native.cancelDownload(); setVisible(false); return; }
    setVisible(false);
    if (update) void AsyncStorage.setItem(skippedKey, String(update.versionCode)).catch(() => undefined);
  };
  if (!native || !update) return null;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}><View style={styles.card}>
        <Text style={styles.title}>发现新版本 {update.versionName}</Text>
        <Text style={styles.subtitle}>{(update.size / 1024 / 1024).toFixed(1)} MB</Text>
        {update.notes.map((note, index) => <Text key={index} style={styles.note}>• {note}</Text>)}
        {phase === 'downloading' ? <View style={styles.progress}><ActivityIndicator /><Text>正在下载 {percent}%</Text></View> : null}
        {phase === 'ready' ? <Text style={styles.note}>{permissionNeeded ? '请允许 Issue 安装应用，返回后点击“继续安装”。' : '下载完成，可以安装更新。'}</Text> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={dismiss} style={styles.button}><Text>{phase === 'downloading' ? '取消下载' : '稍后'}</Text></Pressable>
          {phase !== 'downloading' ? <Pressable accessibilityRole="button" onPress={() => void (phase === 'ready' ? install() : download())} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>{phase === 'ready' ? '继续安装' : '立即更新'}</Text></Pressable> : null}
        </View>
      </View></View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: '#0008', padding: 24 },
  card: { padding: 24, borderRadius: 20, backgroundColor: '#fff', maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#171a21' }, subtitle: { marginTop: 8, marginBottom: 16, color: '#677184' },
  note: { fontSize: 15, lineHeight: 23, marginBottom: 10, color: '#303949' }, progress: { flexDirection: 'row', gap: 12, marginVertical: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }, button: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12 },
  primary: { backgroundColor: '#3E63DD' }, primaryText: { color: '#fff', fontWeight: '600' },
});
