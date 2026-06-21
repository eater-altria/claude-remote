import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';
import 'diff.dart';

/// Inline permission prompt (PreToolUse gate). Mirrors PermissionSheet.tsx.
class PermissionCard extends StatefulWidget {
  final PermissionRequest request;
  final void Function(PermissionDecision decision, bool remember) onRespond;
  const PermissionCard({super.key, required this.request, required this.onRespond});

  @override
  State<PermissionCard> createState() => _PermissionCardState();
}

class _PermissionCardState extends State<PermissionCard> {
  bool _remember = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    return Container(
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: appColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: appColors.accent),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.lock_outline, color: appColors.accent, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
        ]),
        const SizedBox(height: 6),
        Text(r.detail, style: kMono.copyWith(color: appColors.textDim, fontSize: 12)),
        if (r.fileChange != null) ...[
          const SizedBox(height: 10),
          DiffView(change: r.fileChange!),
        ],
        const SizedBox(height: 10),
        Row(children: [
          Checkbox(value: _remember, onChanged: (v) => setState(() => _remember = v ?? false)),
          const Text('Remember for this session', style: TextStyle(fontSize: 13)),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => widget.onRespond(PermissionDecision.deny, _remember),
              style: OutlinedButton.styleFrom(foregroundColor: appColors.danger),
              child: const Text('Deny'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton(
              onPressed: () => widget.onRespond(PermissionDecision.allow, _remember),
              child: const Text('Allow'),
            ),
          ),
        ]),
      ]),
    );
  }
}
