import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { FlatList, ScrollView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/src/shared/theme';
import { prewarmIssueScreenData } from '@/src/features/daily/issues';

(ScrollView as any).defaultProps = {
  ...(ScrollView as any).defaultProps,
  bounces: false,
  alwaysBounceVertical: false,
};

(FlatList as any).defaultProps = {
  ...(FlatList as any).defaultProps,
  bounces: false,
  alwaysBounceVertical: false,
};

export default function RootLayout() {
  // 冷启动即开始读本机 Issue 数据，等首屏挂载时直接命中缓存，减少白屏/骨架时间
  useEffect(() => {
    void prewarmIssueScreenData();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationThemeProvider value={DefaultTheme}>
            <BottomSheetModalProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="settings/index" />
                <Stack.Screen name="settings/theme" />
                <Stack.Screen name="auth" />
              </Stack>
              <StatusBar style="auto" />
            </BottomSheetModalProvider>
          </NavigationThemeProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
