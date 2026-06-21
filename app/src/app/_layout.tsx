import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useStore } from '../state/store';
import { installNotificationHandlers, registerForNotifications } from '../state/notifications';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

function ThemedApp() {
  const { colors, scheme } = useTheme();
  const loadConfig = useStore((s) => s.loadConfig);
  const notificationsEnabled = useStore((s) => s.notificationsEnabled);

  React.useEffect(() => {
    loadConfig();
    installNotificationHandlers();
  }, [loadConfig]);

  // Ask for notification permission + set up the channel/category once the user
  // has notifications enabled. Local-only now — no server registration needed.
  React.useEffect(() => {
    if (notificationsEnabled) registerForNotifications().catch(() => {});
  }, [notificationsEnabled]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bgElevated },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700', color: colors.text },
              contentStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Sessions' }} />
            <Stack.Screen name="settings" options={{ title: 'Servers', presentation: 'modal' }} />
            <Stack.Screen name="new-session" options={{ title: 'New session', presentation: 'modal' }} />
            <Stack.Screen name="scan" options={{ title: 'Scan QR', presentation: 'modal' }} />
            <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
          </Stack>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
