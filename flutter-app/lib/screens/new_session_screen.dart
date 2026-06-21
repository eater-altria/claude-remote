import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../protocol/protocol.gen.dart';
import '../state/cwd_history.dart';
import '../state/store.dart';
import '../theme/labels.dart';
import '../theme/theme.dart';
import 'session_screen.dart';

class NewSessionScreen extends StatefulWidget {
  const NewSessionScreen({super.key});
  @override
  State<NewSessionScreen> createState() => _NewSessionScreenState();
}

class _NewSessionScreenState extends State<NewSessionScreen> {
  FsListResponse? _listing;
  List<FsRoot> _roots = [];
  bool _loading = true;
  String? _error;
  bool _showHidden = false;

  final _title = TextEditingController();
  PermissionMode _mode = PermissionMode.default_;
  bool _creating = false;

  final _history = CwdHistory();
  String _serverId = '';
  List<String> _recents = [];
  List<String> _favorites = [];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  void _refreshHistory() {
    setState(() {
      _recents = _history.recent(_serverId);
      _favorites = _history.favorites(_serverId);
    });
  }

  String _basename(String p) {
    final parts = p.replaceAll(RegExp(r'/+$'), '').split('/');
    return parts.isNotEmpty && parts.last.isNotEmpty ? parts.last : p;
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final store = context.read<Store>();
    final client = store.client;
    _serverId = store.activeId ?? '';
    await _history.load();
    _refreshHistory();
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected';
      });
      return;
    }
    try {
      _roots = await client.fsRoots();
      final start = _roots.isNotEmpty ? _roots.first.path : '/';
      await _navigate(start);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _navigate(String path) async {
    final client = context.read<Store>().client;
    if (client == null) return;
    setState(() => _loading = true);
    try {
      final listing = await client.fsList(path, hidden: _showHidden);
      setState(() {
        _listing = listing;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _create() async {
    final path = _listing?.path;
    if (path == null) return;
    setState(() => _creating = true);
    try {
      final store = context.read<Store>();
      final session = await store.createSession(path,
          title: _title.text.trim().isEmpty ? null : _title.text.trim(), permissionMode: _mode);
      await _history.pushRecent(_serverId, path);
      if (!mounted) return;
      Navigator.pop(context);
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => SessionScreen(sessionId: session.id)));
    } catch (e) {
      if (mounted) {
        setState(() => _creating = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Create failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final listing = _listing;
    return Scaffold(
      appBar: AppBar(
        title: const Text('New session'),
        actions: [
          IconButton(
            icon: Icon(_showHidden ? Icons.visibility : Icons.visibility_off),
            tooltip: 'Toggle hidden files',
            onPressed: () {
              setState(() => _showHidden = !_showHidden);
              if (listing != null) _navigate(listing.path);
            },
          ),
        ],
      ),
      body: Column(children: [
        if (_roots.isNotEmpty) _rootsRow(),
        if (_favorites.isNotEmpty || _recents.isNotEmpty) _quickRow(),
        if (listing != null) _pathBar(listing),
        Expanded(child: _browser(listing)),
        _footer(listing),
      ]),
    );
  }

  Widget _rootsRow() {
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: appColors.border))),
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(children: [
          for (final r in _roots)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ActionChip(
                avatar: Icon(Icons.folder_open_outlined, size: 16, color: appColors.accent),
                label: Text(r.name),
                onPressed: () => _navigate(r.path),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _quickRow() {
    final items = [
      ..._favorites.map((p) => (p: p, fav: true)),
      ..._recents.where((p) => !_favorites.contains(p)).map((p) => (p: p, fav: false)),
    ];
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: appColors.border))),
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(children: [
          for (final it in items)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ActionChip(
                avatar: Icon(it.fav ? Icons.star : Icons.history,
                    size: 15, color: it.fav ? appColors.warning : appColors.textFaint),
                label: Text(_basename(it.p)),
                onPressed: () => _navigate(it.p),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _pathBar(FsListResponse listing) {
    final isFav = _favorites.contains(listing.path);
    return Container(
      width: double.infinity,
      color: appColors.bgElevated,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(children: [
        Expanded(
          child: Text(listing.path, style: kMono.copyWith(color: appColors.textDim, fontSize: 12)),
        ),
        InkWell(
          onTap: () async {
            await _history.toggleFavorite(_serverId, listing.path);
            _refreshHistory();
          },
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Icon(isFav ? Icons.star : Icons.star_border,
                size: 20, color: isFav ? appColors.warning : appColors.textDim),
          ),
        ),
      ]),
    );
  }

  Widget _browser(FsListResponse? listing) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text(_error!, style: TextStyle(color: appColors.danger)));
    }
    if (listing == null) return const SizedBox.shrink();
    final dirs = listing.entries.where((e) => e.isDir).toList();
    return ListView(children: [
      if (listing.parent != null)
        ListTile(
          leading: const Icon(Icons.arrow_upward),
          title: const Text('..'),
          onTap: () => _navigate(listing.parent!),
        ),
      ...dirs.map((e) => ListTile(
            leading: Icon(e.isSymlink ? Icons.link : Icons.folder_outlined, color: appColors.accent),
            title: Text(e.name),
            onTap: () => _navigate(e.path),
          )),
      if (dirs.isEmpty && listing.parent == null)
        Padding(
          padding: const EdgeInsets.all(24),
          child: Center(child: Text('No subdirectories', style: TextStyle(color: appColors.textDim))),
        ),
    ]);
  }

  Widget _footer(FsListResponse? listing) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(border: Border(top: BorderSide(color: appColors.border))),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: _title,
            decoration: const InputDecoration(labelText: 'Title (optional)', isDense: true),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Text('Mode:', style: TextStyle(color: appColors.textDim)),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButton<PermissionMode>(
                isExpanded: true,
                value: _mode,
                items: [
                  for (final m in PermissionMode.values)
                    DropdownMenuItem(value: m, child: Text(PERMISSION_MODE_LABELS[m]!)),
                ],
                onChanged: (m) => setState(() => _mode = m ?? _mode),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: (listing == null || _creating) ? null : _create,
              icon: _creating
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.play_arrow),
              label: Text(listing == null ? 'Pick a directory' : 'Start in ${listing.path.split('/').last}'),
            ),
          ),
        ]),
      ),
    );
  }
}
