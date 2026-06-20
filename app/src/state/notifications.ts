import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { getClient } from './store';

/**
 * On-device (local) notification wiring. The server no longer relays through
 * FCM/Expo — instead it broadcasts lightweight `alert` messages over the
 * WebSocket, and the store turns each into a LOCAL notification here. So there
 * is no push credential / EAS setup; the tradeoff is alerts only fire while the
 * app is alive with a live socket (foreground or a short background window).
 *
 * This module owns: foreground display, the Android channel, the "approval"
 * category with Approve / Deny action buttons, presenting local notifications,
 * and the tap / action response handler that resolves prompts over REST (so it
 * works even with no WebSocket connected) or opens the relevant session.
 */

let handlersInstalled = false;
/** The session the user is currently viewing in the foreground (suppresses its own banners). */
let activeSessionId: string | null = null;

// Show notifications even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannelAndCategory(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    }).catch(() => {});
  }
  await Notifications.setNotificationCategoryAsync('approval', [
    { identifier: 'approve', buttonTitle: 'Approve', options: { opensAppToForeground: false } },
    { identifier: 'deny', buttonTitle: 'Deny', options: { opensAppToForeground: false, isDestructive: true } },
  ]).catch(() => {});
}

/** Record which session is on screen so we can skip notifying about it while foregrounded. */
export function setActiveSession(id: string | null): void {
  activeSessionId = id;
}

/** Request notification permission and set up the Android channel + action
 * category. Returns whether notifications are usable. No push token, no server
 * registration — everything is local now. */
export async function registerForNotifications(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    await ensureChannelAndCategory();
    return true;
  } catch {
    return false;
  }
}

export interface LocalAlert {
  sessionId: string;
  kind: string;
  title: string;
  body: string;
  requestId?: string;
  categoryId?: string;
}

/** Present a local notification for a server `alert`. Suppressed when the user
 * is already looking at that session in the foreground (the in-app sheet/cards
 * already surface it, so a banner would just be noise). */
export async function presentLocalNotification(a: LocalAlert): Promise<void> {
  if (AppState.currentState === 'active' && a.sessionId === activeSessionId) return;
  try {
    await ensureChannelAndCategory();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: a.title,
        body: a.body,
        sound: 'default',
        data: { sessionId: a.sessionId, requestId: a.requestId, kind: a.kind },
        ...(a.categoryId ? { categoryIdentifier: a.categoryId } : {}),
      },
      trigger: null, // deliver immediately
    });
  } catch {
    /* ignore */
  }
}

/** Install the tap / action-button response handler exactly once. */
export function installNotificationHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as {
      sessionId?: string;
      requestId?: string;
      kind?: string;
    };
    const action = resp.actionIdentifier;
    const client = getClient();

    if (data?.kind === 'permission' && data.sessionId && data.requestId && (action === 'approve' || action === 'deny')) {
      client?.respondPermissionRest(data.sessionId, data.requestId, action === 'approve' ? 'allow' : 'deny').catch(() => {});
      return;
    }

    // Any other tap (including the question/done notifications) opens the session.
    if (data?.sessionId) {
      router.push(`/session/${data.sessionId}`);
    }
  });
}
