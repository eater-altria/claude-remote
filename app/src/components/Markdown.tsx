import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Lightweight markdown renderer tuned for Claude's output. Supports: fenced
 * code blocks, headings, bullet/numbered lists, blockquotes, horizontal rules,
 * GFM tables, and inline code / bold / italic / links. Intentionally
 * dependency-free.
 */
export function Markdown({ text, dim = false }: { text: string; dim?: boolean }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return (
    <View>
      {blocks.map((b, i) => (
        <Block key={i} block={b} dim={dim} />
      ))}
    </View>
  );
}

type Align = 'left' | 'center' | 'right';

type Block =
  | { kind: 'code'; lang?: string; content: string }
  | { kind: 'heading'; level: number; content: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; content: string }
  | { kind: 'hr' }
  | { kind: 'table'; headers: string[]; rows: string[][]; align: Align[] }
  | { kind: 'para'; content: string };

/** A GFM delimiter row, e.g. `|---|:--:|--:|`. Must contain a pipe so a bare
 * `---` stays a horizontal rule, not a one-cell table separator. */
function isTableSeparator(s: string): boolean {
  return s.includes('|') && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(s);
}

/** Split a table row into trimmed cells, honoring escaped `\|` and dropping the
 * empty cells produced by optional leading/trailing pipes. */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  const s = line.trim();
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && s[k + 1] === '|') {
      cur += '|';
      k++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

function parseAlign(sep: string, n: number): Align[] {
  const cells = splitTableRow(sep);
  const out: Align[] = [];
  for (let k = 0; k < n; k++) {
    const c = cells[k] ?? '';
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    out.push(l && r ? 'center' : r ? 'right' : 'left');
  }
  return out;
}

function parseBlocks(src: string): Block[] {
  const lines = (src ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: 'code', lang, content: buf.join('\n') });
      continue;
    }

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: heading[2] });
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // GFM table: a header row immediately followed by a delimiter row.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line);
      const align = parseAlign(lines[i + 1], headers.length);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        const cells = splitTableRow(lines[i]);
        // Pad/truncate each row to the header's column count.
        const row = headers.map((_, c) => cells[c] ?? '');
        rows.push(row);
        i++;
      }
      blocks.push({ kind: 'table', headers, rows, align });
      continue;
    }

    // lists
    if (/^\s*([-*+])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^\s*([-*+])\s+/.test(lines[i]) || /^\s*\d+[.)]\s+/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', content: buf.join('\n') });
      continue;
    }

    // paragraph (gather until blank / block boundary)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*([-*+])\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'para', content: buf.join('\n') });
  }
  return blocks;
}

