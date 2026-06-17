import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoryColor, categoryIcon, font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Diff } from './Diff';
import type { PermissionDecision, PermissionRequest } from '../api/protocol';

export function PermissionSheet({
  request,
  onRespond,
}: {
  request: PermissionRequest;
  onRespond: (decision: PermissionDecision, remember: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [remember, setRemember] = React.useState(false);
  const color = categoryColor(request.category, colors);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
          <Ionicons name={categoryIcon(request.category) as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{request.title}</Text>
          <Text style={styles.subtitle}>Claude wants permission to continue</Text>
        </View>
      </View>

      {request.fileChange ? (
        <Diff fileChange={request.fileChange} maxRows={40} />
      ) : (
        <View style={styles.detailBox}>
          <Text style={styles.detail} selectable numberOfLines={8}>
            {request.detail}
          </Text>
        </View>
      )}

      <View style={styles.rememberRow}>
        <Switch
          value={remember}
          onValueChange={setRemember}
          trackColor={{ true: colors.accentDim, false: colors.border }}
          thumbColor={remember ? colors.accent : '#888'}
        />
        <Text style={styles.rememberText}>Always allow “{request.toolName}” this session</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.deny]} onPress={() => onRespond('deny', false)}>
          <Ionicons name="close" size={18} color={colors.danger} />
          <Text style={[styles.btnText, { color: colors.danger }]}>Deny</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.allow]} onPress={() => onRespond('allow', remember)}>
          <Ionicons name="checkmark" size={18} color={colors.onAccent} />
          <Text style={[styles.btnText, { color: colors.onAccent }]}>Allow</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: c.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, padding: space.lg, marginVertical: space.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
    iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontSize: font.size.lg, fontWeight: '700' },
    subtitle: { color: c.textDim, fontSize: font.size.sm, marginTop: 1 },
    detailBox: { backgroundColor: c.codeBg, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: c.border },
    detail: { color: c.codeText, fontFamily: font.mono, fontSize: font.size.sm, lineHeight: 19 },
    rememberRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
    rememberText: { color: c.textDim, fontSize: font.size.sm, flex: 1 },
    actions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
    btn: { flex: 1, flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: space.md, borderRadius: radius.md },
    deny: { backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger },
    allow: { backgroundColor: c.accent },
    btnText: { fontSize: font.size.md, fontWeight: '700' },
  });
