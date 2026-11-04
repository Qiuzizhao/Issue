import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import appConfig from '../../../app.json';
import { androidInstalledVersion, checkForAppUpdates } from '@/src/updates/AndroidUpdates';

import { Header, IconButton, Screen } from '@/src/shared/components';
import { colors, useThemeColors } from '@/src/shared/theme';
import { styles } from './styles';

const appVersion = androidInstalledVersion
  ? `${androidInstalledVersion.versionName} (${androidInstalledVersion.versionCode})`
  : `${appConfig.expo.version} (${appConfig.expo.ios.buildNumber})`;

export function SettingsScreen() {
  const themeColors = useThemeColors();

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
