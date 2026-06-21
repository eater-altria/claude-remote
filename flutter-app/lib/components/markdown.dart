import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import '../theme/theme.dart';

/// Markdown renderer tuned for the dark chat theme. Text (incl. code) is
/// selectable so it can be copied. Mirrors app/src/components/Markdown.tsx.
class MarkdownView extends StatelessWidget {
  final String text;
  const MarkdownView(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return MarkdownBody(
      data: text,
      selectable: true,
      styleSheet: MarkdownStyleSheet(
        p: TextStyle(color: appColors.text, fontSize: 15, height: 1.45),
        code: kMono.copyWith(backgroundColor: appColors.cardAlt, color: appColors.text),
        codeblockDecoration: BoxDecoration(
          color: appColors.cardAlt,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: appColors.border),
        ),
        codeblockPadding: const EdgeInsets.all(12),
        blockquoteDecoration: BoxDecoration(
          border: Border(left: BorderSide(color: appColors.border, width: 3)),
        ),
        h1: TextStyle(color: appColors.text, fontSize: 20, fontWeight: FontWeight.bold),
        h2: TextStyle(color: appColors.text, fontSize: 18, fontWeight: FontWeight.bold),
        h3: TextStyle(color: appColors.text, fontSize: 16, fontWeight: FontWeight.bold),
        a: TextStyle(color: appColors.accent),
        listBullet: TextStyle(color: appColors.text),
      ),
    );
  }
}
