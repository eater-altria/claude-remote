import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet } from './BottomSheet';
import type { ContextUsageDTO, UsageDTO } from '../api/protocol';

export type InfoKind = 'context' | 'usage';

const PALETTE = ['#C96442', '#2B6CB0', '#8B7FD6', '#3FB950', '#D29922', '#E879F9', '#22D3EE', '#FB923C', '#A2A9B5'];

function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  return (n / 1_000_000).toFixed(2) + 'M';
}
function fmtUsd(n: number): string {
  return '$' + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2));
}
function fmtReset(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return 'now';
    const h = Math.floor(diffMs / 3_600_000);
    const m = Math.floor((diffMs % 3_600_000) / 60_000);
    if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h >= 1) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  } catch {
    return '';
  }
}

export function InfoSheet({
  visible,
  kind,
  sessionId,
  onClose,
}: {
  visible: boolean;
  kind: InfoKind;
  sessionId: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const requestContext = useStore((s) => s.requestContext);
  const requestUsage = useStore((s) => s.requestUsage);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [context, setContext] = React.useState<ContextUsageDTO | null>(null);
  const [usage, setUsage] = React.useState<UsageDTO | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const p = kind === 'context' ? requestContext(sessionId) : requestUsage(sessionId);
    p.then((data: any) => {
      if (kind === 'context') setContext(data);
      else setUsage(data);
    })
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [kind, sessionId, requestContext, requestUsage]);

  React.useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{kind === 'context' ? 'Context usage' : 'Usage & limits'}</Text>
        <Pressable onPress={load} hitSlop={10} disabled={loading}>
          <Ionicons name="refresh" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle" size={22} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: space.md }}>
          {kind === 'context' && context ? <ContextBody data={context} /> : null}
          {kind === 'usage' && usage ? <UsageBody data={usage} /> : null}
        </ScrollView>
      )}

      <Pressable style={styles.cancel} onPress={onClose}>
        <Text style={styles.cancelText}>Close</Text>
      </Pressable>
    </BottomSheet>
  );
}

function ContextBody({ data }: { data: ContextUsageDTO }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const pct = Math.min(100, Math.max(0, data.percentage));
  return (
    <View>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeBig}>{pct.toFixed(1)}%</Text>
        <Text style={styles.gaugeSub}>
          {fmtTokens(data.totalTokens)} / {fmtTokens(data.maxTokens)} tokens
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct > 85 ? colors.danger : colors.accent }]} />
      </View>
      <Text style={styles.modelLine}>{data.model}</Text>

      <View style={{ marginTop: space.md, gap: space.xs }}>
        {data.categories
          .filter((c) => c.tokens > 0)
          .map((c, i) => {
            const share = data.totalTokens > 0 ? (c.tokens / data.totalTokens) * 100 : 0;
            const color = PALETTE[i % PALETTE.length];
            return (
              <View key={c.name} style={styles.catRow}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={styles.catName} numberOfLines={1}>
                  {c.name}
                </Text>
                <View style={styles.catBarTrack}>
                  <View style={[styles.catBarFill, { width: `${Math.max(2, share)}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.catTokens}>{fmtTokens(c.tokens)}</Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}

function UsageBody({ data }: { data: UsageDTO }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.statsRow}>
        <Stat label="Session cost" value={fmtUsd(data.sessionCostUsd)} />
        <Stat label="Lines" value={`+${data.linesAdded} / -${data.linesRemoved}`} />
        {data.subscriptionType ? <Stat label="Plan" value={data.subscriptionType} /> : null}
      </View>

      {data.rateLimits.length > 0 ? (
        <View>
          <Text style={styles.sectionLabel}>Rate limits</Text>
          {data.rateLimits.map((r) => {
            const u = r.utilization ?? 0;
            return (
              <View key={r.label} style={{ marginBottom: space.sm }}>
                <View style={styles.rlHead}>
                  <Text style={styles.rlLabel}>{r.label}</Text>
                  <Text style={styles.rlPct}>
                    {r.utilization == null ? '—' : `${u.toFixed(0)}%`}
                    {r.resetsAt ? <Text style={styles.rlReset}>  ·  resets {fmtReset(r.resetsAt)}</Text> : null}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, u)}%`, backgroundColor: u > 85 ? colors.danger : colors.success }]} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {data.models.length > 0 ? (
        <View>
          <Text style={styles.sectionLabel}>By model</Text>
          {data.models.map((m) => (
            <View key={m.model} style={styles.modelRow}>
              <Text style={styles.modelName} numberOfLines={1}>
                {m.model}
              </Text>
              <Text style={styles.modelMeta}>
                ↑{fmtTokens(m.inputTokens)} ↓{fmtTokens(m.outputTokens)}  ·  {fmtUsd(m.costUsd)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
    title: { color: c.text, fontSize: font.size.lg, fontWeight: '700' },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, gap: space.sm },
    errorText: { color: c.danger, fontSize: font.size.sm, textAlign: 'center' },
    retry: { marginTop: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    retryText: { color: c.text, fontWeight: '600', fontSize: font.size.sm },

    gaugeHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    gaugeBig: { color: c.text, fontSize: font.size.xxl, fontWeight: '800' },
    gaugeSub: { color: c.textDim, fontSize: font.size.sm },
    track: { height: 8, borderRadius: 4, backgroundColor: c.card, overflow: 'hidden', marginTop: space.sm },
    fill: { height: '100%', borderRadius: 4 },
    modelLine: { color: c.textFaint, fontSize: font.size.xs, fontFamily: font.mono, marginTop: space.sm },

    catRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    dot: { width: 9, height: 9, borderRadius: 5 },
    catName: { color: c.textDim, fontSize: font.size.sm, width: 116 },
    catBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.card, overflow: 'hidden' },
    catBarFill: { height: '100%', borderRadius: 3 },
    catTokens: { color: c.textFaint, fontSize: font.size.xs, width: 52, textAlign: 'right' },

    statsRow: { flexDirection: 'row', gap: space.sm },
    stat: { flex: 1, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md },
    statValue: { color: c.text, fontSize: font.size.md, fontWeight: '800' },
    statLabel: { color: c.textFaint, fontSize: font.size.xs, marginTop: 2 },

    sectionLabel: { color: c.textDim, fontSize: font.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
    rlHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
    rlLabel: { color: c.text, fontSize: font.size.sm, fontWeight: '600' },
    rlPct: { color: c.textDim, fontSize: font.size.xs },
    rlReset: { color: c.textFaint, fontSize: font.size.xs },

    modelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingVertical: space.xs },
    modelName: { color: c.textDim, fontSize: font.size.sm, fontFamily: font.mono, flexShrink: 1 },
    modelMeta: { color: c.textFaint, fontSize: font.size.xs },

    cancel: { padding: space.md, alignItems: 'center', marginTop: space.sm },
    cancelText: { color: c.textDim, fontSize: font.size.md, fontWeight: '600' },
  });
