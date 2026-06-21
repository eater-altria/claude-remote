import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as ws_status;

import '../protocol/protocol.gen.dart';

enum WsStatus { idle, connecting, open, closed }

/// Single multiplexed WebSocket to the server with automatic reconnect.
/// Re-attaches to all subscribed sessions whenever the socket reopens.
/// Mirrors app/src/api/ws.ts.
class WsConnection {
  WsConnection(this._url);

  String _url;
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  WsStatus _status = WsStatus.idle;
  int _reconnectAttempts = 0;
  bool _shouldRun = false;
  Timer? _heartbeat;
  Timer? _reconnectTimer;

  final Set<String> _subscriptions = {};

  void Function(ServerMessage msg) onMessage = (_) {};
  void Function(WsStatus status) onStatus = (_) {};

  void setUrl(String url) {
    if (url == _url) return;
    _url = url;
    if (_shouldRun) {
      stop();
      start();
    }
  }

  void start() {
    _shouldRun = true;
    _connect();
  }

  void stop() {
    _shouldRun = false;
    _reconnectTimer?.cancel();
    _heartbeat?.cancel();
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close(ws_status.normalClosure);
    } catch (_) {/* ignore */}
    _channel = null;
    _setStatus(WsStatus.closed);
  }

  void _setStatus(WsStatus s) {
    if (_status == s) return;
    _status = s;
    onStatus(s);
  }

  void _connect() {
    if (!_shouldRun) return;
    _setStatus(WsStatus.connecting);
    WebSocketChannel channel;
    try {
      channel = WebSocketChannel.connect(Uri.parse(_url));
    } catch (_) {
      _scheduleReconnect();
      return;
    }
    _channel = channel;

    channel.ready.then((_) {
      if (_channel != channel) return; // superseded
      _reconnectAttempts = 0;
      _setStatus(WsStatus.open);
      // Re-attach to everything we were watching.
      for (final id in _subscriptions) {
        _rawSend(ClientAttach(sessionId: id));
      }
      _heartbeat?.cancel();
      _heartbeat = Timer.periodic(const Duration(seconds: 25), (_) => _rawSend(const ClientPing()));
    }).catchError((_) {
      if (_channel == channel && _shouldRun) _scheduleReconnect();
    });

    _sub = channel.stream.listen(
      (data) {
        try {
          final decoded = jsonDecode(data is String ? data : utf8.decode(data));
          onMessage(ServerMessage.fromJson(decoded as Map<String, dynamic>));
        } catch (_) {/* ignore malformed */}
      },
      onError: (_) {/* onDone handles reconnect */},
      onDone: () {
        _heartbeat?.cancel();
        if (_channel == channel) _channel = null;
        if (_shouldRun) {
          _scheduleReconnect();
        } else {
          _setStatus(WsStatus.closed);
        }
      },
      cancelOnError: false,
    );
  }

  void _scheduleReconnect() {
    _setStatus(WsStatus.connecting);
    _reconnectAttempts += 1;
    final delayMs = math.min(1000 * math.pow(2, math.min(_reconnectAttempts, 5)).toInt(), 15000);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(milliseconds: delayMs), _connect);
  }

  bool _rawSend(ClientMessage msg) {
    final ch = _channel;
    if (ch != null && _status == WsStatus.open) {
      ch.sink.add(jsonEncode(msg.toJson()));
      return true;
    }
    return false;
  }

  bool send(ClientMessage msg) => _rawSend(msg);

  void attach(String sessionId) {
    _subscriptions.add(sessionId);
    _rawSend(ClientAttach(sessionId: sessionId));
  }

  void detach(String sessionId) {
    _subscriptions.remove(sessionId);
    _rawSend(ClientDetach(sessionId: sessionId));
  }
}
