import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getClient, useStore } from '../state/store';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

export interface ImageCardItem {
  fileId: string;
  name: string;
  size: number;
  mime: string;
  caption?: string;
}

export function ImageCard({ sessionId, item }: { sessionId: string; item: ImageCardItem }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const token = useStore((s) => s.config?.token);
  const baseUrl = getClient()?.baseUrl;
  const [aspect, setAspect] = React.useState(4 / 3);
  const [failed, setFailed] = React.useState(false);
  const [full, setFull] = React.useState(false);

  const uri = baseUrl && token ? `${baseUrl}/api/sessions/${sessionId}/files/${item.fileId}` : undefined;
  const source = uri ? { uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined } : undefined;

  const onLoad = (e: ImageLoadEventData) => {
    const { width, height } = e.source;
    if (width > 0 && height > 0) setAspect(width / height);
  };

  if (!source || failed) {
    return (
      <View style={styles.fallback}>
        <Ionicons name="image-outline" size={18} color={colors.textFaint} />
        <Text style={styles.fallbackText} numberOfLines={1}>
          {failed ? `Couldn't load ${item.name}` : 'Not connected'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setFull(true)}>
        <Image
          source={source}
          // Clamp very tall images in the inline preview; the full view shows all of it.
          style={[styles.inline, { aspectRatio: Math.max(aspect, 0.7) }]}
          contentFit="cover"
          transition={150}
          onLoad={onLoad}
          onError={() => setFailed(true)}
          accessibilityLabel={item.caption || item.name}
        />
      </Pressable>
      {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}

      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <Pressable style={styles.fullBackdrop} onPress={() => setFull(false)}>
          <Image source={source} style={styles.fullImage} contentFit="contain" transition={120} />
          <Pressable style={styles.closeBtn} onPress={() => setFull(false)} hitSlop={10}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { marginVertical: space.xs, maxWidth: 420 },
    inline: {
      width: '100%',
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    caption: { color: c.textDim, fontSize: font.size.sm, marginTop: space.xs, lineHeight: 19 },
    fallback: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: space.md,
      marginVertical: space.xs,
    },
    fallbackText: { color: c.textFaint, fontSize: font.size.sm, flex: 1 },
    fullBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
    fullImage: { width: '100%', height: '100%' },
    closeBtn: {
      position: 'absolute',
      top: 48,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
