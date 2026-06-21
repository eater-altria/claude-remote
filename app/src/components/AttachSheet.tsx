import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet } from './BottomSheet';

/**
 * Attachment menu shown when tapping the input bar's attach button: take a photo,
 * pick an image from the library, or pick an arbitrary file. The sheet closes
 * before the chosen native picker launches (Android dislikes opening a picker
 * while a Modal is still up), so each row just calls back — the parent handles
 * the close + launch sequencing.
 */
export function AttachSheet({
  visible,
  onClose,
  onCamera,
  onImage,
  onFile,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onImage: () => void;
  onFile: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: 'camera-outline', label: 'Take photo', onPress: onCamera },
    { icon: 'image-outline', label: 'Upload image', onPress: onImage },
    { icon: 'document-attach-outline', label: 'Upload file', onPress: onFile },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Add attachment</Text>
      {rows.map((r) => (
        <Pressable key={r.label} style={styles.row} onPress={r.onPress} android_ripple={{ color: colors.cardAlt }}>
          <View style={styles.iconWrap}>
            <Ionicons name={r.icon} size={20} color={colors.accent} />
          </View>
          <Text style={styles.rowText}>{r.label}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    title: { color: c.textDim, fontSize: font.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm, paddingHorizontal: space.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.md },
    iconWrap: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    rowText: { color: c.text, fontSize: font.size.md, fontWeight: '600' },
  });
