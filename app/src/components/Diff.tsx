import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { FileChange } from '../api/protocol';

type Row = { sign: ' ' | '+' | '-'; text: string };

/** Simple LCS line diff → rows. Good enough for the compact diff cards. */
function diffLines(oldText: string, newText: string): Row[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ sign: ' ', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ sign: '-', text: a[i] });
      i++;
    } else {
      rows.push({ sign: '+', text: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ sign: '-', text: a[i++] });
  while (j < m) rows.push({ sign: '+', text: b[j++] });
  return rows;
}

function buildRows(fc: FileChange): Row[] {
  if (fc.changeType === 'edit' && fc.edits?.length) {
    const rows: Row[] = [];
    fc.edits.forEach((e, idx) => {
      if (idx > 0) rows.push({ sign: ' ', text: '⋯' });
      rows.push(...diffLines(e.oldText, e.newText));
    });
    return rows;
  }
  // create / write — show as all-added (capped).
  const content = fc.content ?? '';
  return content.split('\n').map((t) => ({ sign: '+' as const, text: t }));
}

export function Diff({ fileChange, maxRows = 60 }: { fileChange: FileChange; maxRows?: number }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const rows = React.useMemo(() => buildRows(fileChange), [fileChange]);
  const shown = rows.slice(0, maxRows);
  const added = rows.filter((r) => r.sign === '+').length;
  const removed = rows.filter((r) => r.sign === '-').length;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.path} numberOfLines={1}>
          {fileChange.path}
        </Text>
        <View style={styles.stats}>
          {added > 0 && <Text style={styles.add}>+{added}</Text>}
          {removed > 0 && <Text style={styles.del}>−{removed}</Text>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <View>
          {shown.map((r, idx) => (
            <Text
              key={idx}
              style={[
                styles.line,
                r.sign === '+' && styles.lineAdd,
                r.sign === '-' && styles.lineDel,
              ]}
            >
              {r.sign === ' ' ? '  ' : `${r.sign} `}
              {r.text || ' '}
            </Text>
          ))}
        </View>
      </ScrollView>
      {rows.length > maxRows && <Text style={styles.more}>… {rows.length - maxRows} more lines</Text>}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: c.codeBg, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginTop: space.sm },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: c.cardAlt },
    path: { color: c.textDim, fontFamily: font.mono, fontSize: font.size.xs, flex: 1 },
    stats: { flexDirection: 'row', gap: space.sm, marginLeft: space.sm },
    add: { color: c.diffAddText, fontSize: font.size.xs, fontWeight: '700' },
    del: { color: c.diffDelText, fontSize: font.size.xs, fontWeight: '700' },
    codeScroll: { paddingVertical: space.xs },
    line: { fontFamily: font.mono, fontSize: font.size.xs, lineHeight: 17, color: c.codeText, paddingHorizontal: space.md },
    lineAdd: { backgroundColor: c.diffAddBg, color: c.diffAddText },
    lineDel: { backgroundColor: c.diffDelBg, color: c.diffDelText },
    more: { color: c.textFaint, fontSize: font.size.xs, padding: space.sm, textAlign: 'center' },
  });
