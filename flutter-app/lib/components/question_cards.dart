import 'package:flutter/material.dart';

import '../protocol/protocol.gen.dart';
import '../theme/theme.dart';

/// Inline clarification questions (custom ask_user MCP tool). Collects one
/// answer per question and submits a QuestionAnswer. Mirrors QuestionCards.tsx.
class QuestionCards extends StatefulWidget {
  final QuestionRequest request;
  final void Function(QuestionAnswer answer) onSubmit;
  const QuestionCards({super.key, required this.request, required this.onSubmit});

  @override
  State<QuestionCards> createState() => _QuestionCardsState();
}

class _QuestionCardsState extends State<QuestionCards> {
  /// selections[questionIndex] = set of chosen labels.
  late final List<Set<String>> _selected =
      List.generate(widget.request.questions.length, (_) => <String>{});

  bool get _complete => _selected.every((s) => s.isNotEmpty);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: appColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: appColors.accent),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (var qi = 0; qi < widget.request.questions.length; qi++)
          _questionBlock(qi, widget.request.questions[qi]),
        const SizedBox(height: 6),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _complete
                ? () => widget.onSubmit(
                    QuestionAnswer(selections: _selected.map((s) => s.toList()).toList()))
                : null,
            child: const Text('Submit'),
          ),
        ),
      ]),
    );
  }

  Widget _questionBlock(int qi, Question q) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (q.header.isNotEmpty)
        Text(q.header, style: TextStyle(color: appColors.accent, fontSize: 12, fontWeight: FontWeight.w600)),
      Padding(
        padding: const EdgeInsets.only(top: 2, bottom: 8),
        child: Text(q.question, style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
      ...q.options.map((opt) => _optionTile(qi, q, opt)),
      const SizedBox(height: 8),
    ]);
  }

  Widget _optionTile(int qi, Question q, QuestionOption opt) {
    final chosen = _selected[qi].contains(opt.label);
    return InkWell(
      onTap: () => setState(() {
        if (q.multiSelect) {
          chosen ? _selected[qi].remove(opt.label) : _selected[qi].add(opt.label);
        } else {
          _selected[qi] = {opt.label};
        }
      }),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: chosen ? appColors.accent.withValues(alpha: 0.15) : appColors.cardAlt,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: chosen ? appColors.accent : appColors.border),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(
            q.multiSelect
                ? (chosen ? Icons.check_box : Icons.check_box_outline_blank)
                : (chosen ? Icons.radio_button_checked : Icons.radio_button_unchecked),
            size: 18,
            color: chosen ? appColors.accent : appColors.textDim,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(opt.label, style: const TextStyle(fontWeight: FontWeight.w500)),
              if (opt.description != null)
                Text(opt.description!, style: TextStyle(color: appColors.textDim, fontSize: 12)),
            ]),
          ),
        ]),
      ),
    );
  }
}
