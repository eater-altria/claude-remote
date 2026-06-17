import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet } from './BottomSheet';
import type { EffortLevel, ModelOptionDTO } from '../api/protocol';

// ---------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------
/** Short label for the current model id (e.g. "claude-opus-4-8[1m]" -> "Opus"). */
export function modelLabel(model: string | null | undefined, models: ModelOptionDTO[]): string {
  if (!model) return 'Model';
  const exact = models.find((m) => m.value === model);
  if (exact) return exact.displayName;
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model.length > 14 ? model.slice(0, 14) + '…' : model;
}

/**
 * Pick the single model value to highlight as selected. Prefer an exact id
 * match; only fall back to loose substring matching when nothing matches
 * exactly, so aliases (e.g. "opus") and pinned ids (e.g. "claude-opus-4-8[1m]")
 * don't both light up at once.
 */
function selectedModelValue(model: string | null | undefined, models: ModelOptionDTO[]): string | null {
  if (!model) return null;
  const exact = models.find((m) => m.value === model);
  if (exact) return exact.value;
  const a = model.toLowerCase();
  const loose = models.find((m) => {
    const b = m.value.toLowerCase().replace(/\[.*$/, '');
    return b.length > 2 && a.includes(b);
  });
  return loose?.value ?? null;
}

// ---------------------------------------------------------------------------
// Effort helpers
// ---------------------------------------------------------------------------
const EFFORT_OPTIONS: { value: EffortLevel | null; label: string; desc: string }[] = [
  { value: null, label: 'Default', desc: 'Let the engine decide (high)' },
  { value: 'low', label: 'Low', desc: 'Minimal thinking — fastest replies' },
  { value: 'medium', label: 'Medium', desc: 'Moderate thinking' },
  { value: 'high', label: 'High', desc: 'Deep reasoning' },
  { value: 'xhigh', label: 'Extra high', desc: 'Very deep reasoning' },
  { value: 'max', label: 'Max', desc: 'Maximum effort (select models only)' },
];

/** Short label for the header/toolbar pill. */
export function effortLabel(effort: EffortLevel | null | undefined): string {
  if (!effort) return 'Effort';
  if (effort === 'xhigh') return 'X-High';
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

// ---------------------------------------------------------------------------
// Combined sheet: model on top, thinking effort below.
// ---------------------------------------------------------------------------
export function ModelEffortSheet({
  visible,
  models,
  currentModel,
  currentEffort,
  onSelectModel,
  onSelectEffort,
  onClose,
}: {
  visible: boolean;
  models: ModelOptionDTO[];
  currentModel?: string | null;
  currentEffort?: EffortLevel | null;
  onSelectModel: (value: string) => void;
  onSelectEffort: (value: EffortLevel | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: space.sm }} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>Model</Text>
            {models.length === 0 ? (
              <Text style={styles.empty}>No models reported by the server yet.</Text>
            ) : (
              (() => {
                const selectedValue = selectedModelValue(currentModel, models);
                return models.map((m) => {
                const sel = m.value === selectedValue;
                return (
                  <Pressable key={m.value} style={[styles.row, sel && styles.rowSel]} onPress={() => onSelectModel(m.value)}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, sel && { color: colors.text }]}>{m.displayName}</Text>
                      {m.description ? (
                        <Text style={styles.desc} numberOfLines={2}>
                          {m.description}
                        </Text>
                      ) : null}
                    </View>
                    {sel ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
                  </Pressable>
                );
              });
              })()
            )}

            <Text style={[styles.section, { marginTop: space.lg }]}>Thinking effort</Text>
            {EFFORT_OPTIONS.map((o) => {
              const sel = (currentEffort ?? null) === o.value;
              return (
                <Pressable key={o.value ?? 'default'} style={[styles.row, sel && styles.rowSel]} onPress={() => onSelectEffort(o.value)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, sel && { color: colors.text }]}>{o.label}</Text>
                    <Text style={styles.desc} numberOfLines={2}>
                      {o.desc}
                    </Text>
                  </View>
                  {sel ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

      <Pressable style={styles.done} onPress={onClose}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { color: c.textDim, fontSize: font.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
    empty: { color: c.textDim, fontSize: font.size.sm, paddingVertical: space.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, marginBottom: space.sm, backgroundColor: c.card },
    rowSel: { borderColor: c.accent, backgroundColor: c.accentSoft },
    name: { color: c.textDim, fontSize: font.size.md, fontWeight: '700' },
    desc: { color: c.textFaint, fontSize: font.size.xs, marginTop: 2, lineHeight: 16 },
    done: { padding: space.md, alignItems: 'center', marginTop: space.xs, backgroundColor: c.accent, borderRadius: radius.md },
    doneText: { color: c.onAccent, fontSize: font.size.md, fontWeight: '700' },
  });
