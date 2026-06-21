import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/new_session_screen.dart';
import 'screens/scan_screen.dart';
import 'screens/session_screen.dart';
import 'screens/sessions_screen.dart';
import 'screens/settings_screen.dart';
import 'state/notifications.dart';
import 'state/store.dart';
import 'state/theme_controller.dart';
import 'theme/theme.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final store = Store();
  final theme = ThemeController();

  // Tapping a notification deep-links to its session.
  onNotificationTapSession = (sessionId) {
    navigatorKey.currentState?.push(
      MaterialPageRoute(builder: (_) => SessionScreen(sessionId: sessionId)),
    );
  };

  // Fire-and-forget bootstrap.
  store.loadConfig();
  theme.load();
  initNotifications();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: store),
        ChangeNotifierProvider.value(value: theme),
      ],
      child: const ClaudeRemoteApp(),
    ),
  );
}

class ClaudeRemoteApp extends StatelessWidget {
  const ClaudeRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    final mode = context.watch<ThemeController>().mode;
    return MaterialApp(
      title: 'Claude Remote',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: buildTheme(AppPalette.light),
      darkTheme: buildTheme(AppPalette.dark),
      themeMode: mode,
      // Keep the global palette in sync with the resolved brightness so widgets
      // reading `appColors` repaint correctly on light/dark (and OS) changes.
      builder: (context, child) {
        appColors = Theme.of(context).brightness == Brightness.dark
            ? AppPalette.dark
            : AppPalette.light;
        return child!;
      },
      home: const SessionsScreen(),
      routes: {
        '/new': (_) => const NewSessionScreen(),
        '/settings': (_) => const SettingsScreen(),
        '/scan': (_) => const ScanScreen(),
      },
    );
  }
}
