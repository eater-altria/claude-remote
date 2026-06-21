import 'dart:convert';

import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../state/transcript.dart';
import '../theme/theme.dart';
import 'diff.dart';

/// A consolidated tool invocation card with status, title, the specific
/// command/path it acted on, an optional diff, and an expandable result.
/// Mirrors app/src/components/ToolCard.tsx.
class ToolCard extends StatefulWidget {
  final ToolItem item;
  const ToolCard({super.key, required this.item});

  @override
  State<ToolCard> createState() => _ToolCardState();
}

class _ToolCardState extends State<ToolCard> {
  bool _expanded = false;

  IconData get _icon => switch (widget.item.category) {
        ToolCategory.read => Icons.description_outlined,
        ToolCategory.edit => Icons.edit_outlined,
        ToolCategory.execute => Icons.terminal,
        ToolCategory.search => Icons.search,
        ToolCategory.web => Icons.public,
        ToolCategory.task => Icons.account_tree_outlined,
        ToolCategory.ask => Icons.help_outline,
        ToolCategory.other => Icons.build_outlined,
      };

  Color get _statusColor => switch (widget.item.status) {
        ToolStatus.pending => appColors.warning,
        ToolStatus.done => appColors.success,
        ToolStatus.error => appColors.danger,
      };

  /// The specific thing this tool acted on (command, path, url…), derived from
  /// the tool input — same logic as ToolCard.tsx's useDetail.
  ({String short, String? long}) get _detail {
    final item = widget.item;
    final input = item.input;
    final m = input is Map ? input : const {};
    String s(String k) => m[k]?.toString() ?? '';

    if (item.name == 'Bash') {
      final cmd = s('command');
      return (short: cmd, long: cmd.length > 60 ? cmd : null);
    }
    if (item.fileChange != null) return (short: item.fileChange!.path, long: null);
    if (item.name == 'Read' || item.name == 'Glob' || item.name == 'Grep') {
      return (short: m['file_path']?.toString() ?? m['pattern']?.toString() ?? '', long: null);
    }
    if (item.name == 'WebFetch') return (short: s('url'), long: null);
    if (item.name == 'WebSearch') return (short: s('query'), long: null);
    if (item.name == 'Task') {
      final prompt = s('prompt');
      return (short: s('description'), long: prompt.isEmpty ? null : prompt);
    }
    try {
      final j = jsonEncode(input);
      return (short: j.length > 80 ? '${j.substring(0, 80)}…' : j, long: j.length > 80 ? j : null);
    } catch (_) {
      return (short: '', long: null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final detail = _detail;
    final hasResult = item.result != null && item.result!.isNotEmpty;
    final hasLong = detail.long != null && item.fileChange == null;
    final canExpand = hasResult || hasLong;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: appColors.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(
          onTap: canExpand ? () => setState(() => _expanded = !_expanded) : null,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(children: [
              Icon(_icon, size: 18, color: appColors.textDim),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  if (detail.short.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(detail.short,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: kMono.copyWith(color: appColors.textDim, fontSize: 12)),
                    ),
                ]),
              ),
              const SizedBox(width: 6),
              if (item.status == ToolStatus.pending)
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(item.status == ToolStatus.error ? Icons.close : Icons.check,
                    size: 16, color: _statusColor),
              if (canExpand)
                Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: appColors.textFaint),
            ]),
          ),
        ),
        if (item.fileChange != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: DiffView(change: item.fileChange!),
          ),
        if (_expanded && hasLong)
          _codeBox(detail.long!, appColors.codeText),
        if (_expanded && hasResult)
          _codeBox(item.result!.trim().isEmpty ? '(empty)' : item.result!.trim(),
              item.status == ToolStatus.error ? appColors.danger : appColors.codeText,
              label: item.status == ToolStatus.error ? 'Error' : 'Output'),
      ]),
    );
  }

  Widget _codeBox(String text, Color color, {String? label}) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
      constraints: const BoxConstraints(maxHeight: 300),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: appColors.codeBg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: appColors.border),
      ),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (label != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(label.toUpperCase(),
                  style: TextStyle(color: appColors.textFaint, fontSize: 10, letterSpacing: 0.5)),
            ),
          SelectableText(text, style: kMono.copyWith(color: color)),
        ]),
      ),
    );
  }
}
