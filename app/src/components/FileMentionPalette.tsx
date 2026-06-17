import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { FsEntry } from '../api/protocol';

/**
 * Autocomplete list shown while the user is typing an `@file` mention. Entries
 * are already loaded + filtered by the parent; this is a pure renderer mirroring
 * CommandPalette's look. Selecting a folder drills in; a file completes the path.
 */
export function FileMentionPalette({ entries, onSelect }: { entries: FsEntry[]; onSelect: (e: FsEntry) => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  if (!entries.length) return null;
  return (
    <View style={styles.wrap}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.path}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator
        style={{ maxHeight: 280 }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Ionicons
              name={item.isDir ? 'folder' : 'document-outline'}
              size={16}
              color={item.isDir ? colors.accent : colors.textDim}
            />
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
              {item.isDir ? '/' : ''}
            </Text>
            {item.isDir ? <Ionicons name="chevron-forward" size={14} color={colors.accent} /> : null}
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
    name: { color: c.text, fontSize: font.size.md, fontFamily: font.mono, fontWeight: '600', flex: 1 },
  });
