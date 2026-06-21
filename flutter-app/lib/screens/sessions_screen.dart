import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/ws.dart';
import '../protocol/protocol.gen.dart';
import '../state/store.dart';
import '../theme/theme.dart';
import 'session_screen.dart';
import 'settings_screen.dart';

class SessionsScreen extends StatefulWidget {
  const SessionsScreen({super.key});
  @override
  State<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends State<SessionsScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<Store>().refreshSessions().catchError((_) {}));
    // Live-ish dashboard: refresh state/badges while this screen is alive.
    _poll = Timer.periodic(const Duration(seconds: 6), (_) {
      context.read<Store>().refreshSessions().catchError((_) {});
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<Store>();
    final sessions = [...store.sessions]..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final active = store.servers.where((s) => s.id == store.activeId).firstOrNull;

    return Scaffold(
      appBar: AppBar(
        title: InkWell(
          onTap: () => _serverMenu(context, store),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Flexible(
              child: Text(active?.name ?? 'Claude Remote',
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (store.servers.length > 1)
              Icon(Icons.expand_more, size: 18, color: appColors.textDim),
          ]),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _ConnStatus(status: store.wsStatus),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
        ],
      ),
      floatingActionButton: store.config == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => Navigator.of(context).pushNamed('/new'),
              icon: const Icon(Icons.add),
              label: const Text('New session'),
            ),
      body: _body(store, sessions),
    );
  }

  Widget _body(Store store, List<SessionMeta> sessions) {
    if (!store.configLoaded) {
      return const Center(child: CircularProgressIndicator());
    }
    if (store.servers.isEmpty || store.config == null) {
      return _EmptyServers();
    }
    if (sessions.isEmpty) {
      return RefreshIndicator(
        onRefresh: store.refreshSessions,
        child: ListView(children: [
          const SizedBox(height: 120),
          Center(child: Text('No sessions yet.\nTap “New session” to start.',
              textAlign: TextAlign.center, style: TextStyle(color: appColors.textDim))),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: store.refreshSessions,
      child: ListView.separated(
        itemCount: sessions.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) => _SessionTile(session: sessions[i]),
      ),
    );
  }

  void _serverMenu(BuildContext context, Store store) {
    if (store.servers.length < 2) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
      return;
    }
    showModalBottomSheet(
      context: context,
      backgroundColor: appColors.card,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final s in store.servers)
            ListTile(
              leading: Icon(
                s.id == store.activeId ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                color: s.id == store.activeId ? appColors.accent : appColors.textDim,
              ),
              title: Text(s.name),
              subtitle: Text(s.baseUrl, style: const TextStyle(fontSize: 12)),
              onTap: () {
                if (s.id != store.activeId) store.switchServer(s.id);
                Navigator.pop(ctx);
              },
            ),
          ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Manage servers…'),
            onTap: () {
              Navigator.pop(ctx);
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
            },
          ),
        ]),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  final SessionMeta session;
  const _SessionTile({required this.session});

  @override
  Widget build(BuildContext context) {
    final store = context.read<Store>();
    final unread = store.isUnread(session);
    return ListTile(
      onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => SessionScreen(sessionId: session.id))),
      onLongPress: () => _confirmDelete(context, store),
      leading: _StateBadge(state: session.state),
      title: Row(children: [
        Expanded(
          child: Text(session.title.isEmpty ? session.cwd.split('/').last : session.title,
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w500)),
        ),
        if (unread)
          Container(width: 8, height: 8, decoration: BoxDecoration(
              color: appColors.accent, shape: BoxShape.circle)),
      ]),
      subtitle: Text(session.cwd, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: TextStyle(color: appColors.textDim, fontSize: 12)),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        if (session.model != null)
          Text(session.model!, style: TextStyle(color: appColors.textDim, fontSize: 11)),
        if (session.totalCostUsd != null && session.totalCostUsd! > 0)
          Text('\$${session.totalCostUsd!.toStringAsFixed(2)}',
              style: TextStyle(color: appColors.textDim, fontSize: 11)),
      ]),
    );
  }

  void _confirmDelete(BuildContext context, Store store) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete session?'),
        content: Text(session.title.isEmpty ? session.cwd : session.title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              store.deleteSession(session.id);
            },
            child: Text('Delete', style: TextStyle(color: appColors.danger)),
          ),
        ],
      ),
    );
  }
}

class _StateBadge extends StatelessWidget {
  final SessionState state;
  const _StateBadge({required this.state});
  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (state) {
      SessionState.running => (Icons.bolt, appColors.warning),
      SessionState.awaitingPermission => (Icons.lock_outline, appColors.accent),
      SessionState.awaitingQuestion => (Icons.help_outline, appColors.accent),
      SessionState.error => (Icons.error_outline, appColors.danger),
      SessionState.idle => (Icons.check_circle_outline, appColors.success),
      SessionState.starting => (Icons.hourglass_empty, appColors.textDim),
      SessionState.closed => (Icons.power_settings_new, appColors.textDim),
    };
    return Icon(icon, color: color, size: 22);
  }
}

class _ConnStatus extends StatelessWidget {
  final WsStatus status;
  const _ConnStatus({required this.status});
  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      WsStatus.open => (appColors.success, 'Live'),
      WsStatus.connecting => (appColors.warning, '…'),
      WsStatus.idle => (appColors.textDim, '…'),
      WsStatus.closed => (appColors.danger, 'Off'),
    };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Text(label, style: TextStyle(color: appColors.textDim, fontSize: 12)),
    ]);
  }
}

class _EmptyServers extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.dns_outlined, size: 56, color: appColors.textDim),
          const SizedBox(height: 16),
          const Text('No server connected', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Add your host server to start driving Claude Code from here.',
              textAlign: TextAlign.center, style: TextStyle(color: appColors.textDim)),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).pushNamed('/scan'),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scan QR to pair'),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: () => Navigator.of(context).pushNamed('/settings'),
            child: const Text('Add manually'),
          ),
        ]),
      ),
    );
  }
}
