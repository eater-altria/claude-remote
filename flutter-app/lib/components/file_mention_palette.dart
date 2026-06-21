import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Autocomplete list shown while typing an `@file` mention. Entries are already
/// loaded + ranked by the parent. Selecting a folder drills in; a file completes
/// the path. Mirrors app/src/components/FileMentionPalette.tsx.
class FileMentionPalette extends StatelessWidget {
  final List<FsEntry> entries;
  final String query;
  final String dir;
  final bool loading;
  final void Function(FsEntry e) onSelect;
  const FileMentionPalette({
    super.key,
    required this.entries,
    required this.query,
    required this.dir,
    required this.loading,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final q = query.toLowerCase();
    return Container(
      decoration: BoxDecoration(
        color: appColors.bgElevated,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: appColors.borderStrong),
      ),
      clipBehavior: Clip.antiAlias,
      constraints: const BoxConstraints(maxHeight: 300),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: appColors.cardAlt,
            border: Border(bottom: BorderSide(color: appColors.border)),
          ),
          child: Row(children: [
            Icon(Icons.alternate_email, size: 13, color: appColors.textDim),
            const SizedBox(width: 8),
            Expanded(
              child: Text(dir.isNotEmpty ? '$dir/' : 'working directory',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: kMono.copyWith(color: appColors.textDim, fontSize: 11)),
            ),
            if (loading)
              const SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2))
            else
              Text('${entries.length}',
                  style: TextStyle(color: appColors.textFaint, fontSize: 11, fontWeight: FontWeight.w700)),
          ]),
        ),
        if (entries.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(loading ? 'Loading…' : 'No matching files',
                style: TextStyle(color: appColors.textFaint, fontSize: 13)),
          )
        else
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
              itemCount: entries.length,
              itemBuilder: (_, i) {
                final e = entries[i];
                return InkWell(
                  onTap: () => onSelect(e),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      border: Border(bottom: BorderSide(color: appColors.border)),
                    ),
                    child: Row(children: [
                      Icon(e.isDir ? Icons.folder : Icons.description_outlined,
                          size: 16, color: e.isDir ? appColors.accent : appColors.textDim),
                      const SizedBox(width: 12),
                      Expanded(child: _highlighted(e.name + (e.isDir ? '/' : ''), q)),
                      if (e.isDir) Icon(Icons.chevron_right, size: 16, color: appColors.accent),
                    ]),
                  ),
                );
              },
            ),
          ),
      ]),
    );
  }

  Widget _highlighted(String name, String q) {
    final base = kMono.copyWith(color: appColors.text, fontWeight: FontWeight.w600);
    if (q.isEmpty) return Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: base);
    final idx = name.toLowerCase().indexOf(q);
    if (idx < 0) return Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: base);
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: name.substring(0, idx), style: base),
        TextSpan(
            text: name.substring(idx, idx + q.length),
            style: base.copyWith(color: appColors.accent, fontWeight: FontWeight.w800)),
        TextSpan(text: name.substring(idx + q.length), style: base),
      ]),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}
