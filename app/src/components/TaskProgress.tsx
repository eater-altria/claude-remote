import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { TodoItem } from '../api/protocol';

/**
 * Always-on preview of the agent's TodoWrite checklist for the current session:
 * a compact bar showing overall progress + the task in flight, expandable to the
 * full list. Fed by SessionView.todos (replaced wholesale on each TodoWrite).
 */
export function TaskProgress({ todos }: { todos: TodoItem[] }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = React.useState(false);

  if (!todos.length) return null;

  const done = todos.filter((t) => t.status === 'completed').length;
  const total = todos.length;
  const allDone = done === total;
  const current = todos.find((t) => t.status === 'in_progress');
  // Collapsed summary: the active task, else how many remain, else "done".
  const summary = current
    ? current.activeForm || current.content
    : allDone
      ? 'All tasks complete'
      : `${total - done} task${total - done === 1 ? '' : 's'} remaining`;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.head} onPress={() => setExpanded((e) => !e)} hitSlop={6}>
        <Ionicons
          name={allDone ? 'checkmark-done-circle' : 'list-circle'}
          size={16}
          color={allDone ? colors.success : colors.accent}
        />
        <Text style={styles.count}>
          {done}/{total}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={15} color={colors.textFaint} />
      </Pressable>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round((done / total) * 100)}%`, backgroundColor: allDone ? colors.success : colors.accent }]} />
      </View>

      {expanded ? (
        <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="always">
          {todos.map((t, i) => (
            <View key={i} style={styles.row}>
              <TodoIcon status={t.status} colors={colors} />
              <Text
                style={[
                  styles.rowText,
                  t.status === 'completed' && styles.rowDone,
                  t.status === 'in_progress' && { color: colors.text, fontWeight: '700' },
                ]}
                numberOfLines={2}
              >
                {t.status === 'in_progress' ? t.activeForm || t.content : t.content}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function TodoIcon({ status, colors }: { status: TodoItem['status']; colors: Palette }) {
  if (status === 'completed') return <Ionicons name="checkmark-circle" size={16} color={colors.success} />;
  if (status === 'in_progress') return <Ionicons name="ellipse" size={12} color={colors.accent} style={{ marginHorizontal: 2 }} />;
  return <Ionicons name="ellipse-outline" size={14} color={colors.textFaint} style={{ marginHorizontal: 1 }} />;
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
    track: { height: 3, borderRadius: 2, backgroundColor: c.border, marginTop: space.sm, overflow: 'hidden' },
    fill: { height: 3, borderRadius: 2 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
    rowText: { flex: 1, color: c.textDim, fontSize: font.size.sm, lineHeight: 19 },
    rowDone: { color: c.textFaint, textDecorationLine: 'line-through' },
  });
