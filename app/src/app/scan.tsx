import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../state/store';
import { ApiClient } from '../api/client';
import { parsePairing, type Pairing } from '../api/pairing';
import { font, radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

type Mode = 'scanning' | 'form' | 'saving';

/**
 * QR pairing scanner. A full server QR (address + token) is saved in one tap; a
 * relay QR (address only) drops into a small form to paste the token. Both run
 * the same test-then-save path as the manual Add server screen.
 */
export default function ScanScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const addServer = useStore((s) => s.addServer);
  const switchServer = useStore((s) => s.switchServer);

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = React.useState<Mode>('scanning');
  const [pairing, setPairing] = React.useState<Pairing | null>(null);
  const [name, setName] = React.useState('');
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  // Guard: onBarcodeScanned fires repeatedly — handle a successful parse once.
  const handledRef = React.useRef(false);
  const lastBadRef = React.useRef(0);

  React.useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const save = React.useCallback(
    async (p: Pairing, label: string, tok: string) => {
      setMode('saving');
      setError(null);
      try {
        const client = new ApiClient({ baseUrl: p.url, token: tok });
        await client.health();
        const created = await addServer({ name: label || p.name || p.url, baseUrl: p.url, token: tok });
        await switchServer(created.id);
        router.back();
      } catch (e: any) {
        setError(e?.message || 'Could not reach the server');
        setMode('form');
      }
    },
    [addServer, switchServer, router],
  );

  const onScanned = React.useCallback(
    ({ data }: { data: string }) => {
      if (handledRef.current) return;
      const p = parsePairing(data);
      if (!p) {
        // Throttle the "not a pairing code" hint so a stray barcode doesn't flap.
        const now = Date.now();
        if (now - lastBadRef.current > 1500) {
          lastBadRef.current = now;
          setError('That QR isn’t a Claude Remote pairing code.');
        }
        return;
      }
      handledRef.current = true;
      setError(null);
      setPairing(p);
      setName(p.name ?? '');
      setToken(p.token ?? '');
      if (p.token) {
        void save(p, p.name ?? '', p.token);
      } else {
        // Relay QR: address only — collect the token.
        setMode('form');
      }
    },
    [save],
  );

  const rescan = () => {
    handledRef.current = false;
    setPairing(null);
    setError(null);
    setToken('');
    setName('');
    setMode('scanning');
  };

  // --- Permission gate ----------------------------------------------------
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={44} color={colors.textFaint} />
        <Text style={styles.gateText}>Camera access is needed to scan a server’s pairing QR.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => requestPermission()}>
          <Text style={styles.primaryBtnText}>Grant camera access</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // --- Token form (relay QR / connection retry) ---------------------------
  if (mode === 'form' || mode === 'saving') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
        <View style={{ padding: space.lg }}>
          <Text style={styles.sectionTitle}>Almost there</Text>
          <Text style={styles.hint}>Scanned {pairing?.url}. Paste the access token printed by the server to finish.</Text>

          <Text style={[styles.label, { marginTop: space.lg }]}>Name</Text>
          <TextInput style={styles.input} placeholder="Home Mac" placeholderTextColor={colors.textFaint} value={name} onChangeText={setName} autoCapitalize="words" />

          <Text style={[styles.label, { marginTop: space.lg }]}>Access token</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste the token from the server logs"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            value={token}
            onChangeText={setToken}
          />

          {error && (
            <View style={[styles.result, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={[styles.resultText, { color: colors.danger }]}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.primaryBtn, (!token.trim() || mode === 'saving') && { opacity: 0.5 }]}
            disabled={!token.trim() || mode === 'saving'}
            onPress={() => pairing && save(pairing, name, token.trim())}
          >
            {mode === 'saving' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryBtnText}>Test & Save</Text>}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={rescan} disabled={mode === 'saving'}>
            <Text style={styles.secondaryText}>Scan again</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- Live camera --------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.reticle} />
        <Text style={styles.overlayText}>{error ?? 'Point at the QR printed by the server'}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
    gateText: { color: c.textDim, fontSize: font.size.md, textAlign: 'center', maxWidth: 300 },

    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.xl },
    reticle: { width: 220, height: 220, borderRadius: radius.lg, borderWidth: 3, borderColor: '#ffffffcc' },
    overlayText: { color: '#fff', fontSize: font.size.md, fontWeight: '600', textAlign: 'center', paddingHorizontal: space.xl, textShadowColor: '#000', textShadowRadius: 6 },

    sectionTitle: { color: c.text, fontSize: font.size.lg, fontWeight: '800' },
    label: { color: c.text, fontSize: font.size.md, fontWeight: '700', marginBottom: space.sm },
    hint: { color: c.textFaint, fontSize: font.size.xs, marginTop: space.xs, lineHeight: 16 },
    input: { backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.md, padding: space.md, fontFamily: font.mono },

    result: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, marginTop: space.lg },
    resultText: { fontSize: font.size.sm, flex: 1 },
    primaryBtn: { backgroundColor: c.accent, padding: space.md, borderRadius: radius.md, alignItems: 'center', marginTop: space.lg },
    primaryBtnText: { color: c.onAccent, fontWeight: '700', fontSize: font.size.md },
    secondaryBtn: { padding: space.md, borderRadius: radius.md, alignItems: 'center', marginTop: space.sm },
    secondaryText: { color: c.textDim, fontWeight: '600', fontSize: font.size.md },
  });
