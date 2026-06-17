import React from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useStore, getClient } from '../../state/store';
import type { SessionView } from '../../state/store';
import type { TranscriptItem } from '../../state/transcript';
import { font, radius, space, type Palette } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';
import { Markdown } from '../../components/Markdown';
import { ThinkingBlock } from '../../components/ThinkingBlock';
import { ToolCard } from '../../components/ToolCard';
import { PermissionSheet } from '../../components/PermissionSheet';
import { QuestionCards } from '../../components/QuestionCards';
import { CommandPalette } from '../../components/CommandPalette';
import { ModelEffortSheet, modelLabel, effortLabel } from '../../components/ModelEffortSheet';
import { InfoSheet, type InfoKind } from '../../components/InfoSheet';
import { FileMentionPalette } from '../../components/FileMentionPalette';
import { FileCard } from '../../components/FileCard';
import { PERMISSION_MODE_LABELS, type EffortLevel, type FsEntry, type PermissionMode, type SlashCommandDTO } from '../../api/protocol';

const MODE_CYCLE: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

const EMPTY_VIEW: SessionView = { items: [], permissions: [], questions: [] };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id);

  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const view = useStore((s) => s.views[sessionId]) ?? EMPTY_VIEW;
  const openSession = useStore((s) => s.openSession);
  const closeSession = useStore((s) => s.closeSession);
  const sendMessage = useStore((s) => s.sendMessage);
  const respondPermission = useStore((s) => s.respondPermission);
  const respondQuestion = useStore((s) => s.respondQuestion);
  const interrupt = useStore((s) => s.interrupt);
  const setMode = useStore((s) => s.setMode);
  const setModel = useStore((s) => s.setModel);
  const setEffort = useStore((s) => s.setEffort);
  const globalCaps = useStore((s) => s.capabilities);

  const [text, setText] = React.useState('');
  const [modelEffortOpen, setModelEffortOpen] = React.useState(false);
  const [infoSheet, setInfoSheet] = React.useState<{ kind: InfoKind } | null>(null);
  const [pendingImages, setPendingImages] = React.useState<{ uri: string; mime: string; data: string }[]>([]);
  const [fileEntries, setFileEntries] = React.useState<FsEntry[]>([]);
  const [showJump, setShowJump] = React.useState(false);
  const listRef = React.useRef<FlatList>(null);
  // Whether the user is currently pinned to (or near) the bottom. Auto-scroll on
  // new content only happens while this is true, so scrolling up to read history
  // is never interrupted.
  const atBottomRef = React.useRef(true);
  // react-native-keyboard-controller's KeyboardAvoidingView doesn't auto-measure
  // the view's top offset, so without this the input bar sits under the keyboard
  // by exactly the navigation header's height.
  const headerHeight = useHeaderHeight();

  React.useEffect(() => {
    openSession(sessionId);
    return () => closeSession(sessionId);
  }, [sessionId, openSession, closeSession]);

  const meta = view.meta;
  const state = meta?.state ?? 'starting';
  const busy = state === 'running' || state === 'starting';
  const mode = meta?.permissionMode ?? 'default';

  const caps = view.capabilities ?? globalCaps ?? undefined;
  const baseCommands = caps?.commands ?? [];
  // Surface /effort even though the engine doesn't list it — we drive it via UI.
  const commands = baseCommands.some((c) => c.name === 'effort')
    ? baseCommands
    : [
        ...baseCommands,
        { name: 'effort', description: 'Set the thinking effort level', argumentHint: '', source: 'client', client: true } as SlashCommandDTO,
      ];
  const models = caps?.models ?? [];
  const effort = meta?.effort ?? null;
  // Newest-first copy for the inverted FlatList. Memoized so typing (which only
  // changes `text`) doesn't rebuild the array and re-render the whole list.
  const invertedItems = React.useMemo(() => view.items.slice().reverse(), [view.items]);

  // Command palette: open while typing a command (leading "/", no space yet).
  const slashMatch = text.match(/^\/(\S*)$/);
  const paletteOpen = !!slashMatch && commands.length > 0;
  const paletteQuery = slashMatch ? slashMatch[1] : '';

  // File-mention palette: open while typing "@path" (anywhere in the input, up to
  // the next space). Matches files/folders under the session's working directory.
  const atMatch = !slashMatch ? text.match(/(?:^|\s)@([^\s]*)$/) : null;
  const mentionQuery = atMatch ? atMatch[1] : '';
  const mentionActive = !!atMatch && !!meta?.cwd;
  const mentionSlash = mentionQuery.lastIndexOf('/');
  const mentionDir = mentionSlash >= 0 ? mentionQuery.slice(0, mentionSlash) : '';
  const mentionPrefix = mentionSlash >= 0 ? mentionQuery.slice(mentionSlash + 1) : mentionQuery;

  // Load the directory's entries when the mention's directory part changes (not on
  // every keystroke — the prefix is filtered locally below).
  React.useEffect(() => {
    if (!mentionActive) return;
    const cwd = meta?.cwd;
    const client = getClient();
    if (!cwd || !client) return;
    const listPath = mentionDir ? `${cwd}/${mentionDir}` : cwd;
    let cancelled = false;
    client
      .fsList(listPath)
      .then((res) => {
        if (!cancelled) setFileEntries(res.entries);
      })
      .catch(() => {
        if (!cancelled) setFileEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionActive, mentionDir, meta?.cwd]);

  const mentionMatches = React.useMemo(() => {
    if (!mentionActive) return [];
    const p = mentionPrefix.toLowerCase();
    return fileEntries
      .filter((e) => e.name.toLowerCase().startsWith(p))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      .slice(0, 50);
  }, [mentionActive, mentionPrefix, fileEntries]);

  const onSelectMention = (entry: FsEntry) => {
    const rel = (mentionDir ? mentionDir + '/' : '') + entry.name;
    // Folder → keep the palette open to drill in; file → complete with a trailing space.
    setText((t) => t.replace(/@[^\s]*$/, '@' + rel + (entry.isDir ? '/' : ' ')));
  };

  // The transcript renders as an INVERTED list (newest at offset 0). Entering a
  // long session lands at the bottom with zero scrolling — there is no
  // progressive scroll-to-end measurement pass, which is what made long chats
  // scroll "for ages" and drop frames.
  const scrollToBottom = React.useCallback((animated = true) => {
    atBottomRef.current = true;
    setShowJump(false);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated }));
  }, []);

  // Keep pinned to the newest message while the user is already at the bottom.
  // On an inverted list this is a no-op when already at offset 0, so it never
  // causes a visible scroll on entry.
  const maybeAutoScroll = React.useCallback(() => {
    if (atBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    }
  }, []);

  const onScroll = React.useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    // Inverted: offset 0 is the bottom (newest); a larger offset means the user
    // has scrolled up into history.
    const atBottom = e.nativeEvent.contentOffset.y < 80;
    atBottomRef.current = atBottom;
    setShowJump((prev) => (prev === !atBottom ? prev : !atBottom));
  }, []);

  // Commands the app handles natively (open a sheet) instead of sending to the engine.
  const interceptCommand = (name: string): boolean => {
    if (name === 'model' || name === 'effort') {
      setModelEffortOpen(true);
      return true;
    }
    if (name === 'context') {
      setInfoSheet({ kind: 'context' });
      return true;
    }
    if (name === 'usage') {
      setInfoSheet({ kind: 'usage' });
      return true;
    }
    return false;
  };

  const onSelectCommand = (cmd: SlashCommandDTO) => {
    if (interceptCommand(cmd.name)) {
      setText('');
      return;
    }
    if (cmd.argumentHint) {
      // Needs arguments — insert and let the user fill them in.
      setText(`/${cmd.name} `);
      return;
    }
    // No-argument command — run it immediately.
    sendMessage(sessionId, `/${cmd.name}`);
    setText('');
    scrollToBottom();
  };

  const onSend = () => {
    const t = text.trim();
    const imgs = pendingImages;
    if (!t && imgs.length === 0) return;
    // Client-driven commands open native UI instead of being sent (text-only, no images).
    if (t && imgs.length === 0) {
      const clientCmd = t.match(/^\/(model|effort|context|usage)\b/);
      if (clientCmd && interceptCommand(clientCmd[1])) {
        setText('');
        return;
      }
    }
    sendMessage(sessionId, t, imgs.length ? imgs.map((i) => ({ mime: i.mime, data: i.data })) : undefined);
    setText('');
    setPendingImages([]);
    scrollToBottom();
  };

  const onPickModel = (value: string) => {
    setModel(sessionId, value);
  };

  const onPickEffort = (value: EffortLevel | null) => {
    setEffort(sessionId, value);
  };

  const cycleMode = () => {
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
    setMode(sessionId, next);
  };

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.6,
        allowsMultipleSelection: true,
        selectionLimit: 4,
      });
      if (res.canceled) return;
      const picked = res.assets
        .filter((a) => a.base64)
        .map((a) => ({ uri: a.uri, mime: a.mimeType || 'image/jpeg', data: a.base64 as string }));
      setPendingImages((prev) => [...prev, ...picked].slice(0, 6));
    } catch {
      /* user dismissed or picker unavailable */
    }
  };

  const removeImage = (idx: number) => setPendingImages((prev) => prev.filter((_, i) => i !== idx));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: meta?.title ?? 'Session' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={headerHeight}>
        <FlatList
          ref={listRef}
          data={invertedItems}
          inverted
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: space.lg, gap: 2 }}
          renderItem={({ item }) => <Item item={item} sessionId={sessionId} />}
          onContentSizeChange={maybeAutoScroll}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={40} color={colors.textFaint} />
              <Text style={styles.emptyText}>Send a message to start working with Claude Code in this folder.</Text>
              <Text style={styles.emptyPath}>{meta?.cwd}</Text>
            </View>
          }
          // Inverted: the header renders at the visual bottom (after the newest
          // message) — exactly where outstanding prompts and the working spinner belong.
          ListHeaderComponent={
            <View>
              {view.permissions.map((p) => (
                <PermissionSheet key={p.requestId} request={p} onRespond={(d, r) => respondPermission(sessionId, p.requestId, d, r)} />
              ))}
              {view.questions.map((q) => (
                <QuestionCards key={q.requestId} request={q} onSubmit={(a) => respondQuestion(sessionId, q.requestId, a)} />
              ))}
              {busy && view.permissions.length === 0 && view.questions.length === 0 ? (
                <View style={styles.working}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.workingText}>{state === 'starting' ? 'Starting…' : 'Claude is working…'}</Text>
                </View>
              ) : null}
            </View>
          }
        />

        {showJump && !paletteOpen && !mentionActive ? (
          <Pressable style={styles.jumpBtn} onPress={() => scrollToBottom(true)} hitSlop={6}>
            <Ionicons name="arrow-down" size={20} color={colors.text} />
          </Pressable>
        ) : null}

        {paletteOpen ? (
          <CommandPalette commands={commands} query={paletteQuery} onSelect={onSelectCommand} />
        ) : mentionActive && mentionMatches.length > 0 ? (
          <FileMentionPalette entries={mentionMatches} onSelect={onSelectMention} />
        ) : null}

        {pendingImages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.previewBar}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.md, alignItems: 'center' }}
          >
            {pendingImages.map((img, i) => (
              <View key={img.uri + i} style={styles.thumb}>
                <Image source={{ uri: img.uri }} style={styles.thumbImg} />
                <Pressable style={styles.thumbX} onPress={() => removeImage(i)} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={colors.onAccent} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.inputBar}>
          <Pressable style={styles.attachBtn} onPress={pickImage} hitSlop={6} disabled={state === 'closed' || state === 'error'}>
            <Ionicons name="image-outline" size={24} color={colors.textDim} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder={busy ? 'Claude is working…  (/ for commands)' : 'Message Claude Code   ·   / for commands'}
            placeholderTextColor={colors.textFaint}
            value={text}
            onChangeText={setText}
            multiline
            editable={state !== 'closed' && state !== 'error'}
          />
          {busy ? (
            <Pressable style={[styles.sendBtn, { backgroundColor: colors.danger }]} onPress={() => interrupt(sessionId)}>
              <Ionicons name="stop" size={20} color={colors.onAccent} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendBtn, !text.trim() && pendingImages.length === 0 && { opacity: 0.4 }]}
              onPress={onSend}
              disabled={!text.trim() && pendingImages.length === 0}
            >
              <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
            </Pressable>
          )}
        </View>

        <View style={styles.toolbar}>
          <Pressable style={styles.toolPill} onPress={() => setModelEffortOpen(true)} hitSlop={6}>
            <Ionicons name="hardware-chip-outline" size={13} color={colors.thinking} />
            <Text style={[styles.toolPillText, { color: colors.thinking }]}>{modelLabel(meta?.model, models)}</Text>
            <Text style={styles.toolSep}>·</Text>
            <Ionicons name="flash-outline" size={12} color={colors.warning} />
            <Text style={[styles.toolPillText, { color: colors.warning }]}>{effortLabel(effort)}</Text>
          </Pressable>
          <Pressable style={styles.toolPill} onPress={cycleMode} hitSlop={6}>
            <Ionicons name="shield-half-outline" size={13} color={colors.accent} />
            <Text style={[styles.toolPillText, { color: colors.accent }]}>{PERMISSION_MODE_LABELS[mode]}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ModelEffortSheet
        visible={modelEffortOpen}
        models={models}
        currentModel={meta?.model}
        currentEffort={effort}
        onSelectModel={onPickModel}
        onSelectEffort={onPickEffort}
        onClose={() => setModelEffortOpen(false)}
      />

      {infoSheet ? (
        <InfoSheet visible kind={infoSheet.kind} sessionId={sessionId} onClose={() => setInfoSheet(null)} />
      ) : null}
    </SafeAreaView>
  );
}

