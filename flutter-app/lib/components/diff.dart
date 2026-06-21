import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Renders a FileChange as a colored diff (create/write show added lines;
/// edits show before/after hunks). Mirrors app/src/components/Diff.tsx.
class DiffView extends StatelessWidget {
  final FileChange change;
  const DiffView({super.key, required this.change});

  @override
  Widget build(BuildContext context) {
    final lines = <_DiffLine>[];
    if (change.changeType == 'edit' && change.edits != null) {
      for (final e in change.edits!) {
        for (final l in e.oldText.split('\n')) {
          lines.add(_DiffLine(l, _Kind.del));
        }
        for (final l in e.newText.split('\n')) {
          lines.add(_DiffLine(l, _Kind.add));
        }
      }
    } else if (change.content != null) {
      for (final l in change.content!.split('\n')) {
        lines.add(_DiffLine(l, _Kind.add));
      }
    }

    return Container(
      decoration: BoxDecoration(
        color: appColors.cardAlt,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: Text(change.path, style: kMono.copyWith(color: appColors.textDim, fontSize: 12)),
        ),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 320),
          child: SingleChildScrollView(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch,
                children: lines.map((l) => _row(l)).toList()),
          ),
        ),
      ]),
    );
  }

  Widget _row(_DiffLine l) {
    final (bg, sign, color) = switch (l.kind) {
      _Kind.add => (appColors.diffAddBg, '+', appColors.success),
      _Kind.del => (appColors.diffDelBg, '-', appColors.danger),
    };
    return Container(
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 14, child: Text(sign, style: kMono.copyWith(color: color))),
        Expanded(child: Text(l.text, style: kMono.copyWith(color: appColors.text))),
      ]),
    );
  }
}

enum _Kind { add, del }

class _DiffLine {
  final String text;
  final _Kind kind;
  _DiffLine(this.text, this.kind);
}
