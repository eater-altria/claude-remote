import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/client.dart';
import '../api/ws.dart';
import '../protocol/protocol.gen.dart';
import 'notifications.dart';
import 'transcript.dart';

const _serversKey = 'claude-remote.servers.v1';
const _legacyConfigKey = 'claude-remote.config.v1';
const _seenKey = 'claude-remote.seen.v1';
const _usageKey = 'claude-remote.usage.v1';
const _budgetKey = 'claude-remote.budget.v1';
const _notifKey = 'claude-remote.notifications.v1';

String _dayKey([DateTime? d]) => (d ?? DateTime.now()).toIso8601String().substring(0, 10);

String _makeId() {
  final t = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  final r = (math.Random().nextDouble() * 0xfffffff).toInt().toRadixString(36);
  return 'srv-$t-$r';
}

/// Per-session reactive view (transcript + pending requests + panels).
class SessionView {
  List<TranscriptItem> items;
  List<PermissionRequest> permissions;
  List<QuestionRequest> questions;
  List<TodoItem> todos;
  List<SubagentItem> subagents;
  SessionMeta? meta;
  Capabilities? capabilities;

  SessionView({
    List<TranscriptItem>? items,
    List<PermissionRequest>? permissions,
    List<QuestionRequest>? questions,
    List<TodoItem>? todos,
    List<SubagentItem>? subagents,
    this.meta,
    this.capabilities,
  })  : items = items ?? [],
        permissions = permissions ?? [],
        questions = questions ?? [],
        todos = todos ?? [],
        subagents = subagents ?? [];
}

class Store extends ChangeNotifier {
  // ---- reactive state ----
  ServerConfig? config;
  List<ServerProfile> servers = [];
  String? activeId;
  bool configLoaded = false;
  WsStatus wsStatus = WsStatus.idle;
  List<SessionMeta> sessions = [];
  final Map<String, SessionView> views = {};
  Capabilities? capabilities;
  Map<String, int> lastSeen = {};
  Map<String, double> spendByDay = {};
  double? dailyBudgetUsd;
  bool notificationsEnabled = true;

  // ---- non-reactive singletons ----
  ApiClient? _client;
  WsConnection? _ws;
  ApiClient? get client => _client;

  Map<String, double> _costSeen = {};
  int _infoReqCounter = 0;
  final Map<String, _PendingInfo> _pendingInfo = {};

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  SessionView _ensureView(String id) => views.putIfAbsent(id, () => SessionView());

