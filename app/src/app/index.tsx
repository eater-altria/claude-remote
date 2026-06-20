import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { SessionMeta, SessionState } from '../api/protocol';

const STATE_LABEL: Record<SessionState, string> = {
  starting: 'Starting',
  idle: 'Ready',
  running: 'Working',
  awaiting_permission: 'Needs approval',
  awaiting_question: 'Needs answer',
  error: 'Error',
  closed: 'Closed',
};
function stateColor(s: SessionState, c: Palette): string {
  if (s === 'running' || s === 'starting') return c.warning;
  if (s === 'awaiting_permission' || s === 'awaiting_question') return c.accent;
  if (s === 'error') return c.danger;
  return c.success;
}

export default function SessionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const config = useStore((s) => s.config);
  const configLoaded = useStore((s) => s.configLoaded);
  const wsStatus = useStore((s) => s.wsStatus);
  const sessions = useStore((s) => s.sessions);
  const servers = useStore((s) => s.servers);
  const activeId = useStore((s) => s.activeId);
  const lastSeen = useStore((s) => s.lastSeen);
  const switchServer = useStore((s) => s.switchServer);
  const refreshSessions = useStore((s) => s.refreshSessions);
  const deleteSession = useStore((s) => s.deleteSession);
  const activeServer = servers.find((s) => s.id === activeId);

  // A session is "unread" if it changed since the user last viewed it. New
  // sessions (no lastSeen entry) are treated as already-seen to avoid noise.
  const isUnread = (s: SessionMeta) => lastSeen[s.id] != null && s.updatedAt > lastSeen[s.id];
  const needsCount = sessions.filter((s) => s.state === 'awaiting_permission' || s.state === 'awaiting_question').length;
  const workingCount = sessions.filter((s) => s.state === 'running' || s.state === 'starting').length;

  const spendByDay = useStore((s) => s.spendByDay);
  const dailyBudget = useStore((s) => s.dailyBudgetUsd);
  const todaySpend = spendByDay[new Date().toISOString().slice(0, 10)] ?? 0;
  const overBudget = dailyBudget != null && todaySpend > dailyBudget;

  const quickSwitch = React.useCallback(() => {
    if (servers.length < 2) {
      router.push('/settings');
      return;
    }
    Alert.alert('Switch server', undefined, [
      ...servers.map((srv) => ({
        text: `${srv.id === activeId ? '✓ ' : ''}${srv.name}`,
        onPress: () => {
          if (srv.id !== activeId) switchServer(srv.id);
        },
      })),
      { text: 'Manage…', onPress: () => router.push('/settings') },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [servers, activeId, switchServer, router]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshSessions();
    } catch (e: any) {
      setError(e?.message || 'Failed to load sessions');
    } finally {
      setRefreshing(false);
    }
  }, [config, refreshSessions]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      // Live-ish dashboard: poll session states while this screen is focused so
      // badges update without a manual pull-to-refresh.
      const timer = setInterval(() => {
        refreshSessions().catch(() => {});
      }, 6000);
      return () => clearInterval(timer);
    }, [refresh, refreshSessions]),
  );

  const confirmDelete = (s: SessionMeta) => {
    Alert.alert('Delete session?', `“${s.title}” will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(s.id).catch(() => {}) },
    ]);
  };

  if (!configLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!config) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <Stack.Screen options={{ headerRight: () => null }} />
        <Ionicons name="cloud-offline-outline" size={56} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>Connect to your server</Text>
        <Text style={styles.emptySub}>Point the app at the Claude Remote server running on your machine.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.push('/settings')}>
          <Ionicons name="link" size={18} color={colors.onAccent} />
          <Text style={styles.primaryBtnText}>Set up server</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={quickSwitch} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {activeServer?.name ?? 'Claude Remote'}
              </Text>
              {servers.length > 1 && <Ionicons name="chevron-down" size={15} color={colors.textDim} />}
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
              <ConnDot status={wsStatus} />
              <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          (sessions.length > 0 && (needsCount > 0 || workingCount > 0)) || overBudget ? (
            <View style={styles.summary}>
              {overBudget ? (
                <View style={[styles.summaryChip, { backgroundColor: colors.danger + '22' }]}>
                  <Ionicons name="warning" size={13} color={colors.danger} />
                  <Text style={[styles.summaryText, { color: colors.danger }]}>
                    ${todaySpend.toFixed(2)} / ${dailyBudget!.toFixed(0)} today
                  </Text>
                </View>
              ) : null}
              {needsCount > 0 ? (
                <View style={[styles.summaryChip, { backgroundColor: colors.accent + '22' }]}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.summaryText, { color: colors.accent }]}>{needsCount} need{needsCount > 1 ? '' : 's'} you</Text>
                </View>
              ) : null}
              {workingCount > 0 ? (
                <View style={[styles.summaryChip, { backgroundColor: colors.warning + '22' }]}>
                  <ActivityIndicator size="small" color={colors.warning} />
                  <Text style={[styles.summaryText, { color: colors.warning }]}>{workingCount} working</Text>
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySub}>{error ?? 'Tap + to start talking to Claude Code.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/session/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                {isUnread(item) ? <View style={styles.unreadDot} /> : null}
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={styles.rowPath} numberOfLines={1}>
                {item.cwd}
              </Text>
              <View style={styles.rowMeta}>
                <View style={[styles.badge, { backgroundColor: stateColor(item.state, colors) + '22' }]}>
                  <View style={[styles.dot, { backgroundColor: stateColor(item.state, colors) }]} />
                  <Text style={[styles.badgeText, { color: stateColor(item.state, colors) }]}>{STATE_LABEL[item.state]}</Text>
                </View>
                {item.live ? null : <Text style={styles.dim}>· paused</Text>}
                {typeof item.totalCostUsd === 'number' && item.totalCostUsd > 0 ? (
                  <Text style={styles.dim}>· ${item.totalCostUsd.toFixed(2)}</Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={12} style={styles.trash}>
              <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
            </Pressable>
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/new-session')}>
        <Ionicons name="add" size={28} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

function ConnDot({ status }: { status: string }) {
  const { colors } = useTheme();
  const color = status === 'open' ? colors.success : status === 'connecting' ? colors.warning : colors.danger;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: colors.textDim, fontSize: font.size.xs }}>
        {status === 'open' ? 'Live' : status === 'connecting' ? '…' : 'Off'}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, backgroundColor: c.bg },
    headerTitle: { color: c.text, fontSize: font.size.lg, fontWeight: '700', maxWidth: 200 },
    emptyTitle: { color: c.text, fontSize: font.size.lg, fontWeight: '700', marginTop: space.sm },
    emptySub: { color: c.textDim, fontSize: font.size.sm, textAlign: 'center', maxWidth: 280 },
    primaryBtn: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: c.accent, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md, marginTop: space.lg },
    primaryBtnText: { color: c.onAccent, fontWeight: '700', fontSize: font.size.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: radius.lg,
      padding: space.lg,
      marginBottom: space.md,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.shadow,
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: c.scheme === 'light' ? 2 : 0,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
    rowTitle: { color: c.text, fontSize: font.size.md, fontWeight: '700', flexShrink: 1 },
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
    summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
    summaryText: { fontSize: font.size.sm, fontWeight: '700' },
    rowPath: { color: c.textFaint, fontSize: font.size.xs, fontFamily: font.mono, marginTop: 2 },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
    badgeText: { fontSize: font.size.xs, fontWeight: '600' },
    dot: { width: 7, height: 7, borderRadius: 4 },
    dim: { color: c.textFaint, fontSize: font.size.xs },
    trash: { padding: space.sm },
    fab: {
      position: 'absolute',
      right: space.xl,
      bottom: space.xl,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: c.scheme === 'light' ? 0.22 : 0.4,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  });
