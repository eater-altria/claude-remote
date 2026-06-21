import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// User theme preference: follow the OS, or pin light/dark. Persisted under the
/// same key the Expo app uses. Mirrors app/src/theme/ThemeProvider.tsx.
class ThemeController extends ChangeNotifier {
  static const _key = 'claude-remote.theme.v1';

  ThemeMode _mode = ThemeMode.system;
  ThemeMode get mode => _mode;

  Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    switch (sp.getString(_key)) {
      case 'light':
        _mode = ThemeMode.light;
      case 'dark':
        _mode = ThemeMode.dark;
      case 'system':
        _mode = ThemeMode.system;
    }
    notifyListeners();
  }

  void setMode(ThemeMode mode) {
    _mode = mode;
    notifyListeners();
    SharedPreferences.getInstance().then((sp) => sp.setString(_key, mode.name));
  }
}
