import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../state/store';
import { ApiClient, type ServerProfile } from '../api/client';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme, useThemeMode, type ThemeMode } from '../theme/ThemeProvider';

type Editing = { id: string | null; name: string; url: string; token: string };

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function AppearanceCard() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const { mode, setMode } = useThemeMode();
  return (
    <View style={styles.segment}>
      {THEME_OPTIONS.map((opt) => {
        const active = mode === opt.mode;
        return (
          <Pressable
            key={opt.mode}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => setMode(opt.mode)}
          >
            <Ionicons name={opt.icon as any} size={16} color={active ? colors.onAccent : colors.textDim} />
            <Text style={[styles.segmentText, { color: active ? colors.onAccent : colors.textDim }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const headerHeight = useHeaderHeight();
  const servers = useStore((s) => s.servers);
  const activeId = useStore((s) => s.activeId);
  const wsStatus = useStore((s) => s.wsStatus);
  const addServer = useStore((s) => s.addServer);
  const updateServer = useStore((s) => s.updateServer);
  const removeServer = useStore((s) => s.removeServer);
  const switchServer = useStore((s) => s.switchServer);

  const [editing, setEditing] = React.useState<Editing | null>(null);

  if (editing) {
    return (
      <ServerForm
        headerHeight={headerHeight}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSubmit={async (vals) => {
          if (editing.id) {
            await updateServer(editing.id, { name: vals.name, baseUrl: vals.url, token: vals.token });
          } else {
            const created = await addServer({ name: vals.name, baseUrl: vals.url, token: vals.token });
            await switchServer(created.id);
          }
          setEditing(null);
        }}
      />
    );
  }

  const confirmDelete = (srv: ServerProfile) => {
    Alert.alert('Remove server?', `“${srv.name}” will be removed from this app.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeServer(srv.id).catch(() => {}) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <Text style={styles.hint}>Follow your device, or pick a look.</Text>
      <AppearanceCard />

      <Text style={[styles.sectionTitle, { marginTop: space.xl }]}>Servers</Text>
      <Text style={styles.hint}>Tap a server to switch to it. The app reconnects instantly.</Text>

      {servers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="server-outline" size={40} color={colors.textFaint} />
          <Text style={styles.emptyText}>No servers yet. Add the Claude Remote server running on your machine.</Text>
        </View>
      ) : (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {servers.map((srv) => {
            const isActive = srv.id === activeId;
            return (
              <Pressable
                key={srv.id}
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => switchServer(srv.id)}
              >
                <View style={styles.radio}>
                  {isActive ? (
                    wsStatus === 'connecting' ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <View style={[styles.radioDot, { backgroundColor: wsStatus === 'open' ? colors.success : colors.warning }]} />
                    )
                  ) : (
                    <View style={styles.radioRing} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {srv.name}
                  </Text>
                  <Text style={styles.rowUrl} numberOfLines={1}>
                    {srv.baseUrl}
                  </Text>
                  {isActive && (
                    <Text style={[styles.rowStatus, { color: wsStatus === 'open' ? colors.success : colors.textFaint }]}>
                      {wsStatus === 'open' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting…' : 'Active · offline'}
                    </Text>
                  )}
                </View>
                <Pressable
                  hitSlop={10}
                  style={styles.iconBtn}
                  onPress={() => setEditing({ id: srv.id, name: srv.name, url: srv.baseUrl, token: srv.token })}
                >
                  <Ionicons name="create-outline" size={20} color={colors.textDim} />
                </Pressable>
                <Pressable hitSlop={10} style={styles.iconBtn} onPress={() => confirmDelete(srv)}>
                  <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable style={styles.addBtn} onPress={() => setEditing({ id: null, name: '', url: '', token: '' })}>
        <Ionicons name="add" size={20} color={colors.accent} />
        <Text style={styles.addBtnText}>Add server</Text>
      </Pressable>
    </ScrollView>
  );
}

function ServerForm({
  headerHeight,
  editing,
  onCancel,
  onSubmit,
}: {
  headerHeight: number;
  editing: Editing;
  onCancel: () => void;
  onSubmit: (vals: { name: string; url: string; token: string }) => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = React.useState(editing.name);
  const [url, setUrl] = React.useState(editing.url);
  const [token, setToken] = React.useState(editing.token);
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const submit = async () => {
    if (!url.trim() || !token.trim()) {
      setResult({ ok: false, msg: 'Enter both the server address and token.' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const client = new ApiClient({ baseUrl: url.trim(), token: token.trim() });
      const health = await client.health();
      setResult({ ok: true, msg: `Connected · Claude Code ${health.claudeCodeVersion}` });
      await onSubmit({ name: name.trim(), url: url.trim(), token: token.trim() });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || 'Could not reach the server' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>{editing.id ? 'Edit server' : 'Add server'}</Text>

        <Text style={[styles.label, { marginTop: space.lg }]}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Home Mac"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
        />
        <Text style={styles.hint}>A label to recognize this server. Optional.</Text>

        <Text style={[styles.label, { marginTop: space.lg }]}>Server address</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.1.20:8787"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
        />
        <Text style={styles.hint}>Use your computer's LAN IP and port 8787. On an Android emulator use http://10.0.2.2:8787.</Text>

        <Text style={[styles.label, { marginTop: space.lg }]}>Access token</Text>
        <TextInput
          style={styles.input}
          placeholder="Paste the token from the server logs"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          value={token}
          onChangeText={setToken}
        />
        <Text style={styles.hint}>Printed by the server on startup, and stored in ~/.claude-remote/config.json.</Text>

        {result && (
          <View style={[styles.result, { backgroundColor: result.ok ? colors.successSoft : colors.dangerSoft }]}>
            <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={result.ok ? colors.success : colors.danger} />
            <Text style={[styles.resultText, { color: result.ok ? colors.success : colors.danger }]}>{result.msg}</Text>
          </View>
        )}

        <Pressable style={styles.primaryBtn} onPress={submit} disabled={testing}>
          {testing ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryBtnText}>Test & Save</Text>}
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onCancel} disabled={testing}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sectionTitle: { color: c.text, fontSize: font.size.lg, fontWeight: '800' },
    label: { color: c.text, fontSize: font.size.md, fontWeight: '700', marginBottom: space.sm },
    input: { backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.md, padding: space.md, fontFamily: font.mono },
    hint: { color: c.textFaint, fontSize: font.size.xs, marginTop: space.xs, lineHeight: 16 },

    segment: { flexDirection: 'row', gap: space.xs, backgroundColor: c.cardAlt, borderRadius: radius.md, padding: 4, marginTop: space.md },
    segmentItem: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
    segmentItemActive: { backgroundColor: c.accent },
    segmentText: { fontSize: font.size.sm, fontWeight: '700' },

    empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
    emptyText: { color: c.textDim, fontSize: font.size.sm, textAlign: 'center', maxWidth: 280 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: c.card,
      borderRadius: radius.lg,
      padding: space.lg,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.shadow,
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: c.scheme === 'light' ? 2 : 0,
    },
    rowActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
    radio: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    radioRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.borderStrong },
    radioDot: { width: 12, height: 12, borderRadius: 6 },
    rowName: { color: c.text, fontSize: font.size.md, fontWeight: '700' },
    rowUrl: { color: c.textFaint, fontSize: font.size.xs, fontFamily: font.mono, marginTop: 2 },
    rowStatus: { fontSize: font.size.xs, fontWeight: '600', marginTop: 3 },
    iconBtn: { padding: space.xs },

    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.lg, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' },
    addBtnText: { color: c.accent, fontWeight: '700', fontSize: font.size.md },

    result: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, marginTop: space.lg },
    resultText: { fontSize: font.size.sm, flex: 1 },
    primaryBtn: { backgroundColor: c.accent, padding: space.md, borderRadius: radius.md, alignItems: 'center', marginTop: space.lg },
    primaryBtnText: { color: c.onAccent, fontWeight: '700', fontSize: font.size.md },
    secondaryBtn: { padding: space.md, borderRadius: radius.md, alignItems: 'center', marginTop: space.sm },
    secondaryText: { color: c.textDim, fontWeight: '600', fontSize: font.size.md },
  });
