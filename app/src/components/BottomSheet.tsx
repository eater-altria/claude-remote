import React from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { radius, space, type Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A bottom sheet whose backdrop fades in over the full screen while the sheet
 * surface slides up from the bottom — two independent animations. Modal's
 * built-in `animationType="slide"` slides the whole tree (backdrop included),
 * which made the dim overlay rise up from the bottom instead of fading in.
 *
 * Kept mounted through the exit animation, then unmounted, so closing animates
 * out too.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [mounted, setMounted] = React.useState(visible);
  const screenH = Dimensions.get('window').height;
  const backdrop = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(screenH)).current;
  // Travel distance for the slide — updated to the sheet's real height on layout
  // so the exit animation moves exactly off-screen and no further.
  const sheetH = React.useRef(screenH);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      backdrop.setValue(0);
      translateY.setValue(sheetH.current);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260, mass: 0.9 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: sheetH.current, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) sheetH.current = h;
          }}
        >
          {/* The sheet is a sibling of (and above) the backdrop, so taps here
              never reach it — no tap-swallowing wrapper needed. Using a plain
              View also keeps the gesture free for an inner ScrollView. */}
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.lg,
      paddingBottom: space.xxl,
      borderTopWidth: 1,
      borderColor: c.borderStrong,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: space.md },
  });
