import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Markdown } from './Markdown';

export function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  // Auto-expand while streaming so you can watch it reason; collapse once done.
  const [expanded, setExpanded] = React.useState(true);
  React.useEffect(() => {
    if (!streaming) setExpanded(false);
  }, [streaming]);

  const preview = text.replace(/\n+/g, ' ').slice(0, 80);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.header} onPress={() => setExpanded((e) => !e)}>
        <Ionicons name="sparkles-outline" size={14} color={colors.thinking} />
        <Text style={styles.label}>{streaming ? 'Thinking…' : 'Thought'}</Text>
        {!expanded && preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
      </Pressable>
      {expanded && text ? (
        <View style={styles.body}>
          <Markdown text={text} dim />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: c.thinkingSoft, borderRadius: radius.md, marginVertical: 4, borderWidth: 1, borderColor: 'rgba(139,127,214,0.25)' },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm },
    label: { color: c.thinking, fontSize: font.size.sm, fontWeight: '600' },
    preview: { color: c.textFaint, fontSize: font.size.xs, flex: 1, fontStyle: 'italic' },
    body: { paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: 2 },
  });
