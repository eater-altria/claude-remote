import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoryColor, categoryIcon, font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Diff } from './Diff';
import type { TranscriptItem } from '../state/transcript';

type ToolItem = Extract<TranscriptItem, { type: 'tool' }>;

export function ToolCard({ item }: { item: ToolItem }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = React.useState(item.category === 'edit');
  const color = categoryColor(item.category, colors);
  const detail = useDetail(item);
  const hasBody = !!item.fileChange || !!item.result || !!detail.long;

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Pressable style={styles.header} onPress={() => hasBody && setExpanded((e) => !e)}>
        <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
          <Ionicons name={categoryIcon(item.category) as any} size={15} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.title}</Text>
          {detail.short ? (
            <Text style={styles.detail} numberOfLines={expanded ? 4 : 1}>
              {detail.short}
            </Text>
          ) : null}
        </View>
        <StatusDot status={item.status} />
        {hasBody && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />}
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {item.fileChange && <Diff fileChange={item.fileChange} />}
          {!item.fileChange && detail.long ? (
            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>
                {detail.long}
              </Text>
            </View>
          ) : null}
          {item.result ? (
            <View style={[styles.resultBox, item.status === 'error' && styles.resultError]}>
              <Text style={styles.resultLabel}>{item.status === 'error' ? 'Error' : 'Output'}</Text>
              <Text style={styles.resultText} selectable numberOfLines={40}>
                {item.result.trim() || '(empty)'}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function StatusDot({ status }: { status: ToolItem['status'] }) {
  const { colors } = useTheme();
  if (status === 'pending') return <ActivityIndicator size="small" color={colors.textFaint} style={{ marginRight: 4 }} />;
  if (status === 'error') return <Ionicons name="close-circle" size={16} color={colors.danger} style={{ marginRight: 4 }} />;
  return <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginRight: 4 }} />;
}

function useDetail(item: ToolItem): { short: string; long?: string } {
  const input = item.input as any;
  if (item.name === 'Bash') {
    const cmd = String(input?.command ?? '');
    return { short: cmd, long: cmd.length > 60 ? cmd : undefined };
  }
  if (item.fileChange) return { short: item.fileChange.path };
  if (item.name === 'Read' || item.name === 'Glob' || item.name === 'Grep') {
    return { short: String(input?.file_path ?? input?.pattern ?? '') };
  }
  if (item.name === 'WebFetch') return { short: String(input?.url ?? '') };
  if (item.name === 'WebSearch') return { short: String(input?.query ?? '') };
  if (item.name === 'Task') return { short: String(input?.description ?? ''), long: String(input?.prompt ?? '') || undefined };
  try {
    const s = JSON.stringify(input);
    return { short: s.length > 80 ? s.slice(0, 80) + '…' : s, long: s.length > 80 ? s : undefined };
  } catch {
    return { short: '' };
  }
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, marginVertical: 4, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm },
    iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontSize: font.size.sm, fontWeight: '600' },
    detail: { color: c.textDim, fontSize: font.size.xs, fontFamily: font.mono, marginTop: 2 },
    body: { paddingHorizontal: space.md, paddingBottom: space.md },
    codeBox: { backgroundColor: c.codeBg, borderRadius: radius.sm, padding: space.sm, marginTop: space.xs },
    code: { color: c.codeText, fontFamily: font.mono, fontSize: font.size.xs, lineHeight: 18 },
    resultBox: { backgroundColor: c.codeBg, borderRadius: radius.sm, padding: space.sm, marginTop: space.sm, borderLeftWidth: 3, borderLeftColor: c.border },
    resultError: { borderLeftColor: c.danger },
    resultLabel: { color: c.textFaint, fontSize: font.size.xs, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    resultText: { color: c.codeText, fontFamily: font.mono, fontSize: font.size.xs, lineHeight: 18 },
  });
