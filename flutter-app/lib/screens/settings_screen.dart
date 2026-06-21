import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../state/store.dart';
import '../state/theme_controller.dart';
import '../theme/theme.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<Store>();
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        _section('Servers'),
        for (final s in store.servers)
          ListTile(
            leading: Icon(
              s.id == store.activeId ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: s.id == store.activeId ? appColors.accent : appColors.textDim,
            ),
            title: Text(s.name),
            subtitle: Text(s.baseUrl, style: const TextStyle(fontSize: 12)),
            onTap: () => store.switchServer(s.id),
            trailing: PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'edit') _serverDialog(context, store, existing: s);
                if (v == 'delete') store.removeServer(s.id);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => Navigator.of(context).pushNamed('/scan'),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan QR'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _serverDialog(context, store),
                icon: const Icon(Icons.add),
                label: const Text('Add manually'),
              ),
            ),
          ]),
        ),
        const Divider(),
        _section('Appearance'),
        _ThemeSelector(),
        const Divider(),
        _section('Notifications'),
        SwitchListTile(
          title: const Text('On-device notifications'),
          subtitle: const Text('Approvals, questions & turn-done alerts (requires app running)'),
          value: store.notificationsEnabled,
          onChanged: store.setNotificationsEnabled,
        ),
        const Divider(),
        _section('Spend'),
        ListTile(
          title: const Text('Today'),
          trailing: Text('\$${store.todaySpend.toStringAsFixed(2)}'),
        ),
        ListTile(
          title: const Text('Daily budget alert'),
          subtitle: Text(store.dailyBudgetUsd == null
              ? 'Not set'
              : '\$${store.dailyBudgetUsd!.toStringAsFixed(2)} / day'),
          trailing: const Icon(Icons.edit_outlined),
          onTap: () => _budgetDialog(context, store),
        ),
      ]),
    );
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Text(t.toUpperCase(),
            style: TextStyle(color: appColors.textDim, fontSize: 12, letterSpacing: 1)),
      );

  void _serverDialog(BuildContext context, Store store, {ServerProfile? existing}) {
    final name = TextEditingController(text: existing?.name ?? '');
    final url = TextEditingController(text: existing?.baseUrl ?? '');
    final token = TextEditingController(text: existing?.token ?? '');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: appColors.card,
        title: Text(existing == null ? 'Add server' : 'Edit server'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          TextField(
              controller: url,
              decoration: const InputDecoration(labelText: 'URL', hintText: 'http://192.168.1.20:8787')),
          TextField(controller: token, decoration: const InputDecoration(labelText: 'Token')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (existing == null) {
                store.addServer(name: name.text, baseUrl: url.text, token: token.text);
              } else {
                store.updateServer(existing.id, name: name.text, baseUrl: url.text, token: token.text);
              }
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _budgetDialog(BuildContext context, Store store) {
    final ctrl = TextEditingController(text: store.dailyBudgetUsd?.toStringAsFixed(2) ?? '');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: appColors.card,
        title: const Text('Daily budget'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(prefixText: '\$', hintText: 'Leave blank to clear'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text.trim());
              store.setDailyBudget(ctrl.text.trim().isEmpty ? null : v);
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

/// Light / Dark / System theme picker (persisted via ThemeController).
class _ThemeSelector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeController>();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: SegmentedButton<ThemeMode>(
        segments: const [
          ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto), label: Text('System')),
          ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode), label: Text('Light')),
          ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode), label: Text('Dark')),
        ],
        selected: {theme.mode},
        onSelectionChanged: (s) => theme.setMode(s.first),
      ),
    );
  }
}
