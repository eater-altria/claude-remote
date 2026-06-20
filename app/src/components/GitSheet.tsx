import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getClient } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet } from './BottomSheet';
import type { GitStatusDTO } from '../api/protocol';

/** Map a porcelain status code to a short label + color role. */
function describeCode(code: string, c: Palette): { label: string; color: string } {
  const x = code[0];
  const y = code[1];
  if (code === '??') return { label: 'new', color: c.success };
  if (x === 'A' || y === 'A') return { label: 'added', color: c.success };
  if (x === 'D' || y === 'D') return { label: 'deleted', color: c.danger };
  if (x === 'R') return { label: 'renamed', color: c.user };
  if (x === 'M' || y === 'M') return { label: 'modified', color: c.warning };
  return { label: code.trim() || 'changed', color: c.textDim };
}

interface DiffState {
  loading: boolean;
  text?: string;
  error?: string;
}

type DiffRow = { sign: ' ' | '+' | '-' | '@'; text: string };

const MAX_DIFF_ROWS = 400;

/** Parse raw `git diff` unified output into rows, dropping the file-header noise
 *  (diff --git / index / +++ / --- / mode / rename lines). */
function parseUnifiedDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const line of text.split('\n')) {
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity ') ||
      line.startsWith('rename ') ||
      line.startsWith('\\ No newline')
    ) {
      continue;
    }
    if (line.startsWith('@@')) rows.push({ sign: '@', text: line });
    else if (line.startsWith('+')) rows.push({ sign: '+', text: line.slice(1) });
    else if (line.startsWith('-')) rows.push({ sign: '-', text: line.slice(1) });
    else rows.push({ sign: ' ', text: line.startsWith(' ') ? line.slice(1) : line });
  }
  while (rows.length && rows[rows.length - 1].sign === ' ' && rows[rows.length - 1].text === '') rows.pop();
  return rows;
}

