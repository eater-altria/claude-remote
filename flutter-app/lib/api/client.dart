import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../protocol/protocol.gen.dart';

/// Connection config for a single server.
class ServerConfig {
  /// e.g. http://192.168.1.20:8787
  final String baseUrl;
  final String token;
  const ServerConfig({required this.baseUrl, required this.token});
}

/// A saved server the user can quick-switch between.
class ServerProfile {
  final String id;
  final String name;
  final String baseUrl;
  final String token;
  const ServerProfile({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.token,
  });

  ServerConfig get config => ServerConfig(baseUrl: baseUrl, token: token);

  ServerProfile copyWith({String? name, String? baseUrl, String? token}) => ServerProfile(
        id: id,
        name: name ?? this.name,
        baseUrl: baseUrl ?? this.baseUrl,
        token: token ?? this.token,
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'baseUrl': baseUrl, 'token': token};
  factory ServerProfile.fromJson(Map<String, dynamic> j) => ServerProfile(
        id: j['id'] as String,
        name: j['name'] as String,
        baseUrl: j['baseUrl'] as String,
        token: j['token'] as String,
      );
}

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
  @override
  String toString() => 'ApiError($status): $message';
}

String normalizeBase(String url) {
  var u = url.trim();
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(u)) u = 'http://$u';
  return u.replaceAll(RegExp(r'/+$'), '');
}

/// Mirrors app/src/api/client.ts. REST surface + binary upload + ws URL builder.
class ApiClient {
  final ServerConfig cfg;
  ApiClient(this.cfg);

  String get baseUrl => normalizeBase(cfg.baseUrl);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${cfg.token}',
      };

  Future<T> _req<T>(
    String path, {
    String method = 'GET',
    Object? body,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    try {
      final req = http.Request(method, uri)..headers.addAll(_headers);
      if (body != null) req.body = jsonEncode(body);
      final streamed = await req.send().timeout(timeout);
      final res = await http.Response.fromStream(streamed);
      final text = res.body;
      final parsed = text.isNotEmpty ? jsonDecode(text) : <String, dynamic>{};
      if (res.statusCode < 200 || res.statusCode >= 300) {
        final msg = (parsed is Map ? parsed['error'] : null) ?? 'HTTP ${res.statusCode}';
        throw ApiError(res.statusCode, msg as String);
      }
      return parsed as T;
    } on ApiError {
      rethrow;
    } on TimeoutException {
      throw ApiError(0, 'Request timed out');
    } catch (e) {
      throw ApiError(0, e.toString());
    }
  }

  Future<HealthResponse> health() async =>
      HealthResponse.fromJson(await _req('/api/health', timeout: const Duration(seconds: 8)));

  Future<List<SessionMeta>> listSessions() async {
    final j = await _req<Map<String, dynamic>>('/api/sessions');
    return (j['sessions'] as List).map((e) => SessionMeta.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SessionMeta> createSession(CreateSessionRequest body) async {
    final j = await _req<Map<String, dynamic>>('/api/sessions',
        method: 'POST', body: body.toJson(), timeout: const Duration(seconds: 30));
    return SessionMeta.fromJson(j['session'] as Map<String, dynamic>);
  }

  Future<SessionMeta> getSession(String id) async {
    final j = await _req<Map<String, dynamic>>('/api/sessions/$id');
    return SessionMeta.fromJson(j['session'] as Map<String, dynamic>);
  }

  Future<({List<WireEvent> events, SessionMeta session})> getMessages(String id) async {
    final j = await _req<Map<String, dynamic>>('/api/sessions/$id/messages');
    return (
      events: (j['events'] as List).map((e) => WireEvent.fromJson(e as Map<String, dynamic>)).toList(),
      session: SessionMeta.fromJson(j['session'] as Map<String, dynamic>),
    );
  }

  Future<void> deleteSession(String id) =>
      _req('/api/sessions/$id', method: 'DELETE');

  Future<GitStatusDTO> gitStatus(String id) async {
    final j = await _req<Map<String, dynamic>>('/api/sessions/$id/git',
        timeout: const Duration(seconds: 12));
    return GitStatusDTO.fromJson(j['git'] as Map<String, dynamic>);
  }

  Future<String> gitDiff(String id, String filePath) async {
    final j = await _req<Map<String, dynamic>>(
        '/api/sessions/$id/git/diff?path=${Uri.encodeComponent(filePath)}',
        timeout: const Duration(seconds: 12));
    return j['diff'] as String;
  }

  Future<void> respondPermissionRest(String id, String requestId, PermissionDecision decision,
          {bool remember = false}) =>
      _req('/api/sessions/$id/permission',
          method: 'POST',
          body: {'requestId': requestId, 'decision': decision.wire, 'remember': remember});

  Future<void> respondQuestionRest(String id, String requestId, QuestionAnswer answer) =>
      _req('/api/sessions/$id/question',
          method: 'POST', body: {'requestId': requestId, 'answer': answer.toJson()});

  Future<List<FsRoot>> fsRoots() async {
    final j = await _req<Map<String, dynamic>>('/api/fs/roots');
    return (j['roots'] as List).map((e) => FsRoot.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<FsListResponse> fsList(String path, {bool hidden = false}) async {
    final q = '/api/fs/list?path=${Uri.encodeComponent(path)}${hidden ? '&hidden=1' : ''}';
    return FsListResponse.fromJson(await _req(q));
  }

  Future<String> fsMkdir(String parent, String name) async {
    final j = await _req<Map<String, dynamic>>('/api/fs/mkdir',
        method: 'POST', body: {'parent': parent, 'name': name});
    return j['path'] as String;
  }

  /// Upload a picked file's raw bytes to the host. Returns the absolute path the
  /// server saved it to, which the message then references so the agent can Read it.
  Future<({String path, String name, int size})> uploadFile(
    String sessionId,
    File file, {
    required String name,
    required String mime,
  }) async {
    final uri = Uri.parse('$baseUrl/api/sessions/${Uri.encodeComponent(sessionId)}/upload'
        '?name=${Uri.encodeComponent(name)}&mime=${Uri.encodeComponent(mime)}');
    final bytes = await file.readAsBytes();
    final res = await http.post(uri, headers: {
      'Authorization': 'Bearer ${cfg.token}',
      'Content-Type': mime.isEmpty ? 'application/octet-stream' : mime,
    }, body: bytes);
    Map<String, dynamic> body = {};
    try {
      if (res.body.isNotEmpty) body = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {/* non-JSON */}
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiError(res.statusCode, (body['error'] as String?) ?? 'HTTP ${res.statusCode}');
    }
    return (path: body['path'] as String, name: body['name'] as String, size: body['size'] as int);
  }

  String wsUrl() {
    final base = baseUrl.replaceFirst(RegExp(r'^http', caseSensitive: false), 'ws');
    return '$base/ws?token=${Uri.encodeComponent(cfg.token)}';
  }
}
