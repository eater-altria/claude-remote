import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../protocol/protocol.gen.dart';
import '../state/store.dart';
import '../theme/theme.dart';

/// Open the Git status sheet (mirrors app/src/components/GitSheet.tsx): branch +
/// ahead/behind + insert/delete stats, and a scrollable file list whose rows
/// expand to a colored unified diff.
void showGitSheet(BuildContext context, String sessionId) {
  showModalBottomSheet(
    context: context,
    backgroundColor: appColors.bgElevated,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _GitSheetBody(sessionId: sessionId),
  );
}

({String label, Color color}) _describeCode(String code) {
  final x = code.isNotEmpty ? code[0] : ' ';
  final y = code.length > 1 ? code[1] : ' ';
  if (code == '??') return (label: 'new', color: appColors.success);
  if (x == 'A' || y == 'A') return (label: 'added', color: appColors.success);
  if (x == 'D' || y == 'D') return (label: 'deleted', color: appColors.danger);
  if (x == 'R') return (label: 'renamed', color: appColors.user);
  if (x == 'M' || y == 'M') return (label: 'modified', color: appColors.warning);
  return (label: code.trim().isEmpty ? 'changed' : code.trim(), color: appColors.textDim);
}

class _GitSheetBody extends StatefulWidget {
  final String sessionId;
  const _GitSheetBody({required this.sessionId});

  @override
  State<_GitSheetBody> createState() => _GitSheetBodyState();
}

class _GitSheetBodyState extends State<_GitSheetBody> {
  bool _loading = true;
  String? _error;
  GitStatusDTO? _git;
  final _expanded = <String>{};
  final _diffs = <String, ({bool loading, String? text, String? error})>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _expanded.clear();
      _diffs.clear();
    });
    try {
      final g = await context.read<Store>().client!.gitStatus(widget.sessionId);
      if (mounted) setState(() { _git = g; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _toggle(String path) {
    setState(() {
      if (_expanded.contains(path)) {
        _expanded.remove(path);
      } else {
        _expanded.add(path);
        if (!_diffs.containsKey(path)) {
          _diffs[path] = (loading: true, text: null, error: null);
          context.read<Store>().client!.gitDiff(widget.sessionId, path).then((d) {
            if (mounted) setState(() => _diffs[path] = (loading: false, text: d, error: null));
          }).catchError((e) {
            if (mounted) setState(() => _diffs[path] = (loading: false, text: null, error: e.toString()));
          });
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final g = _git;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Expanded(child: Text('Git', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            IconButton(icon: Icon(Icons.refresh, color: appColors.textDim), onPressed: _loading ? null : _load),
          ]),
          if (_loading)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            Padding(padding: const EdgeInsets.all(24),
                child: Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: appColors.danger)))
          else if (g != null && !g.isRepo)
            Padding(padding: const EdgeInsets.all(24),
                child: Text('Not a git repository', textAlign: TextAlign.center, style: TextStyle(color: appColors.textDim)))
          else if (g != null) ...[
            _statsRow(g),
            const SizedBox(height: 12),
            if (g.clean)
              Padding(padding: const EdgeInsets.all(24),
                  child: Column(children: [
                    Icon(Icons.check_circle_outline, color: appColors.success, size: 24),
                    const SizedBox(height: 6),
                    Text('Working tree clean', style: TextStyle(color: appColors.textDim)),
                  ]))
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: g.files.length,
                  itemBuilder: (_, i) => _fileRow(g.files[i]),
                ),
              ),
          ],
        ]),
      ),
    );
  }

  Widget _statsRow(GitStatusDTO g) {
    return Row(children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(color: appColors.accentSoft, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.call_split, size: 14, color: appColors.accent),
          const SizedBox(width: 5),
          Text(g.branch ?? 'detached',
              style: TextStyle(color: appColors.accent, fontSize: 13, fontWeight: FontWeight.w700)),
        ]),
      ),
      if ((g.ahead ?? 0) > 0) Padding(padding: const EdgeInsets.only(left: 10),
          child: Text('↑${g.ahead}', style: TextStyle(color: appColors.textDim, fontSize: 13))),
      if ((g.behind ?? 0) > 0) Padding(padding: const EdgeInsets.only(left: 6),
          child: Text('↓${g.behind}', style: TextStyle(color: appColors.textDim, fontSize: 13))),
      const Spacer(),
      if (g.insertions > 0 || g.deletions > 0)
        Text.rich(TextSpan(children: [
          TextSpan(text: '+${g.insertions}', style: TextStyle(color: appColors.diffAddText, fontSize: 13)),
          const TextSpan(text: '  '),
          TextSpan(text: '−${g.deletions}', style: TextStyle(color: appColors.diffDelText, fontSize: 13)),
        ])),
    ]);
  }

  Widget _fileRow(GitFileChange f) {
    final d = _describeCode(f.code);
    final open = _expanded.contains(f.path);
    final ds = _diffs[f.path];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      InkWell(
        onTap: () => _toggle(f.path),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: appColors.border))),
          child: Row(children: [
            Icon(open ? Icons.expand_more : Icons.chevron_right, size: 16, color: appColors.textFaint),
            const SizedBox(width: 6),
            Container(
              width: 70,
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 3),
              decoration: BoxDecoration(color: d.color.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(8)),
              child: Text(d.label, style: TextStyle(color: d.color, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(f.path, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: kMono.copyWith(color: appColors.text, fontSize: 13))),
            if (f.staged) Icon(Icons.done_all, size: 14, color: appColors.success),
          ]),
        ),
      ),
      if (open)
        if (ds == null || ds.loading)
          const Padding(padding: EdgeInsets.all(12), child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))))
        else if (ds.error != null)
          Padding(padding: const EdgeInsets.all(8), child: Text(ds.error!, style: TextStyle(color: appColors.danger, fontSize: 11)))
        else if ((ds.text ?? '').trim().isEmpty)
          Padding(padding: const EdgeInsets.all(8), child: Text('No diff to show.', style: TextStyle(color: appColors.textFaint, fontSize: 11)))
        else
          _DiffBody(text: ds.text!),
    ]);
  }
}