  Future<void> _persistServers() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(
      _serversKey,
      jsonEncode({'servers': servers.map((s) => s.toJson()).toList(), 'activeId': activeId}),
    );
  }

  void _accumulateCosts(List<SessionMeta> list) {
    final day = _dayKey();
    var changed = false;
    for (final s in list) {
      final cur = (s.totalCostUsd ?? 0).toDouble();
      final prev = _costSeen[s.id];
      if (prev == null) {
        _costSeen[s.id] = cur;
        changed = true;
        continue;
      }
      if (cur > prev) {
        spendByDay[day] = (spendByDay[day] ?? 0) + (cur - prev);
        _costSeen[s.id] = cur;
        changed = true;
      }
    }
    if (changed) {
      SharedPreferences.getInstance().then((sp) =>
          sp.setString(_usageKey, jsonEncode({'spendByDay': spendByDay, 'costSeen': _costSeen})));
      notifyListeners();
    }
  }

  /// Tear down any live connection and open a fresh one to [cfg] (or none).
  void _connect(ServerConfig? cfg) {
    _ws?.stop();
    _ws = null;
    _client = null;
    if (cfg != null) {
      _client = ApiClient(cfg);
      _ws = WsConnection(_client!.wsUrl())
        ..onStatus = (s) {
          wsStatus = s;
          notifyListeners();
        }
        ..onMessage = onMessage
        ..start();
      config = cfg;
      wsStatus = WsStatus.idle;
      // Pull the session list immediately over REST so the home screen isn't
      // empty until the first manual refresh (the WS only pushes deltas).
      refreshSessions().catchError((_) {});
    } else {
      config = null;
      wsStatus = WsStatus.idle;
    }
    notifyListeners();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  Future<void> loadConfig() async {
    final sp = await SharedPreferences.getInstance();
    try {
      final seenRaw = sp.getString(_seenKey);
      if (seenRaw != null) {
        lastSeen = (jsonDecode(seenRaw) as Map).map((k, v) => MapEntry(k as String, (v as num).toInt()));
      }
      final usageRaw = sp.getString(_usageKey);
      if (usageRaw != null) {
        final parsed = jsonDecode(usageRaw) as Map<String, dynamic>;
        spendByDay = ((parsed['spendByDay'] ?? {}) as Map)
            .map((k, v) => MapEntry(k as String, (v as num).toDouble()));
        _costSeen = ((parsed['costSeen'] ?? {}) as Map)
            .map((k, v) => MapEntry(k as String, (v as num).toDouble()));
      }
      final budgetRaw = sp.getString(_budgetKey);
      if (budgetRaw != null) dailyBudgetUsd = (jsonDecode(budgetRaw) as num?)?.toDouble();
      final notifRaw = sp.getString(_notifKey);
      if (notifRaw != null) notificationsEnabled = jsonDecode(notifRaw) as bool;
    } catch (_) {/* ignore */}

    try {
      final raw = sp.getString(_serversKey);
      if (raw != null) {
        final parsed = jsonDecode(raw) as Map<String, dynamic>;
        servers = ((parsed['servers'] ?? []) as List)
            .map((e) => ServerProfile.fromJson(e as Map<String, dynamic>))
            .toList();
        final pa = parsed['activeId'] as String?;
        activeId = (pa != null && servers.any((s) => s.id == pa))
            ? pa
            : (servers.isNotEmpty ? servers.first.id : null);
        final active = servers.where((s) => s.id == activeId).firstOrNull;
        _connect(active?.config);
        return;
      }

      // Migrate the legacy single-server config.
      final legacy = sp.getString(_legacyConfigKey);
      if (legacy != null) {
        final cfg = jsonDecode(legacy) as Map<String, dynamic>;
        final profile = ServerProfile(
            id: _makeId(), name: 'My server', baseUrl: cfg['baseUrl'] as String, token: cfg['token'] as String);
        servers = [profile];
        activeId = profile.id;
        await _persistServers();
        await sp.remove(_legacyConfigKey);
        _connect(profile.config);
      }
    } catch (_) {/* ignore */} finally {
      configLoaded = true;
      notifyListeners();
    }
  }

  Future<ServerProfile> addServer({required String name, required String baseUrl, required String token}) async {
    final profile = ServerProfile(
      id: _makeId(),
      name: name.trim().isEmpty ? baseUrl.trim() : name.trim(),
      baseUrl: baseUrl.trim(),
      token: token.trim(),
    );
    final first = servers.isEmpty;
    servers = [...servers, profile];
    await _persistServers();
    notifyListeners();
    if (first) await switchServer(profile.id);
    return profile;
  }

  Future<void> updateServer(String id, {String? name, String? baseUrl, String? token}) async {
    servers = servers.map((s) {
      if (s.id != id) return s;
      return s.copyWith(
        name: name != null ? (name.trim().isEmpty ? s.name : name.trim()) : null,
        baseUrl: baseUrl?.trim(),
        token: token?.trim(),
      );
    }).toList();
    await _persistServers();
    notifyListeners();
    if (activeId == id) {
      final active = servers.where((s) => s.id == id).firstOrNull;
      if (active != null) _connect(active.config);
    }
  }

  Future<void> removeServer(String id) async {
    final wasActive = activeId == id;
    final remaining = servers.where((s) => s.id != id).toList();
    final nextActive = wasActive ? (remaining.firstOrNull?.id) : activeId;
    servers = remaining;
    activeId = nextActive;
    await _persistServers();
    if (wasActive) {
      sessions = [];
      views.clear();
      final active = remaining.where((s) => s.id == nextActive).firstOrNull;
      _connect(active?.config);
    } else {
      notifyListeners();
    }
  }

  Future<void> switchServer(String id) async {
    final target = servers.where((s) => s.id == id).firstOrNull;
    if (target == null || activeId == id) return;
    activeId = id;
    sessions = [];
    views.clear();
    await _persistServers();
    _connect(target.config);
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  Future<void> refreshSessions() async {
    final c = _client;
    if (c == null) return;
    sessions = await c.listSessions();
    _accumulateCosts(sessions);
    notifyListeners();
  }

  Future<SessionMeta> createSession(String cwd,
      {String? title, String? model, PermissionMode? permissionMode}) async {
    final c = _client;
    if (c == null) throw StateError('Not connected');
    final session = await c.createSession(CreateSessionRequest(
      cwd: cwd,
      title: title,
      model: model,
      permissionMode: permissionMode,
    ));
    sessions = [session, ...sessions.where((x) => x.id != session.id)];
    notifyListeners();
    return session;
  }

  Future<void> deleteSession(String id) async {
    final c = _client;
    if (c == null) return;
    await c.deleteSession(id);
    _ws?.detach(id);
    sessions = sessions.where((x) => x.id != id).toList();
    views.remove(id);
    notifyListeners();
  }

  void markSeen(String id) {
    lastSeen = {...lastSeen, id: DateTime.now().millisecondsSinceEpoch};
    SharedPreferences.getInstance().then((sp) => sp.setString(_seenKey, jsonEncode(lastSeen)));
    notifyListeners();
  }

  void setDailyBudget(double? usd) {
    dailyBudgetUsd = usd;
    SharedPreferences.getInstance().then((sp) => sp.setString(_budgetKey, jsonEncode(usd)));
    notifyListeners();
  }

  void setNotificationsEnabled(bool on) {
    notificationsEnabled = on;
    SharedPreferences.getInstance().then((sp) => sp.setString(_notifKey, jsonEncode(on)));
    notifyListeners();
  }

  // -------------------------------------------------------------------------
  // Per-session live actions
  // -------------------------------------------------------------------------
  void openSession(String id) {
    _ensureView(id);
    markSeen(id);
    setActiveSession(id);
    _ws?.attach(id);
  }

  void closeSession(String id) {
    markSeen(id);
    setActiveSession(null);
    _ws?.detach(id);
  }

  void sendMessage(String id, String text, {List<ClientUserMessageImages>? images}) {
    _ws?.send(ClientUserMessage(sessionId: id, text: text, images: images));
  }

  void respondPermission(String id, String requestId, PermissionDecision decision, bool remember) {
    _ws?.send(ClientPermissionResponse(
        sessionId: id, requestId: requestId, decision: decision, remember: remember));
    final v = _ensureView(id);
    v.permissions = v.permissions.where((p) => p.requestId != requestId).toList();
    notifyListeners();
  }

  void respondQuestion(String id, String requestId, QuestionAnswer answer) {
    _ws?.send(ClientQuestionResponse(sessionId: id, requestId: requestId, answer: answer));
    final v = _ensureView(id);
    v.questions = v.questions.where((q) => q.requestId != requestId).toList();
    notifyListeners();
  }

  void interrupt(String id) => _ws?.send(ClientInterrupt(sessionId: id));

  void setMode(String id, PermissionMode mode) {
    _ws?.send(ClientSetPermissionMode(sessionId: id, mode: mode));
    final v = views[id];
    if (v?.meta != null) v!.meta = _copyMeta(v.meta!, permissionMode: mode);
    notifyListeners();
  }

  void setModel(String id, String? model) {
    _ws?.send(ClientSetModel(sessionId: id, model: model));
    final v = views[id];
    if (v?.meta != null) v!.meta = _copyMeta(v.meta!, model: model, modelSet: true);
    notifyListeners();
  }

  void setEffort(String id, EffortLevel? effort) {
    _ws?.send(ClientSetEffort(sessionId: id, effort: effort));
    final v = views[id];
    if (v?.meta != null) v!.meta = _copyMeta(v.meta!, effort: effort, effortSet: true);
    notifyListeners();
  }

  Future<ContextUsageDTO> requestContext(String id) async =>
      await _requestInfo(id, 'context') as ContextUsageDTO;
  Future<UsageDTO> requestUsage(String id) async => await _requestInfo(id, 'usage') as UsageDTO;

  Future<Object?> _requestInfo(String sessionId, String kind) {
    final ws = _ws;
    if (ws == null) return Future.error(StateError('Not connected'));
    final requestId = 'info-${++_infoReqCounter}';
    final completer = Completer<Object?>();
    final timer = Timer(const Duration(seconds: 20), () {
      _pendingInfo.remove(requestId);
      if (!completer.isCompleted) completer.completeError(TimeoutException('Request timed out'));
    });
    _pendingInfo[requestId] = _PendingInfo(completer, timer);
    final sent = ws.send(kind == 'context'
        ? ClientGetContext(sessionId: sessionId, requestId: requestId)
        : ClientGetUsage(sessionId: sessionId, requestId: requestId));
    if (!sent) {
      timer.cancel();
      _pendingInfo.remove(requestId);
      completer.completeError(StateError('Not connected'));
    }
    return completer.future;
  }

  // -------------------------------------------------------------------------
  // Incoming server messages
  // -------------------------------------------------------------------------
  void onMessage(ServerMessage msg) {
    switch (msg) {
      case ServerBacklog():
        final v = _ensureView(msg.sessionId);
        v.items = reduceEvents(msg.events);
        v.todos = latestTodos(msg.events);
        v.subagents = latestSubagents(msg.events);
        v.meta = msg.meta;

      case ServerEvent():
        final v = _ensureView(msg.sessionId);
        final ev = msg.event;
        if (ev is WireTodos) {
          v.todos = ev.items;
        } else if (ev is WireSubagents) {
          v.subagents = ev.items;
        } else {
          applyEvent(v.items, ev);
        }

      case ServerAttached():
        _ensureView(msg.sessionId).meta = msg.meta;
        _upsertSession(msg.meta);
        _accumulateCosts([msg.meta]);

      case ServerSessionState():
        _ensureView(msg.sessionId).meta = msg.meta;
        _upsertSession(msg.meta);
        _accumulateCosts([msg.meta]);

      case ServerCapabilities():
        _ensureView(msg.sessionId).capabilities = msg.capabilities;
        capabilities = msg.capabilities;

      case ServerAlert():
        if (notificationsEnabled) {
          presentLocalNotification(
            sessionId: msg.sessionId,
            kind: msg.kind,
            title: msg.title,
            body: msg.body,
            requestId: msg.requestId,
            categoryId: msg.categoryId,
          );
        }

      case ServerTranscriptReset():
        views[msg.sessionId] = SessionView(meta: msg.meta);

      case ServerPermissionRequest():
        final v = _ensureView(msg.sessionId);
        if (!v.permissions.any((p) => p.requestId == msg.request.requestId)) {
          v.permissions = [...v.permissions, msg.request];
        }

      case ServerPermissionResolved():
        final v = _ensureView(msg.sessionId);
        v.permissions = v.permissions.where((p) => p.requestId != msg.requestId).toList();

      case ServerQuestionRequest():
        final v = _ensureView(msg.sessionId);
        if (!v.questions.any((q) => q.requestId == msg.request.requestId)) {
          v.questions = [...v.questions, msg.request];
        }

      case ServerQuestionResolved():
        final v = _ensureView(msg.sessionId);
        v.questions = v.questions.where((q) => q.requestId != msg.requestId).toList();

      case ServerInfoResult():
        final p = _pendingInfo.remove(msg.requestId);
        if (p != null) {
          p.timer.cancel();
          if (!p.completer.isCompleted) {
            if (msg.ok) {
              p.completer.complete(msg.kind == 'context' ? msg.context : msg.usage);
            } else {
              p.completer.completeError(StateError(msg.error ?? 'Request failed'));
            }
          }
        }

      case ServerError():
        final sid = msg.sessionId;
        if (sid != null) {
          final v = _ensureView(sid);
          v.items.add(NoticeItem(
            id: 'err-${DateTime.now().millisecondsSinceEpoch}',
            level: 'error',
            text: msg.message,
            ts: DateTime.now().millisecondsSinceEpoch,
          ));
        }

      case ServerHello():
      case ServerPong():
        break;
    }
    notifyListeners();
  }

  void _upsertSession(SessionMeta meta) {
    if (sessions.any((x) => x.id == meta.id)) {
      sessions = sessions.map((x) => x.id == meta.id ? meta : x).toList();
    } else {
      sessions = [meta, ...sessions];
    }
  }

  // -------------------------------------------------------------------------
  // Derived selectors
  // -------------------------------------------------------------------------
  double get todaySpend => spendByDay[_dayKey()] ?? 0;

  bool isUnread(SessionMeta s) {
    final seen = lastSeen[s.id] ?? 0;
    return s.updatedAt > seen;
  }
}

class _PendingInfo {
  final Completer<Object?> completer;
  final Timer timer;
  _PendingInfo(this.completer, this.timer);
}

/// Re-create a SessionMeta with a few fields patched (optimistic updates).
SessionMeta _copyMeta(
  SessionMeta m, {
  PermissionMode? permissionMode,
  String? model,
  bool modelSet = false,
  EffortLevel? effort,
  bool effortSet = false,
}) =>
    SessionMeta(
      id: m.id,
      cwd: m.cwd,
      title: m.title,
      model: modelSet ? model : m.model,
      permissionMode: permissionMode ?? m.permissionMode,
      effort: effortSet ? effort : m.effort,
      state: m.state,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      live: m.live,
      lastError: m.lastError,
      totalCostUsd: m.totalCostUsd,
    );
