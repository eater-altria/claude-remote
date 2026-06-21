import '../protocol/protocol.gen.dart';

/// UI labels for permission modes (presentation only — the wire values come from
/// the generated PermissionMode enum). Mirrors PERMISSION_MODE_LABELS in
/// server/src/protocol.ts, which is a UI const (not part of the typed wire
/// schema, so it is not code-generated).
// ignore: constant_identifier_names
const Map<PermissionMode, String> PERMISSION_MODE_LABELS = {
  PermissionMode.default_: 'Ask before acting',
  PermissionMode.acceptEdits: 'Auto-accept edits',
  PermissionMode.bypassPermissions: 'Bypass (YOLO)',
  PermissionMode.plan: 'Plan only',
};
