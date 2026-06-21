import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Always-on subagent (Task) panel — shown only while agents are running.
/// Mirrors app/src/components/SubagentPanel.tsx.
class SubagentPanel extends StatelessWidget {
  final List<SubagentItem> subagents;
  const SubagentPanel({super.key, required this.subagents});

  @override
  Widget build(BuildContext context) {
    final running = subagents.where((s) => s.status == 'running').toList();
    if (running.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: appColors.cardAlt,
        border: Border(bottom: BorderSide(color: appColors.border)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const SizedBox(
              width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 8),
          Text('${running.length} subagent${running.length == 1 ? '' : 's'} running',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ]),
        const SizedBox(height: 4),
        ...running.map((s) => Padding(
              padding: const EdgeInsets.only(top: 2, left: 21),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: appColors.accent.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(s.type, style: TextStyle(color: appColors.accent, fontSize: 11)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(s.description,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: appColors.textDim, fontSize: 12)),
                ),
              ]),
            )),
      ]),
    );
  }
}
