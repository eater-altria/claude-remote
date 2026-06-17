import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { getClient, useStore } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

export interface FileCardItem {
  fileId: string;
  name: string;
  size: number;
  mime: string;
  description?: string;
}

type Status = 'idle' | 'downloading' | 'done' | 'error';

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function iconFor(mime: string, name: string): keyof typeof Ionicons.glyphMap {
  if (mime.startsWith('image/')) return 'image-outline';
  if (mime.startsWith('video/')) return 'videocam-outline';
  if (mime.startsWith('audio/')) return 'musical-notes-outline';
  if (/zip|tar|gzip|x-tar|package-archive/.test(mime) || /\.(zip|tar|gz|tgz|apk)$/i.test(name)) return 'archive-outline';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document-text-outline';
  return 'document-outline';
}

export function FileCard({ sessionId, item }: { sessionId: string; item: FileCardItem }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const token = useStore((s) => s.config?.token);
  const [status, setStatus] = React.useState<Status>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const onDownload = async () => {
    const baseUrl = getClient()?.baseUrl;
    if (!baseUrl || !token) {
      setError('Not connected to a server.');
      setStatus('error');
      return;
    }
    setStatus('downloading');
    setError(null);
    try {
      // Auth via ?token (the server accepts it the same way the WebSocket does),
      // so Android's DownloadManager doesn't need to forward custom headers.
      const url = `${baseUrl}/api/sessions/${sessionId}/files/${item.fileId}?token=${encodeURIComponent(token)}`;
      // The system DownloadManager streams straight to the *public* Downloads
      // folder — no in-memory copy, so large files (APKs etc.) are fine. It
      // also shows a download notification and resolves on completion.
      //
      // `storeInDownloads: true` is what routes the file to the public
      // /storage/emulated/0/Download via MediaStore (Android 10+). Do NOT pass a
      // `path` here: blob-util's `DownloadDir` resolves to the app-PRIVATE
      // sandbox (Android/data/<pkg>/files/Download), which is invisible to the
      // user's file manager and wiped on uninstall.
      await ReactNativeBlobUtil.config({
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: item.name,
          description: item.description || 'Saved from Claude Remote',
          mime: item.mime,
          mediaScannable: true,
          storeInDownloads: true,
        },
      }).fetch('GET', url);
      setStatus('done');
    } catch (e: any) {
      setError(e?.message || 'Download failed');
      setStatus('error');
    }
  };

  return (
    <View style={styles.card}>
      <Ionicons name={iconFor(item.mime, item.name)} size={26} color={colors.accent} style={{ marginRight: space.sm }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          {fmtSize(item.size)}
          {item.description ? `  ·  ${item.description}` : ''}
        </Text>
        {status === 'done' ? <Text style={styles.savedHint}>Saved to Downloads</Text> : null}
        {status === 'error' && error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      {status === 'done' ? (
        <View style={[styles.btn, styles.btnDone]}>
          <Ionicons name="checkmark" size={18} color={colors.success} />
          <Text style={[styles.btnText, { color: colors.success }]}>Saved</Text>
        </View>
      ) : (
        <Pressable
          style={[styles.btn, status === 'downloading' && { opacity: 0.6 }]}
          onPress={onDownload}
          disabled={status === 'downloading'}
          hitSlop={6}
        >
          {status === 'downloading' ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name={status === 'error' ? 'refresh' : 'download-outline'} size={16} color={colors.onAccent} />
              <Text style={styles.btnText}>{status === 'error' ? 'Retry' : 'Download'}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: space.md,
      marginVertical: space.xs,
    },
    name: { color: c.text, fontSize: font.size.md, fontWeight: '600' },
    meta: { color: c.textFaint, fontSize: font.size.xs, marginTop: 2 },
    savedHint: { color: c.success, fontSize: font.size.xs, marginTop: 4 },
    error: { color: c.danger, fontSize: font.size.xs, marginTop: 4 },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginLeft: space.sm,
    },
    btnDone: { backgroundColor: c.successSoft },
    btnText: { color: c.onAccent, fontSize: font.size.sm, fontWeight: '600' },
  });