function Block({ block, dim }: { block: Block; dim: boolean }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const baseColor = dim ? colors.textDim : colors.text;
  switch (block.kind) {
    case 'code':
      return <CodeBlock lang={block.lang} content={block.content} />;
    case 'heading':
      return (
        <Text style={[styles.heading, { fontSize: block.level <= 2 ? font.size.lg : font.size.md, color: baseColor }]}>
          <Inline text={block.content} color={baseColor} />
        </Text>
      );
    case 'list':
      return (
        <View style={{ marginVertical: space.xs }}>
          {block.items.map((it, idx) => (
            <View key={idx} style={styles.listRow}>
              <Text style={[styles.bullet, { color: dim ? colors.textFaint : colors.accent }]}>
                {block.ordered ? `${idx + 1}.` : '•'}
              </Text>
              <Text style={[styles.paraText, { color: baseColor, flex: 1 }]}>
                <Inline text={it} color={baseColor} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={styles.quote}>
          <Text style={[styles.paraText, { color: colors.textDim }]}>
            <Inline text={block.content} color={colors.textDim} />
          </Text>
        </View>
      );
    case 'hr':
      return <View style={styles.hr} />;
    case 'table':
      return <TableView block={block} dim={dim} />;
    case 'para':
    default:
      return (
        <Text style={[styles.paraText, { color: baseColor }]} selectable>
          <Inline text={block.content} color={baseColor} />
        </Text>
      );
  }
}

/** Inline formatting: `code`, **bold**, *italic*, [text](url). */
function Inline({ text, color }: { text: string; color: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Text key={key++}>{text.slice(last, m.index)}</Text>);
    const tok = m[0];
    if (tok.startsWith('`')) {
      nodes.push(
        <Text key={key++} style={styles.inlineCode}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith('**')) {
      nodes.push(
        <Text key={key++} style={{ fontWeight: '700', color }}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith('*')) {
      nodes.push(
        <Text key={key++} style={{ fontStyle: 'italic', color }}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        const url = lm[2];
        nodes.push(
          <Text key={key++} style={styles.link} onPress={() => Linking.openURL(url).catch(() => {})}>
            {lm[1]}
          </Text>,
        );
      } else {
        nodes.push(<Text key={key++}>{tok}</Text>);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(<Text key={key++}>{text.slice(last)}</Text>);
  return <>{nodes}</>;
}

/**
 * GFM table renderer (plan D). Narrow tables (≤3 columns) fill the available
 * width with wrapping cells so everything stays on screen; wider tables fall
 * back to a horizontally scrollable grid with fixed-width columns and a hint.
 */
function TableView({ block, dim }: { block: Extract<Block, { kind: 'table' }>; dim: boolean }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const baseColor = dim ? colors.textDim : colors.text;
  const cols = block.headers.length;
  const scroll = cols >= 4;
  const COL_W = 150;

  const cell = (text: string, ci: number, header: boolean) => {
    const align = block.align[ci] ?? 'left';
    const color = header ? baseColor : dim ? colors.textDim : colors.text;
    return (
      <View
        key={ci}
        style={[
          styles.tCell,
          ci < cols - 1 && styles.tCellDivider,
          scroll ? { width: COL_W } : { flex: 1 },
        ]}
      >
        <Text style={[header ? styles.tHeadText : styles.tBodyText, { color, textAlign: align }]} selectable>
          <Inline text={text} color={color} />
        </Text>
      </View>
    );
  };

  const grid = (
    <View style={[styles.tWrap, scroll && { width: COL_W * cols }]}>
      <View style={[styles.tRow, styles.tHeadRow]}>{block.headers.map((h, ci) => cell(h, ci, true))}</View>
      {block.rows.map((row, ri) => (
        <View key={ri} style={[styles.tRow, ri % 2 === 1 && styles.tRowAlt, ri === block.rows.length - 1 && styles.tRowLast]}>
          {row.map((val, ci) => cell(val, ci, false))}
        </View>
      ))}
    </View>
  );

  if (!scroll) return grid;

  return (
    <View style={{ marginVertical: space.xs }}>
      <Text style={styles.tScrollHint}>横向滑动查看 →</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        {grid}
      </ScrollView>
    </View>
  );
}

/** Fenced code block with a language label, copy button, and lightweight,
 * dependency-free syntax highlighting that works across common languages. */
function CodeBlock({ lang, content }: { lang?: string; content: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [copied, setCopied] = React.useState(false);
  const tokens = React.useMemo(() => highlight(content, colors), [content, colors]);

  const copy = React.useCallback(() => {
    Clipboard.setStringAsync(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [content]);

  const body = (
    <Text style={styles.codeText} selectable>
      {tokens.map((t, i) => (
        <Text key={i} style={t.color ? { color: t.color, fontStyle: t.italic ? 'italic' : 'normal' } : undefined}>
          {t.text}
        </Text>
      ))}
    </Text>
  );

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{lang || 'code'}</Text>
        <Pressable onPress={copy} hitSlop={8} style={styles.copyBtn}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.success : colors.textFaint} />
          <Text style={[styles.copyText, copied && { color: colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      {/* Long lines scroll horizontally instead of wrapping mid-token. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{body}</ScrollView>
    </View>
  );
}

type Tok = { text: string; color?: string; italic?: boolean };

// A pragmatic keyword set spanning JS/TS, Python, Go, Rust, Java, C-likes, Ruby,
// shell. False positives across languages are harmless for display purposes.
const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'import', 'export', 'from', 'as',
  'async', 'await', 'yield', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of',
  'def', 'elif', 'lambda', 'pass', 'with', 'and', 'or', 'not', 'None', 'True', 'False', 'self',
  'func', 'package', 'type', 'struct', 'interface', 'map', 'go', 'defer', 'chan', 'fn', 'let', 'mut',
  'pub', 'use', 'impl', 'trait', 'match', 'enum', 'where', 'public', 'private', 'protected', 'static',
  'void', 'int', 'float', 'double', 'bool', 'boolean', 'string', 'char', 'long', 'short', 'null', 'nil',
  'true', 'false', 'undefined', 'end', 'then', 'elsif', 'require', 'module', 'echo', 'fi', 'esac',
]);

/** Tokenize code into colored spans. Strings and comments take priority so we
 * never recolor keywords that live inside them. */
function highlight(code: string, c: Palette): Tok[] {
  const out: Tok[] = [];
  const n = code.length;
  let i = 0;
  const kw = c.accent;
  const str = c.success;
  const num = c.user;
  const com = c.textFaint;
  const isWord = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  const push = (text: string, color?: string, italic?: boolean) => { if (text) out.push({ text, color, italic }); };

  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];
    // line comments: // and #
    if ((ch === '/' && next === '/') || ch === '#') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      push(code.slice(i, j), com, true);
      i = j;
      continue;
    }
    // block comment /* ... */
    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      push(code.slice(i, j), com, true);
      i = j;
      continue;
    }
    // strings: ' " `
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j++; break; }
        j++;
      }
      push(code.slice(i, j), str);
      i = j;
      continue;
    }
    // numbers
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < n && /[0-9a-fA-FxX._]/.test(code[j])) j++;
      push(code.slice(i, j), num);
      i = j;
      continue;
    }
    // identifiers / keywords
    if (isWord(ch)) {
      let j = i;
      while (j < n && isWord(code[j])) j++;
      const w = code.slice(i, j);
      push(w, KEYWORDS.has(w) ? kw : undefined);
      i = j;
      continue;
    }
    // run of other chars (operators, punctuation, whitespace)
    let j = i;
    while (j < n && !isWord(code[j]) && code[j] !== '"' && code[j] !== "'" && code[j] !== '`' && code[j] !== '#' && !(code[j] >= '0' && code[j] <= '9') && !(code[j] === '/' && (code[j + 1] === '/' || code[j + 1] === '*'))) j++;
    if (j === i) j = i + 1;
    push(code.slice(i, j));
    i = j;
  }
  return out;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    paraText: { fontSize: font.size.md, lineHeight: 22, marginVertical: 3 },
    heading: { fontWeight: '700', marginTop: space.sm, marginBottom: 2 },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 1, paddingRight: space.sm },
    bullet: { width: 22, fontSize: font.size.md, lineHeight: 22, fontWeight: '700' },
    codeBlock: { backgroundColor: c.codeBg, borderRadius: radius.md, padding: space.md, marginVertical: space.xs, borderWidth: 1, borderColor: c.border },
    codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
    codeLang: { color: c.textFaint, fontSize: font.size.xs, fontFamily: font.mono },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 4 },
    copyText: { color: c.textFaint, fontSize: font.size.xs, fontWeight: '600' },
    codeText: { color: c.codeText, fontFamily: font.mono, fontSize: font.size.sm, lineHeight: 19 },
    inlineCode: { fontFamily: font.mono, fontSize: font.size.sm, color: c.accent, backgroundColor: c.accentSoft },
    link: { color: c.user, textDecorationLine: 'underline' },
    quote: { borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: space.md, marginVertical: space.xs },
    hr: { height: 1, backgroundColor: c.border, marginVertical: space.md },

    tWrap: { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden', marginVertical: space.xs },
    tRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: c.border },
    tRowLast: { borderBottomWidth: 0 },
    tHeadRow: { backgroundColor: c.cardAlt },
    tRowAlt: { backgroundColor: c.codeBg },
    tCell: { paddingVertical: space.sm, paddingHorizontal: space.md, justifyContent: 'center' },
    tCellDivider: { borderRightWidth: 1, borderRightColor: c.border },
    tHeadText: { fontSize: font.size.sm, lineHeight: 19, fontWeight: '700' },
    tBodyText: { fontSize: font.size.sm, lineHeight: 19 },
    tScrollHint: { color: c.textFaint, fontSize: font.size.xs, textAlign: 'right', marginBottom: 3 },
  });
