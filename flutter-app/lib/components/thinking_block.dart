import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Collapsible "thinking" block — dim, italic, expandable.
class ThinkingBlock extends StatefulWidget {
  final String text;
  final bool streaming;
  const ThinkingBlock({super.key, required this.text, required this.streaming});

  @override
  State<ThinkingBlock> createState() => _ThinkingBlockState();
}

class _ThinkingBlockState extends State<ThinkingBlock> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: appColors.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Row(children: [
            Icon(_expanded ? Icons.expand_less : Icons.expand_more,
                size: 18, color: appColors.thinking),
            const SizedBox(width: 6),
            Text(widget.streaming ? 'Thinking…' : 'Thought',
                style: TextStyle(color: appColors.thinking, fontWeight: FontWeight.w600, fontSize: 13)),
          ]),
        ),
        if (_expanded) ...[
          const SizedBox(height: 8),
          Text(widget.text,
              style: TextStyle(
                  color: appColors.textDim, fontStyle: FontStyle.italic, fontSize: 14, height: 1.4)),
        ],
      ]),
    );
  }
}
