import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { FsEntry } from '../api/protocol';

/**
 * Autocomplete list shown while the user is typing an `@file` mention. Entries
 * are already loaded + ranked by the parent; this is a pure renderer mirroring
 * CommandPalette's look. Selecting a folder drills in; a file completes the path.
 * The matched part of each name is highlighted, and a header shows the current
 * directory + match count (with loading / empty states).
 */
export function FileMentionPalette({
  entries,
  query,
  dir,
  loading,
  onSelect,
}: {
  entries: FsEntry[];
  query: string;
  dir: string;
  loading?: boolean;
  onSelect: (e: FsEntry) => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const q = query.toLowerCase();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="at" size={13} color={colors.textDim} />
        <Text style={styles.headerText} numberOfLines={1}>
          {dir ? `${dir}/` : 'working directory'}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textDim} />
        ) : (
          <Text style={styles.headerCount}>{entries.length}</Text>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>{loading ? 'Loading…' : 'No matching files'}</Text>
      ) : (
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
                {highlight(item.name, q, colors)}
                {item.isDir ? '/' : ''}
              </Text>
              {item.isDir ? <Ionicons name="chevron-forward" size={14} color={colors.accent} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** Bold + accent-color the first case-insensitive occurrence of `q` in `name`. */
function highlight(name: string, q: string, colors: Palette): React.ReactNode {
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q);
  if (idx < 0) return name;
  return (
    <>
      {name.slice(0, idx)}
      <Text style={{ color: colors.accent, fontWeight: '800' }}>{name.slice(idx, idx + q.length)}</Text>
      {name.slice(idx + q.length)}
    </>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.cardAlt,
    },
    headerText: { flex: 1, color: c.textDim, fontSize: font.size.xs, fontFamily: font.mono },
    headerCount: { color: c.textFaint, fontSize: font.size.xs, fontWeight: '700' },
    emptyText: { color: c.textFaint, fontSize: font.size.sm, paddingHorizontal: space.lg, paddingVertical: space.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    name: { color: c.text, fontSize: font.size.md, fontFamily: font.mono, fontWeight: '600', flex: 1 },
  });
