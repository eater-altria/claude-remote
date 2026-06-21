import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Always-on TodoWrite progress panel (from view.todos). Mirrors
/// app/src/components/TaskProgress.tsx.
class TaskProgress extends StatefulWidget {
  final List<TodoItem> todos;
  const TaskProgress({super.key, required this.todos});

  @override
  State<TaskProgress> createState() => _TaskProgressState();
}

class _TaskProgressState extends State<TaskProgress> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.todos.isEmpty) return const SizedBox.shrink();
    final done = widget.todos.where((t) => t.status == 'completed').length;
    final total = widget.todos.length;
    final active = widget.todos.firstWhere(
      (t) => t.status == 'in_progress',
      orElse: () => widget.todos.firstWhere((t) => t.status == 'pending', orElse: () => widget.todos.last),
    );

    return Material(
      color: appColors.card,
      child: InkWell(
        onTap: () => setState(() => _expanded = !_expanded),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: appColors.border)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.checklist, size: 16, color: appColors.accent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _expanded ? 'Tasks ($done/$total)' : (active.activeForm ?? active.content),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
              Text('$done/$total', style: TextStyle(color: appColors.textDim, fontSize: 12)),
              Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 18, color: appColors.textDim),
            ]),
            if (_expanded) ...[
              const SizedBox(height: 6),
              ...widget.todos.map(_todoRow),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _todoRow(TodoItem t) {
    final (icon, color) = switch (t.status) {
      'completed' => (Icons.check_circle, appColors.success),
      'in_progress' => (Icons.radio_button_checked, appColors.warning),
      _ => (Icons.radio_button_unchecked, appColors.textDim),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            t.status == 'in_progress' ? (t.activeForm ?? t.content) : t.content,
            style: TextStyle(
              fontSize: 13,
              color: t.status == 'completed' ? appColors.textDim : appColors.text,
              decoration: t.status == 'completed' ? TextDecoration.lineThrough : null,
            ),
          ),
        ),
      ]),
    );
  }
}
