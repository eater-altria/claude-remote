import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, getClient } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { FsEntry, FsRoot, PermissionMode } from '../api/protocol';
import { PERMISSION_MODE_LABELS } from '../api/protocol';

const MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

export default function NewSessionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const createSession = useStore((s) => s.createSession);

  const [roots, setRoots] = React.useState<FsRoot[]>([]);
  const [path, setPath] = React.useState<string>('');
  const [parent, setParent] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<FsEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<PermissionMode>('default');
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (p?: string) => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.fsList(p ?? '');
      setPath(res.path);
      setParent(res.parent);
      setEntries(res.entries);
    } catch (e: any) {
      setError(e?.message || 'Could not list folder');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const client = getClient();
    if (!client) return;
    client
      .fsRoots()
      .then((r) => {
        setRoots(r.roots);
        return load(r.roots[0]?.path);
      })
      .catch((e) => setError(e?.message));
  }, [load]);

  const create = async () => {
    if (!path) return;
    setCreating(true);
    setError(null);
    try {
      const session = await createSession(path, { permissionMode: mode, title: basename(path) });
      router.replace(`/session/${session.id}`);
    } catch (e: any) {
      setError(e?.message || 'Could not create session');
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Roots */}
      <View style={styles.rootsRow}>
        <FlatList
          horizontal
          data={roots}
          keyExtractor={(r) => r.path}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.rootChip} onPress={() => load(item.path)}>
              <Ionicons name="folder-open-outline" size={14} color={colors.accent} />
              <Text style={styles.rootChipText}>{item.name}</Text>
            </Pressable>
          )}
        />
      </View>

      {/* Path bar */}
      <View style={styles.pathBar}>
        <Pressable onPress={() => parent && load(parent)} hitSlop={8} disabled={!parent} style={{ opacity: parent ? 1 : 0.3 }}>
          <Ionicons name="arrow-up" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="head">
          {path || '…'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.path}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Empty folder'}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.entry}
              disabled={!item.isDir}
              onPress={() => item.isDir && load(item.path)}
            >
              <Ionicons
                name={item.isDir ? 'folder' : 'document-outline'}
                size={20}
                color={item.isDir ? colors.accent : colors.textFaint}
              />
              <Text style={[styles.entryName, !item.isDir && { color: colors.textFaint }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isDir && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
            </Pressable>
          )}
        />
      )}

      {/* Options + create */}
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Permission mode</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable key={m} style={[styles.modeChip, mode === m && styles.modeChipActive]} onPress={() => setMode(m)}>
              <Text style={[styles.modeChipText, mode === m && { color: colors.onAccent }]}>{PERMISSION_MODE_LABELS[m]}</Text>
            </Pressable>
          ))}
        </View>
        {error && !loading ? <Text style={styles.errText}>{error}</Text> : null}
        <Pressable style={[styles.createBtn, creating && { opacity: 0.6 }]} onPress={create} disabled={creating || !path}>
          {creating ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name="play" size={18} color={colors.onAccent} />
              <Text style={styles.createText}>Start in “{basename(path)}”</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    rootsRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border },
    rootChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.card,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.shadow,
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: c.scheme === 'light' ? 2 : 0,
    },
    rootChipText: { color: c.text, fontSize: font.size.sm },
    pathBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.bgElevated },
    pathText: { color: c.textDim, fontSize: font.size.sm, fontFamily: font.mono, flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: c.textFaint, textAlign: 'center', padding: space.xl },
    entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    entryName: { color: c.text, fontSize: font.size.md, flex: 1 },
    footer: { borderTopWidth: 1, borderTopColor: c.border, padding: space.lg, backgroundColor: c.bgElevated, gap: space.sm },
    footerLabel: { color: c.textDim, fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    modeChip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    modeChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    modeChipText: { color: c.textDim, fontSize: font.size.sm, fontWeight: '600' },
    errText: { color: c.danger, fontSize: font.size.sm },
    createBtn: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, padding: space.md, borderRadius: radius.md, marginTop: space.xs },
    createText: { color: c.onAccent, fontWeight: '700', fontSize: font.size.md },
  });
