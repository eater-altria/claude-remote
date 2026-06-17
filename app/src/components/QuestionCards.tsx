import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { Question, QuestionAnswer, QuestionRequest } from '../api/protocol';

const OTHER = '__other__';

export function QuestionCards({ request, onSubmit }: { request: QuestionRequest; onSubmit: (a: QuestionAnswer) => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  // selections[i] = set of chosen labels; custom[i] = free text for "Other".
  const [selections, setSelections] = React.useState<string[][]>(() => request.questions.map(() => []));
  const [custom, setCustom] = React.useState<string[]>(() => request.questions.map(() => ''));

  const toggle = (qi: number, q: Question, label: string) => {
    setSelections((prev) => {
      const next = prev.map((s) => [...s]);
      const cur = next[qi];
      if (q.multiSelect) {
        const idx = cur.indexOf(label);
        if (idx >= 0) cur.splice(idx, 1);
        else cur.push(label);
      } else {
        next[qi] = cur[0] === label ? [] : [label];
      }
      return next;
    });
  };

  const submit = () => {
    const finalSel = selections.map((s, i) => {
      const out = s.filter((x) => x !== OTHER);
      if (s.includes(OTHER) && custom[i].trim()) out.push(custom[i].trim());
      return out;
    });
    onSubmit({ selections: finalSel });
  };

  const canSubmit = selections.every((s, i) => s.length > 0 && (!s.includes(OTHER) || custom[i].trim().length > 0));

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="help-circle" size={18} color={colors.thinking} />
        <Text style={styles.title}>Claude needs your input</Text>
      </View>
      {request.questions.map((q, qi) => (
        <View key={qi} style={styles.qBlock}>
          {request.questions.length > 1 && <Text style={styles.chip}>{q.header}</Text>}
          <Text style={styles.question}>{q.question}</Text>
          {q.multiSelect && <Text style={styles.hint}>Choose all that apply</Text>}
          {q.options.map((opt, oi) => {
            const selected = selections[qi].includes(opt.label);
            return (
              <Pressable key={oi} style={[styles.option, selected && styles.optionSel]} onPress={() => toggle(qi, q, opt.label)}>
                <Ionicons
                  name={q.multiSelect ? (selected ? 'checkbox' : 'square-outline') : selected ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selected ? colors.accent : colors.textFaint}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optLabel, selected && { color: colors.text }]}>{opt.label}</Text>
                  {opt.description ? <Text style={styles.optDesc}>{opt.description}</Text> : null}
                  {opt.preview ? (
                    <Text style={styles.preview} numberOfLines={6}>
                      {opt.preview}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {/* Other */}
          <Pressable style={[styles.option, selections[qi].includes(OTHER) && styles.optionSel]} onPress={() => toggle(qi, q, OTHER)}>
            <Ionicons
              name={selections[qi].includes(OTHER) ? (q.multiSelect ? 'checkbox' : 'radio-button-on') : q.multiSelect ? 'square-outline' : 'radio-button-off'}
              size={18}
              color={selections[qi].includes(OTHER) ? colors.accent : colors.textFaint}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optLabel, selections[qi].includes(OTHER) && { color: colors.text }]}>Other…</Text>
              {selections[qi].includes(OTHER) && (
                <TextInput
                  style={styles.input}
                  placeholder="Type your answer"
                  placeholderTextColor={colors.textFaint}
                  value={custom[qi]}
                  onChangeText={(t) => setCustom((prev) => prev.map((c, i) => (i === qi ? t : c)))}
                  multiline
                />
              )}
            </View>
          </Pressable>
        </View>
      ))}
      <Pressable style={[styles.submit, !canSubmit && styles.submitDisabled]} disabled={!canSubmit} onPress={submit}>
        <Text style={styles.submitText}>Send answer</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: c.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(139,127,214,0.4)', padding: space.lg, marginVertical: space.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
    title: { color: c.text, fontSize: font.size.md, fontWeight: '700' },
    qBlock: { marginBottom: space.md },
    chip: { alignSelf: 'flex-start', color: c.thinking, backgroundColor: c.thinkingSoft, fontSize: font.size.xs, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, marginBottom: space.xs, overflow: 'hidden' },
    question: { color: c.text, fontSize: font.size.md, fontWeight: '600', marginBottom: space.sm },
    hint: { color: c.textFaint, fontSize: font.size.xs, marginBottom: space.sm },
    option: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, marginBottom: space.sm, backgroundColor: c.card },
    optionSel: { borderColor: c.accent, backgroundColor: c.accentSoft },
    optLabel: { color: c.textDim, fontSize: font.size.md, fontWeight: '600' },
    optDesc: { color: c.textDim, fontSize: font.size.sm, marginTop: 2, lineHeight: 19 },
    preview: { color: c.textFaint, fontFamily: font.mono, fontSize: font.size.xs, marginTop: space.xs, backgroundColor: c.codeBg, padding: space.sm, borderRadius: radius.sm },
    input: { color: c.text, fontSize: font.size.md, borderBottomWidth: 1, borderBottomColor: c.border, marginTop: space.xs, paddingVertical: space.xs },
    submit: { backgroundColor: c.accent, borderRadius: radius.md, padding: space.md, alignItems: 'center', marginTop: space.xs },
    submitDisabled: { opacity: 0.4 },
    submitText: { color: c.onAccent, fontWeight: '700', fontSize: font.size.md },
  });