const _maxDiffRows = 400;

class _DiffBody extends StatelessWidget {
  final String text;
  const _DiffBody({required this.text});

  @override
  Widget build(BuildContext context) {
    final rows = _parse(text);
    final shown = rows.take(_maxDiffRows).toList();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: appColors.codeBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [for (final r in shown) _line(r)]),
        ),
        if (rows.length > _maxDiffRows)
          Padding(padding: const EdgeInsets.all(6),
              child: Text('… ${rows.length - _maxDiffRows} more lines', textAlign: TextAlign.center,
                  style: TextStyle(color: appColors.textFaint, fontSize: 11))),
      ]),
    );
  }

  Widget _line((String, String) r) {
    final (sign, content) = r;
    final (bg, color) = switch (sign) {
      '+' => (appColors.diffAddBg, appColors.diffAddText),
      '-' => (appColors.diffDelBg, appColors.diffDelText),
      '@' => (Colors.transparent, appColors.textDim),
      _ => (Colors.transparent, appColors.codeText),
    };
    final prefix = (sign == ' ' || sign == '@') ? '  ' : '$sign ';
    return Container(
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Text('$prefix${content.isEmpty ? ' ' : content}',
          style: kMono.copyWith(color: color, fontSize: 11, height: 1.45)),
    );
  }

  List<(String, String)> _parse(String text) {
    final rows = <(String, String)>[];
    for (final line in text.split('\n')) {
      if (line.startsWith('diff --git') ||
          line.startsWith('index ') ||
          line.startsWith('--- ') ||
          line.startsWith('+++ ') ||
          line.startsWith('new file') ||
          line.startsWith('deleted file') ||
          line.startsWith('old mode') ||
          line.startsWith('new mode') ||
          line.startsWith('similarity ') ||
          line.startsWith('rename ') ||
          line.startsWith('\\ No newline')) {
        continue;
      }
      if (line.startsWith('@@')) {
        rows.add(('@', line));
      } else if (line.startsWith('+')) {
        rows.add(('+', line.substring(1)));
      } else if (line.startsWith('-')) {
        rows.add(('-', line.substring(1)));
      } else {
        rows.add((' ', line.startsWith(' ') ? line.substring(1) : line));
      }
    }
    while (rows.isNotEmpty && rows.last.$1 == ' ' && rows.last.$2.isEmpty) {
      rows.removeLast();
    }
    return rows;
  }
}
