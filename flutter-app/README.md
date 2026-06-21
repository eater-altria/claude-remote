# flutter-app — Claude Remote (Flutter client)

A Flutter rewrite of the Expo/React-Native app in [`../app`](../app). Same server,
same wire protocol, broader platform reach (Android, iOS, web, desktop). The two
clients coexist — `/app` is untouched.

## Status

This is a complete source port (protocol, REST/WS clients, state, all screens and
the core components). It has **not** been compiled on this machine — Flutter/Dart
were not installed here. Before first run you must generate the native platform
folders and fetch packages (see Setup). Treat the first `flutter analyze` /
`flutter run` as the real compile gate.

## Setup

```bash
cd flutter-app

# 1. Generate the native scaffolding (android/, ios/, etc.). This is additive —
#    it will NOT overwrite lib/ or pubspec.yaml.
flutter create .

# 2. Fetch packages
flutter pub get

# 3. Run / analyze
flutter analyze
flutter run            # or: flutter build apk
```

The protocol models in `lib/protocol/protocol.gen.dart` are **generated** — see
[`../codegen`](../codegen). Run `cd ../codegen && npm run gen` after any change to
`server/src/protocol.ts`.

### Native permissions to add after `flutter create .`

These native modules need manifest/Info.plist entries (same capabilities the Expo
app declares):

- **camera** (`mobile_scanner`, `image_picker` camera) — Android `CAMERA`,
  iOS `NSCameraUsageDescription`
- **photos** (`image_picker` gallery) — iOS `NSPhotoLibraryUsageDescription`
- **notifications** (`flutter_local_notifications`) — Android 13+
  `POST_NOTIFICATIONS` (requested at runtime in `initNotifications`)
- **network** — Android `INTERNET` (default); for cleartext `http://` LAN servers,
  set `android:usesCleartextTraffic="true"` (or a network-security-config).

## Architecture (maps 1:1 to `/app`)

```
lib/
  protocol/protocol.gen.dart   ★ generated wire types (sealed classes + enums)
  api/
    client.dart      REST + binary upload + ws URL   (← app/src/api/client.ts)
    ws.dart          multiplexed WS, reconnect+reattach (← ws.ts)
    pairing.dart     QR pairing URI parsing            (← pairing.ts)
  state/
    store.dart       ChangeNotifier app state          (← state/store.ts, zustand)
    transcript.dart  WireEvent → TranscriptItem reducer (← transcript.ts)
    notifications.dart  on-device local notifications   (← notifications.ts)
    cwd_history.dart    recent/favorite cwd per server  (← cwdHistory.ts)
  screens/
    sessions_screen.dart    session list + connection status
    session_screen.dart     ★ chat main (transcript, panels, input, sheets)
    new_session_screen.dart fs browser → create session
    settings_screen.dart    servers CRUD, budget, notifications
    scan_screen.dart        QR pairing scanner
  components/
    markdown · diff · tool_card · thinking_block · file_card · image_card
    task_progress · subagent_panel · permission_sheet · question_cards
  theme/  theme.dart · labels.dart
```

### Conventions carried over from `/app`

- **Protocol is generated, never hand-edited.** Source of truth is the server.
- **Permissions / questions** answered over the live WS (`store.respond*`); the
  REST fallbacks exist on `ApiClient` for notification-action use.
- **Notifications are on-device only** — the server broadcasts `alert` over the WS
  and the client raises a local notification. No FCM. The session currently on
  screen is suppressed (`setActiveSession`).
- **File delivery** uses opaque `fileId`s fetched from the authed
  `/api/sessions/:id/files/:fileId` endpoint; **uploads** POST raw bytes to
  `/api/sessions/:id/upload` and fold the returned absolute path into the message.

## State management

`provider`'s `ChangeNotifierProvider<Store>` at the root. Widgets `context.watch`
for reactive reads and `context.read` for actions — the same store shape as the
zustand store, minus React idioms.
