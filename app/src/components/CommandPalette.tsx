import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { SlashCommandDTO } from '../api/protocol';

const sourceIcon: Record<string, string> = {
  builtin: 'terminal-outline',
  skill: 'sparkles-outline',
  plugin: 'extension-puzzle-outline',
  client: 'options-outline',
};
function sourceColor(source: string, c: Palette): string {
  switch (source) {
    case 'skill':
      return c.thinking;
    case 'plugin':
      return c.user;
    case 'client':
      return c.accent;
    case 'builtin':
    default:
      return c.textDim;
  }
}

export function filterCommands(commands: SlashCommandDTO[], query: string): SlashCommandDTO[] {
  const q = query.toLowerCase();
  const scored = commands
    .map((c) => {
      const name = c.name.toLowerCase();
      let score = -1;
      if (!q) score = 0;
      else if (name.startsWith(q)) score = 3;
      else if (c.aliases?.some((a) => a.toLowerCase().startsWith(q))) score = 2;
      else if (name.includes(q)) score = 1;
      return { c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.map((x) => x.c).slice(0, 60);
}

export function CommandPalette({
  commands,
  query,
  onSelect,
}: {
  commands: SlashCommandDTO[];
  query: string;
  onSelect: (cmd: SlashCommandDTO) => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const filtered = React.useMemo(() => filterCommands(commands, query), [commands, query]);
  if (!filtered.length) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator
        style={{ maxHeight: 280 }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Ionicons
              name={(sourceIcon[item.source] || 'cube-outline') as any}
              size={16}
              color={sourceColor(item.source, colors)}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                /{item.name}
                {item.argumentHint ? <Text style={styles.hint}> {item.argumentHint}</Text> : null}
              </Text>
              {item.description ? (
                <Text style={styles.desc} numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            {item.client ? <Ionicons name="chevron-forward" size={14} color={colors.accent} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.borderStrong,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    name: { color: c.text, fontSize: font.size.md, fontFamily: font.mono, fontWeight: '600' },
    hint: { color: c.textFaint, fontFamily: font.mono, fontWeight: '400' },
    desc: { color: c.textDim, fontSize: font.size.xs, marginTop: 1 },
  });
