import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../protocol/protocol.gen.dart';
import '../state/store.dart';
import '../theme/theme.dart';

const _palette = [
  Color(0xFFC96442), Color(0xFF2B6CB0), Color(0xFF8B7FD6), Color(0xFF3FB950),
  Color(0xFFD29922), Color(0xFFE879F9), Color(0xFF22D3EE), Color(0xFFFB923C), Color(0xFFA2A9B5),
];

String _fmtTokens(num n) {
  if (n < 1000) return n.round().toString();
  if (n < 1000000) return '${(n / 1000).toStringAsFixed(n < 10000 ? 1 : 0)}k';
  return '${(n / 1000000).toStringAsFixed(2)}M';
}

String _fmtUsd(num n) => '\$${(n < 0.01 && n > 0) ? n.toStringAsFixed(4) : n.toStringAsFixed(2)}';

/// Open the context/usage info sheet (mirrors app/src/components/InfoSheet.tsx).
void showInfoSheet(BuildContext context, String sessionId, String kind) {
  showModalBottomSheet(
    context: context,
    backgroundColor: appColors.bgElevated,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _InfoSheetBody(sessionId: sessionId, kind: kind),
  );
}

class _InfoSheetBody extends StatefulWidget {
  final String sessionId;
  final String kind; // 'context' | 'usage'
  const _InfoSheetBody({required this.sessionId, required this.kind});

  @override
  State<_InfoSheetBody> createState() => _InfoSheetBodyState();
}

class _InfoSheetBodyState extends State<_InfoSheetBody> {
  bool _loading = true;
  String? _error;
  ContextUsageDTO? _context;
  UsageDTO? _usage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final store = context.read<Store>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (widget.kind == 'context') {
        _context = await store.requestContext(widget.sessionId);
      } else {
        _usage = await store.requestUsage(widget.sessionId);
      }
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Text(widget.kind == 'context' ? 'Context usage' : 'Usage & limits',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
          IconButton(
            icon: Icon(Icons.refresh, color: appColors.textDim),
            onPressed: _loading ? null : _load,
          ),
        ]),
        const SizedBox(height: 8),
        if (_loading)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
        else if (_error != null)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              Icon(Icons.error_outline, color: appColors.danger),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: appColors.danger)),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: _load, child: const Text('Retry')),
            ]),
          )
        else
          Flexible(
            child: SingleChildScrollView(
              child: widget.kind == 'context'
                  ? _ContextBody(data: _context!)
                  : _UsageBody(data: _usage!),
            ),
          ),
      ]),
    );
  }
}

class _Track extends StatelessWidget {
  final double pct;
  final Color color;
  final double height;
  const _Track({required this.pct, required this.color, this.height = 8});
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: LinearProgressIndicator(
        value: (pct / 100).clamp(0, 1),
        minHeight: height,
        backgroundColor: appColors.card,
        valueColor: AlwaysStoppedAnimation(color),
      ),
    );
  }
}

class _ContextBody extends StatelessWidget {
  final ContextUsageDTO data;
  const _ContextBody({required this.data});

  @override
  Widget build(BuildContext context) {
    final pct = data.percentage.clamp(0, 100).toDouble();
    final cats = data.categories.where((c) => c.tokens > 0).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.end, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('${pct.toStringAsFixed(1)}%', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
        Text('${_fmtTokens(data.totalTokens)} / ${_fmtTokens(data.maxTokens)} tokens',
            style: TextStyle(color: appColors.textDim, fontSize: 13)),
      ]),
      const SizedBox(height: 8),
      _Track(pct: pct, color: pct > 85 ? appColors.danger : appColors.accent),
      const SizedBox(height: 8),
      Text(data.model, style: kMono.copyWith(color: appColors.textFaint, fontSize: 11)),
      const SizedBox(height: 12),
      for (var i = 0; i < cats.length; i++) _catRow(cats[i], i, data.totalTokens),
    ]);
  }

  Widget _catRow(ContextUsageDTOCategories c, int i, num total) {
    final color = _palette[i % _palette.length];
    // Each bar's width is the category's share of total tokens (min 2% so tiny
    // categories stay visible).
    final share = total > 0 ? (c.tokens / total) * 100 : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        SizedBox(width: 116, child: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(color: appColors.textDim, fontSize: 13))),
        Expanded(
          child: Align(
            alignment: Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: (share / 100).clamp(0.02, 1.0),
              child: _Track(pct: 100, color: color, height: 6),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 52, child: Text(_fmtTokens(c.tokens), textAlign: TextAlign.right,
            style: TextStyle(color: appColors.textFaint, fontSize: 11))),
      ]),
    );
  }
}

