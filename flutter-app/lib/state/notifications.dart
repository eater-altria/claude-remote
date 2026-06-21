import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// On-device local notifications (mirrors app/src/state/notifications.ts).
///
/// The server has no FCM/remote push — it broadcasts `alert` messages over the
/// live WebSocket and the client turns each into a local notification. This only
/// fires while the app process is alive and the WS is connected (foreground or a
/// short background window) — the inherent trade-off of dropping FCM.
final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();

/// The session currently on screen — suppress its banners (already being viewed).
String? _activeSessionId;
bool _initialized = false;

/// Callback the app wires up so tapping a notification can route to a session.
void Function(String sessionId)? onNotificationTapSession;

void setActiveSession(String? id) => _activeSessionId = id;

Future<void> initNotifications() async {
  if (_initialized) return;
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  const ios = DarwinInitializationSettings();
  await _plugin.initialize(
    const InitializationSettings(android: android, iOS: ios),
    onDidReceiveNotificationResponse: (resp) {
      final sid = resp.payload;
      if (sid != null && sid.isNotEmpty) onNotificationTapSession?.call(sid);
    },
  );

  // Android 13+ runtime permission + channel.
  final androidImpl =
      _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  await androidImpl?.requestNotificationsPermission();
  await androidImpl?.createNotificationChannel(const AndroidNotificationChannel(
    'claude-remote',
    'Claude Remote',
    description: 'Approvals, questions, and turn-completion alerts',
    importance: Importance.high,
  ));

  _initialized = true;
}

int _idCounter = 1000;

Future<void> presentLocalNotification({
  required String sessionId,
  required String kind, // permission | question | done
  required String title,
  required String body,
  String? requestId,
  String? categoryId,
}) async {
  // Don't double-buzz for the session already on screen.
  if (sessionId == _activeSessionId) return;
  if (!_initialized) {
    try {
      await initNotifications();
    } catch (e) {
      debugPrint('notif init failed: $e');
      return;
    }
  }

  final android = AndroidNotificationDetails(
    'claude-remote',
    'Claude Remote',
    importance: Importance.high,
    priority: Priority.high,
    category: kind == 'permission' ? AndroidNotificationCategory.call : null,
  );
  final details = NotificationDetails(android: android, iOS: const DarwinNotificationDetails());

  await _plugin.show(_idCounter++, title, body, details, payload: sessionId);
}
