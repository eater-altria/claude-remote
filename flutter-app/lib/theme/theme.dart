import 'package:flutter/material.dart';

/// Theme-aware design tokens — light/dark share the same [AppPalette] shape and
/// are selected at runtime. Mirrors app/src/theme/theme.ts (warm cream canvas in
/// light, warm charcoal in dark, clay/terracotta accent).
///
/// Widgets read the active palette through the top-level [appColors], which the
/// root [MaterialApp.builder] keeps in sync with the resolved brightness on every
/// rebuild (so flipping light/dark — or the OS theme in 'system' mode — repaints
/// everything). This avoids threading a palette through every widget.
class AppPalette {
  final Brightness brightness;

  // surfaces
  final Color bg;
  final Color bgElevated;
  final Color card;
  final Color cardAlt;
  final Color border;
  final Color borderStrong;

  // text
  final Color text;
  final Color textDim;
  final Color textFaint;

  // accent (clay/terracotta)
  final Color accent;
  final Color accentDim;
  final Color accentSoft;
  final Color onAccent;

  // roles
  final Color user;
  final Color userSoft;
  final Color thinking;
  final Color thinkingSoft;

  // status
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color danger;
  final Color dangerSoft;

  // diffs
  final Color diffAddBg;
  final Color diffAddText;
  final Color diffDelBg;
  final Color diffDelText;

  // code
  final Color codeBg;
  final Color codeText;

  const AppPalette({
    required this.brightness,
    required this.bg,
    required this.bgElevated,
    required this.card,
    required this.cardAlt,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textDim,
    required this.textFaint,
    required this.accent,
    required this.accentDim,
    required this.accentSoft,
    required this.onAccent,
    required this.user,
    required this.userSoft,
    required this.thinking,
    required this.thinkingSoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.danger,
    required this.dangerSoft,
    required this.diffAddBg,
    required this.diffAddText,
    required this.diffDelBg,
    required this.diffDelText,
    required this.codeBg,
    required this.codeText,
  });

  static const dark = AppPalette(
    brightness: Brightness.dark,
    bg: Color(0xFF211F1D),
    bgElevated: Color(0xFF2A2825),
    card: Color(0xFF2F2C29),
    cardAlt: Color(0xFF38342F),
    border: Color(0xFF403B35),
    borderStrong: Color(0xFF524C44),
    text: Color(0xFFF2EFE8),
    textDim: Color(0xFFB5AFA3),
    textFaint: Color(0xFF807A6F),
    accent: Color(0xFFD97757),
    accentDim: Color(0xFFA85638),
    accentSoft: Color(0x2ED97757),
    onAccent: Color(0xFFFFFFFF),
    user: Color(0xFF5B9BD5),
    userSoft: Color(0x2E5B9BD5),
    thinking: Color(0xFFA99BE0),
    thinkingSoft: Color(0x29A99BE0),
    success: Color(0xFF5FB87A),
    successSoft: Color(0x295FB87A),
    warning: Color(0xFFE0A93B),
    danger: Color(0xFFF0796B),
    dangerSoft: Color(0x29F0796B),
    diffAddBg: Color(0x295FB87A),
    diffAddText: Color(0xFF7EE787),
    diffDelBg: Color(0x29F0796B),
    diffDelText: Color(0xFFFF9492),
    codeBg: Color(0xFF191715),
    codeText: Color(0xFFD7D2C8),
  );

  static const light = AppPalette(
    brightness: Brightness.light,
    bg: Color(0xFFF4F2ED),
    bgElevated: Color(0xFFFAF9F5),
    card: Color(0xFFFFFFFF),
    cardAlt: Color(0xFFF1EFE8),
    border: Color(0xFFE7E3DA),
    borderStrong: Color(0xFFD7D2C6),
    text: Color(0xFF23211E),
    textDim: Color(0xFF6B665E),
    textFaint: Color(0xFF9A948B),
    accent: Color(0xFFC96442),
    accentDim: Color(0xFFA04E32),
    accentSoft: Color(0x1FC96442),
    onAccent: Color(0xFFFFFFFF),
    user: Color(0xFF2B6CB0),
    userSoft: Color(0x1F2B6CB0),
    thinking: Color(0xFF6F5FBE),
    thinkingSoft: Color(0x1F6F5FBE),
    success: Color(0xFF2E9E54),
    successSoft: Color(0x242E9E54),
    warning: Color(0xFFB5830E),
    danger: Color(0xFFD43F33),
    dangerSoft: Color(0x1FD43F33),
    diffAddBg: Color(0x262E9E54),
    diffAddText: Color(0xFF1A7F37),
    diffDelBg: Color(0x21D43F33),
    diffDelText: Color(0xFFC0392B),
    codeBg: Color(0xFFF1EFE8),
    codeText: Color(0xFF33302B),
  );
}

/// The active palette. Kept in sync by [MaterialApp.builder]; widgets read it
/// directly (`appColors.text`, etc.).
AppPalette appColors = AppPalette.dark;

ThemeData buildTheme(AppPalette p) {
  final base = ThemeData(brightness: p.brightness, useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: p.bg,
    colorScheme: base.colorScheme.copyWith(
      brightness: p.brightness,
      primary: p.accent,
      onPrimary: p.onAccent,
      surface: p.card,
      error: p.danger,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.bg,
      elevation: 0,
      foregroundColor: p.text,
      titleTextStyle: TextStyle(color: p.text, fontSize: 18, fontWeight: FontWeight.w600),
    ),
    cardColor: p.card,
    dividerColor: p.border,
    textTheme: base.textTheme.apply(bodyColor: p.text, displayColor: p.text),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.card,
      border: OutlineInputBorder(borderSide: BorderSide(color: p.border)),
      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: p.border)),
      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: p.accent)),
    ),
  );
}

/// Monospace text style for code, paths, diffs (color applied by caller).
const TextStyle kMono = TextStyle(fontFamily: 'monospace', fontSize: 13, height: 1.4);