class _UsageBody extends StatelessWidget {
  final UsageDTO data;
  const _UsageBody({required this.data});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<Store>();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        _stat('Session cost', _fmtUsd(data.sessionCostUsd)),
        const SizedBox(width: 8),
        _stat('Lines', '+${data.linesAdded} / -${data.linesRemoved}'),
        if (data.subscriptionType != null) ...[
          const SizedBox(width: 8),
          _stat('Plan', data.subscriptionType!),
        ],
      ]),
      if (data.rateLimits.isNotEmpty) ...[
        const SizedBox(height: 16),
        _sectionLabel('Rate limits'),
        for (final r in data.rateLimits) _rateLimit(r),
      ],
      if (data.models.isNotEmpty) ...[
        const SizedBox(height: 16),
        _sectionLabel('By model'),
        for (final m in data.models) _modelRow(m),
      ],
      const SizedBox(height: 16),
      _sectionLabel('Daily spend (7 days)'),
      _SpendHistory(spendByDay: store.spendByDay, budget: store.dailyBudgetUsd),
    ]);
  }

  Widget _stat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: appColors.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: appColors.border),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(value, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: appColors.textFaint, fontSize: 11)),
          ]),
        ),
      );

  Widget _sectionLabel(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t.toUpperCase(),
            style: TextStyle(color: appColors.textDim, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
      );

  Widget _rateLimit(UsageRateLimitDTO r) {
    final u = (r.utilization ?? 0).toDouble();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(r.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          Text(r.utilization == null ? '—' : '${u.toStringAsFixed(0)}%',
              style: TextStyle(color: appColors.textDim, fontSize: 11)),
        ]),
        const SizedBox(height: 4),
        _Track(pct: u, color: u > 85 ? appColors.danger : appColors.success),
      ]),
    );
  }

  Widget _modelRow(UsageModelDTO m) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(
            child: Text(m.model, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: kMono.copyWith(color: appColors.textDim, fontSize: 13)),
          ),
          Text('↑${_fmtTokens(m.inputTokens)} ↓${_fmtTokens(m.outputTokens)} · ${_fmtUsd(m.costUsd)}',
              style: TextStyle(color: appColors.textFaint, fontSize: 11)),
        ]),
      );
}

class _SpendHistory extends StatelessWidget {
  final Map<String, double> spendByDay;
  final double? budget;
  const _SpendHistory({required this.spendByDay, required this.budget});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    final days = <({String label, double amount, bool today})>[];
    for (var i = 6; i >= 0; i--) {
      final d = DateTime(now.year, now.month, now.day - i);
      final key = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      days.add((label: labels[d.weekday % 7], amount: spendByDay[key] ?? 0, today: i == 0));
    }
    final maxAmt = [budget ?? 0, ...days.map((d) => d.amount), 0.01].reduce((a, b) => a > b ? a : b);
    final today = days.last.amount;
    final over = budget != null && today > budget!;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(
        height: 96,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (final d in days)
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                SizedBox(
                  height: 12,
                  child: Text(d.amount > 0 ? (d.amount < 1 ? d.amount.toStringAsFixed(2) : d.amount.toStringAsFixed(1)) : '',
                      style: TextStyle(color: appColors.textFaint, fontSize: 9)),
                ),
                Container(
                  width: 18,
                  height: (3 + (d.amount / maxAmt) * 64).clamp(3, 67).toDouble(),
                  decoration: BoxDecoration(
                    color: (budget != null && d.amount > budget!)
                        ? appColors.danger
                        : (d.today ? appColors.accent : appColors.accentDim),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 3),
                Text(d.label,
                    style: TextStyle(
                        color: d.today ? appColors.text : appColors.textFaint,
                        fontSize: 11,
                        fontWeight: d.today ? FontWeight.w700 : FontWeight.w400)),
              ]),
            ),
        ]),
      ),
      const SizedBox(height: 8),
      Text(
        budget == null
            ? 'Today: ${_fmtUsd(today)} · set a daily budget in Settings'
            : 'Today: ${_fmtUsd(today)} / ${_fmtUsd(budget!)}${over ? ' ⚠ over budget' : ''}',
        textAlign: TextAlign.center,
        style: TextStyle(color: over ? appColors.danger : appColors.textDim, fontSize: 11),
      ),
    ]);
  }
}
