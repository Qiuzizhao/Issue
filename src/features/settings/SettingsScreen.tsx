import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import appConfig from '../../../app.json';
import { androidInstalledVersion, checkForAppUpdates } from '@/src/updates/AndroidUpdates';

import { Header, IconButton, Screen } from '@/src/shared/components';
import { colors, useThemeColors } from '@/src/shared/theme';
import { styles } from './styles';
import { getLocalMode, setLocalMode, subscribeLocalMode } from '@/src/local/localMode';
import { subscribeSync } from '@/src/sync/manualSync';

const appVersion = androidInstalledVersion
  ? `${androidInstalledVersion.versionName} (${androidInstalledVersion.versionCode})`
  : `${appConfig.expo.version} (${appConfig.expo.ios.buildNumber})`;

export function SettingsScreen() {
  const themeColors = useThemeColors();
  const [localMode, setLocalModeValue] = useState(false);
  const [modeReady, setModeReady] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getLocalMode().then((enabled) => {
      if (mounted) { setLocalModeValue(enabled); setModeReady(true); }
    }).catch(() => {
      if (mounted) Alert.alert('读取本地模式失败', '请重新打开设置后重试。');
    });
    const unsubscribeMode = subscribeLocalMode(setLocalModeValue);
    const unsubscribeSync = subscribeSync((state) => setSyncing(state.status === 'running'));
    return () => { mounted = false; unsubscribeMode(); unsubscribeSync(); };
  }, []);

  const toggleLocalMode = async (enabled: boolean) => {
    setSavingMode(true);
    try { await setLocalMode(enabled); }
    catch { Alert.alert('保存失败', '本地模式未改变，请重试。'); }
    finally { setSavingMode(false); }
  };

  return (
    <Screen>
      <Header
        title="设置"
        action={<IconButton name="chevron-back" label="返回 Issue" transparent onPress={() => router.back()} />}
      />
      <View style={styles.background}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.push('/settings/theme' as never)} style={({ pressed }) => [styles.settingRow, pressed && styles.cardPressed]}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="color-palette-outline" size={20} color={themeColors.primary} />
            </View>
            <View style={styles.settingRowText}>
              <Text style={styles.helperTitle}>主题色设置</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.muted} />
          </Pressable>

          <Pressable onPress={() => router.push('/auth' as never)} style={({ pressed }) => [styles.settingRow, pressed && styles.cardPressed]}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="person-circle-outline" size={22} color={themeColors.primary} />
            </View>
            <View style={styles.settingRowText}>
              <Text style={styles.helperTitle}>账号设置</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.muted} />
          </Pressable>

          <View style={styles.settingRow}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="phone-portrait-outline" size={22} color={themeColors.primary} />
            </View>
            <View style={styles.settingRowText}>
              <Text style={styles.helperTitle}>本地模式</Text>
              <Text style={styles.helperText}>{syncing ? '正在同步，完成后可切换' : '开启后仅保存在本机，暂停云端同步'}</Text>
            </View>
            <Switch
              accessibilityLabel="本地模式"
              disabled={!modeReady || savingMode || syncing}
              value={localMode}
              onValueChange={(enabled) => void toggleLocalMode(enabled)}
              trackColor={{ true: themeColors.primary }}
            />
          </View>

          <View style={styles.settingsSection}>
            <View style={styles.settingRowText}>
              <Text style={styles.sectionTitle}>关于 Issue</Text>
              <Text style={styles.helperText}>本地优先的开发者 Issue 追踪 · 版本 {appVersion}</Text>
            </View>
          </View>
          {Platform.OS === 'android' && androidInstalledVersion ? (
            <Pressable accessibilityRole="button" accessibilityLabel="检查更新" onPress={checkForAppUpdates} style={({ pressed }) => [styles.settingRow, pressed && styles.cardPressed]}>
              <View style={styles.settingIconWrap}><Ionicons name="cloud-download-outline" size={22} color={themeColors.primary} /></View>
              <View style={styles.settingRowText}><Text style={styles.helperTitle}>检查更新</Text><Text style={styles.helperText}>当前版本 {appVersion}</Text></View>
              <Ionicons name="chevron-forward" size={19} color={colors.muted} />
            </Pressable>
          ) : null}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </Screen>
  );
}