function Item({ item, sessionId }: { item: TranscriptItem; sessionId: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  switch (item.type) {
    case 'user':
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            {item.imageCount ? (
              <View style={styles.userImages}>
                <Ionicons name="image" size={13} color={colors.user} />
                <Text style={styles.userImagesText}>
                  {item.imageCount} image{item.imageCount > 1 ? 's' : ''}
                </Text>
              </View>
            ) : null}
            {item.text ? <Text style={styles.userText}>{item.text}</Text> : null}
          </View>
        </View>
      );
    case 'text':
      return (
        <View style={styles.assistantBlock}>
          <Markdown text={item.text} />
          {item.streaming ? <Text style={styles.caret}>▍</Text> : null}
        </View>
      );
    case 'thinking':
      return <ThinkingBlock text={item.text} streaming={item.streaming} />;
    case 'tool':
      return <ToolCard item={item} />;
    case 'task':
      return (
        <View style={styles.notice}>
          <Ionicons name="git-branch" size={13} color={colors.thinking} />
          <Text style={styles.noticeText}>
            {item.status === 'started' ? 'Subagent started' : 'Subagent finished'}: {item.description}
          </Text>
        </View>
      );
    case 'result':
      if (!item.isError && !item.costUsd) return null;
      return (
        <View style={styles.resultRow}>
          <View style={styles.resultLine} />
          <Text style={styles.resultText}>
            {item.isError ? `⚠ ${item.subtype}` : ''}
            {item.costUsd ? ` $${item.costUsd.toFixed(3)}` : ''}
          </Text>
          <View style={styles.resultLine} />
        </View>
      );
    case 'notice':
      return (
        <View style={styles.notice}>
          <Ionicons
            name={item.level === 'error' ? 'alert-circle' : 'information-circle-outline'}
            size={14}
            color={item.level === 'error' ? colors.danger : colors.textFaint}
          />
          <Text style={[styles.noticeText, item.level === 'error' && { color: colors.danger }]}>{item.text}</Text>
        </View>
      );
    case 'file':
      return <FileCard sessionId={sessionId} item={item} />;
    default:
      return null;
  }
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: space.md },
    emptyText: { color: c.textDim, textAlign: 'center', fontSize: font.size.md, maxWidth: 280 },
    emptyPath: { color: c.textFaint, fontFamily: font.mono, fontSize: font.size.xs },
    userRow: { alignItems: 'flex-end', marginVertical: space.sm },
    userBubble: { backgroundColor: c.userSoft, borderColor: c.user, borderWidth: 1, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingHorizontal: space.md, paddingVertical: space.sm, maxWidth: '88%' },
    userText: { color: c.text, fontSize: font.size.md, lineHeight: 21 },
    assistantBlock: { marginVertical: space.xs },
    caret: { color: c.accent, fontSize: font.size.md },
    notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, paddingHorizontal: space.xs },
    noticeText: { color: c.textFaint, fontSize: font.size.xs, flex: 1 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.sm, opacity: 0.6 },
    resultLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    resultText: { color: c.textFaint, fontSize: font.size.xs },
    working: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
    workingText: { color: c.textDim, fontSize: font.size.sm },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bgElevated },
    input: { flex: 1, color: c.text, fontSize: font.size.md, maxHeight: 140, minHeight: 40, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.md, paddingTop: 10, paddingBottom: 10 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    jumpBtn: { position: 'absolute', right: space.lg, bottom: 76, width: 40, height: 40, borderRadius: 20, backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: c.shadowOpacity, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
    modePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accentSoft, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill },
    modePillText: { color: c.accent, fontSize: font.size.xs, fontWeight: '600' },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm, backgroundColor: c.bgElevated, alignItems: 'center' },
    toolPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
    toolPillText: { fontSize: font.size.xs, fontWeight: '600' },
    toolSep: { color: c.textFaint, fontSize: font.size.xs, marginHorizontal: 1 },
    attachBtn: { alignSelf: 'flex-end', paddingBottom: 7, paddingHorizontal: 2 },
    previewBar: { maxHeight: 76, paddingVertical: space.sm, backgroundColor: c.bgElevated },
    thumb: { width: 60, height: 60, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    thumbImg: { width: '100%', height: '100%' },
    thumbX: { position: 'absolute', top: 1, right: 1, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10 },
    userImages: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    userImagesText: { color: c.user, fontSize: font.size.xs, fontWeight: '600' },
  });
