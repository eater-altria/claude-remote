import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { SubagentItem } from '../api/protocol';

/**
 * Always-on indicator for the session's running `Task` subagents, sitting just
 * above the task-progress panel. Fed by SessionView.subagents (replaced wholesale
 * on each `subagents` event). Stays a live signal: it hides once nothing is
 * running, so a long session's finished subagents don't leave a stale bar behind.
 * Expand to also see the ones that already finished this session.
 */
export function SubagentPanel({ subagents }: { subagents: SubagentItem[] }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = React.useState(false);

  const running = subagents.filter((a) => a.status === 'running');
  if (running.length === 0) return null;

  const finished = subagents.filter((a) => a.status !== 'running');
  // Collapsed summary: the running subagents' descriptions, comma-joined.
  const summary = running.map((a) => a.description || a.type).join(', ');

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.head} onPress={() => setExpanded((e) => !e)} hitSlop={6}>
        <Ionicons name="git-network" size={16} color={colors.accent} />
        <Text style={styles.count}>{running.length}</Text>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <ActivityIndicator size="small" color={colors.accent} />
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={15} color={colors.textFaint} />
      </Pressable>

      {expanded ? (
        <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="always">
          {[...running, ...finished].map((a) => (
            <View key={a.id} style={styles.row}>
              <StatusIcon status={a.status} colors={colors} />
              <View style={styles.rowBody}>
                <Text
                  style={[styles.rowText, a.status !== 'running' && styles.rowDone]}
                  numberOfLines={2}
                >
                  {a.description || a.type}
                </Text>
                <Text style={styles.rowType} numberOfLines={1}>
                  {a.type}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function StatusIcon({ status, colors }: { status: SubagentItem['status']; colors: Palette }) {
  if (status === 'completed') return <Ionicons name="checkmark-circle" size={16} color={colors.success} />;
  if (status === 'failed') return <Ionicons name="alert-circle" size={16} color={colors.danger} />;
  return <ActivityIndicator size="small" color={colors.accent} style={{ width: 16 }} />;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.bgElevated,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: space.lg,
      paddingTop: space.sm,
      paddingBottom: space.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    count: { color: c.textDim, fontSize: font.size.xs, fontWeight: '800', fontVariant: ['tabular-nums'] },
    summary: { flex: 1, color: c.text, fontSize: font.size.sm, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
    rowBody: { flex: 1, gap: 2 },
    rowText: { color: c.textDim, fontSize: font.size.sm, lineHeight: 19 },
    rowDone: { color: c.textFaint },
    rowType: { color: c.textFaint, fontSize: font.size.xs, fontWeight: '600' },
  });
