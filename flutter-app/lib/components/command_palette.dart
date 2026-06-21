import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Rank + filter slash commands by a query (prefix > alias-prefix > substring).
/// Mirrors filterCommands in app/src/components/CommandPalette.tsx.
List<SlashCommandDTO> filterCommands(List<SlashCommandDTO> commands, String query) {
  final q = query.toLowerCase();
  final scored = <({SlashCommandDTO c, int score})>[];
  for (final c in commands) {
    final name = c.name.toLowerCase();
    int score = -1;
    if (q.isEmpty) {
      score = 0;
    } else if (name.startsWith(q)) {
      score = 3;
    } else if (c.aliases?.any((a) => a.toLowerCase().startsWith(q)) ?? false) {
      score = 2;
    } else if (name.contains(q)) {
      score = 1;
    }
    if (score >= 0) scored.add((c: c, score: score));
  }
  scored.sort((a, b) => b.score != a.score ? b.score - a.score : a.c.name.compareTo(b.c.name));
  return scored.map((x) => x.c).take(60).toList();
}

/// Autocomplete list shown while typing a leading "/command".
class CommandPalette extends StatelessWidget {
  final List<SlashCommandDTO> commands;
  final String query;
  final void Function(SlashCommandDTO cmd) onSelect;
  const CommandPalette({super.key, required this.commands, required this.query, required this.onSelect});

  IconData _icon(String source) => switch (source) {
        'skill' => Icons.auto_awesome,
        'plugin' => Icons.extension,
        'client' => Icons.tune,
        _ => Icons.terminal,
      };

  Color _color(String source) => switch (source) {
        'skill' => appColors.thinking,
        'plugin' => appColors.user,
        'client' => appColors.accent,
        _ => appColors.textDim,
      };

  @override
  Widget build(BuildContext context) {
    final filtered = filterCommands(commands, query);
    if (filtered.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
        color: appColors.bgElevated,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: appColors.borderStrong),
      ),
      clipBehavior: Clip.antiAlias,
      constraints: const BoxConstraints(maxHeight: 280),
      child: ListView.builder(
        shrinkWrap: true,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
        itemCount: filtered.length,
        itemBuilder: (_, i) {
          final c = filtered[i];
          return InkWell(
            onTap: () => onSelect(c),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: appColors.border)),
              ),
              child: Row(children: [
                Icon(_icon(c.source), size: 16, color: _color(c.source)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text.rich(TextSpan(children: [
                      TextSpan(
                        text: '/${c.name}',
                        style: kMono.copyWith(color: appColors.text, fontWeight: FontWeight.w600),
                      ),
                      if (c.argumentHint.isNotEmpty)
                        TextSpan(text: ' ${c.argumentHint}', style: kMono.copyWith(color: appColors.textFaint)),
                    ])),
                    if (c.description.isNotEmpty)
                      Text(c.description,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: appColors.textDim, fontSize: 11)),
                  ]),
                ),
                if (c.client == true)
                  Icon(Icons.chevron_right, size: 16, color: appColors.accent),
              ]),
            ),
          );
        },
      ),
    );
  }
}