function DiffBody({ text, styles, colors }: { text: string; styles: ReturnType<typeof makeStyles>; colors: Palette }) {
  const rows = React.useMemo(() => parseUnifiedDiff(text), [text]);
  const shown = rows.slice(0, MAX_DIFF_ROWS);
  return (
    <View style={styles.diffWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {shown.map((r, idx) => (
            <Text
              key={idx}
              style={[
                styles.diffLine,
                r.sign === '+' && { backgroundColor: colors.diffAddBg, color: colors.diffAddText },
                r.sign === '-' && { backgroundColor: colors.diffDelBg, color: colors.diffDelText },
                r.sign === '@' && styles.diffHunk,
              ]}
            >
              {r.sign === ' ' || r.sign === '@' ? '  ' : `${r.sign} `}
              {r.text || ' '}
            </Text>
          ))}
        </View>
      </ScrollView>
      {rows.length > MAX_DIFF_ROWS ? (
        <Text style={styles.diffEmpty}>… {rows.length - MAX_DIFF_ROWS} more lines</Text>
      ) : null}
    </View>
  );
}

export function GitSheet({ visible, sessionId, onClose }: { visible: boolean; sessionId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [git, setGit] = React.useState<GitStatusDTO | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [diffs, setDiffs] = React.useState<Record<string, DiffState>>({});

  const load = React.useCallback(() => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    setExpanded({});
    setDiffs({});
    client
      .gitStatus(sessionId)
      .then((r) => setGit(r.git))
      .catch((e: any) => setError(e?.message || 'Failed to load git status'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const toggleFile = React.useCallback(
    (filePath: string) => {
      setExpanded((prev) => ({ ...prev, [filePath]: !prev[filePath] }));
      setDiffs((prev) => {
        if (prev[filePath]) return prev; // already loaded / loading
        const client = getClient();
        if (!client) return prev;
        client
          .gitDiff(sessionId, filePath)
          .then((r) => setDiffs((d) => ({ ...d, [filePath]: { loading: false, text: r.diff } })))
          .catch((e: any) => setDiffs((d) => ({ ...d, [filePath]: { loading: false, error: e?.message || 'Failed to load diff' } })));
        return { ...prev, [filePath]: { loading: true } };
      });
    },
    [sessionId],
  );

  React.useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Git</Text>
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
        </View>
      ) : git && !git.isRepo ? (
        <View style={styles.centerBox}>
          <Ionicons name="git-branch-outline" size={26} color={colors.textFaint} />
          <Text style={styles.dimText}>Not a git repository</Text>
        </View>
      ) : git ? (
        <View>
          <View style={styles.headerRow}>
            <View style={styles.branchPill}>
              <Ionicons name="git-branch" size={14} color={colors.accent} />
              <Text style={styles.branchText}>{git.branch ?? 'detached'}</Text>
            </View>
            {git.ahead ? <Text style={styles.aheadBehind}>↑{git.ahead}</Text> : null}
            {git.behind ? <Text style={styles.aheadBehind}>↓{git.behind}</Text> : null}
            {git.insertions > 0 || git.deletions > 0 ? (
              <Text style={styles.stat}>
                <Text style={{ color: colors.diffAddText }}>+{git.insertions}</Text>{'  '}
                <Text style={{ color: colors.diffDelText }}>−{git.deletions}</Text>
              </Text>
            ) : null}
          </View>

          {git.clean ? (
            <View style={styles.centerBox}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.dimText}>Working tree clean</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: space.sm }}>
              {git.files.map((f, i) => {
                const d = describeCode(f.code, colors);
                const isOpen = expanded[f.path];
                const ds = diffs[f.path];
                return (
                  <View key={f.path + i}>
                    <Pressable style={styles.fileRow} onPress={() => toggleFile(f.path)}>
                      <Ionicons
                        name={isOpen ? 'chevron-down' : 'chevron-forward'}
                        size={14}
                        color={colors.textFaint}
                      />
                      <View style={[styles.codeTag, { backgroundColor: d.color + '22' }]}>
                        <Text style={[styles.codeTagText, { color: d.color }]}>{d.label}</Text>
                      </View>
                      <Text style={styles.filePath} numberOfLines={1} ellipsizeMode="middle">
                        {f.path}
                      </Text>
                      {f.staged ? <Ionicons name="checkmark-done" size={14} color={colors.success} /> : null}
                    </Pressable>
                    {isOpen ? (
                      ds?.loading ? (
                        <View style={styles.diffLoading}>
                          <ActivityIndicator size="small" color={colors.accent} />
                        </View>
                      ) : ds?.error ? (
                        <Text style={styles.diffError}>{ds.error}</Text>
                      ) : ds?.text != null ? (
                        ds.text.trim() ? (
                          <DiffBody text={ds.text} styles={styles} colors={colors} />
                        ) : (
                          <Text style={styles.diffEmpty}>No diff to show.</Text>
                        )
                      ) : null
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}

      <Pressable style={styles.cancel} onPress={onClose}>
        <Text style={styles.cancelText}>Close</Text>
      </Pressable>
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
    title: { color: c.text, fontSize: font.size.lg, fontWeight: '700' },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, gap: space.sm },
    errorText: { color: c.danger, fontSize: font.size.sm, textAlign: 'center' },
    dimText: { color: c.textDim, fontSize: font.size.sm },

    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
    branchPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.accentSoft, paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill },
    branchText: { color: c.accent, fontSize: font.size.sm, fontWeight: '700' },
    aheadBehind: { color: c.textDim, fontSize: font.size.sm, fontWeight: '600' },
    stat: { fontSize: font.size.sm, marginLeft: 'auto' },

    fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    codeTag: { width: 72, alignItems: 'center', paddingVertical: 3, borderRadius: radius.sm },
    codeTagText: { fontSize: font.size.xs, fontWeight: '700' },
    filePath: { flex: 1, color: c.text, fontSize: font.size.sm, fontFamily: font.mono },

    diffWrap: { backgroundColor: c.codeBg, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden', paddingVertical: space.xs, marginTop: space.xs, marginBottom: space.sm },
    diffLine: { fontFamily: font.mono, fontSize: font.size.xs, lineHeight: 17, color: c.codeText, paddingHorizontal: space.md },
    diffHunk: { color: c.textDim },
    diffLoading: { paddingVertical: space.md, alignItems: 'center' },
    diffError: { color: c.danger, fontSize: font.size.xs, paddingVertical: space.sm, paddingHorizontal: space.md },
    diffEmpty: { color: c.textFaint, fontSize: font.size.xs, paddingVertical: space.sm, paddingHorizontal: space.md, textAlign: 'center' },

    cancel: { padding: space.md, alignItems: 'center', marginTop: space.sm },
    cancelText: { color: c.textDim, fontSize: font.size.md, fontWeight: '600' },
  });
