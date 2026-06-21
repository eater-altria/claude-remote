import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Recent / favourite working directories, bucketed per server.
/// Mirrors app/src/state/cwdHistory.ts.
class CwdHistory {
  static const _key = 'claude-remote.cwdhistory.v1';
  static const _maxRecent = 12;

  /// serverId -> { recent: [paths], favorites: [paths] }
  Map<String, _Bucket> _buckets = {};

  Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString(_key);
    if (raw == null) return;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      _buckets = m.map((k, v) => MapEntry(k, _Bucket.fromJson(v as Map<String, dynamic>)));
    } catch (_) {/* ignore */}
  }

  Future<void> _save() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_key, jsonEncode(_buckets.map((k, v) => MapEntry(k, v.toJson()))));
  }

  List<String> recent(String serverId) => _buckets[serverId]?.recent ?? const [];
  List<String> favorites(String serverId) => _buckets[serverId]?.favorites ?? const [];

  Future<void> pushRecent(String serverId, String path) async {
    final b = _buckets.putIfAbsent(serverId, () => _Bucket());
    b.recent.remove(path);
    b.recent.insert(0, path);
    if (b.recent.length > _maxRecent) b.recent = b.recent.sublist(0, _maxRecent);
    await _save();
  }

  bool isFavorite(String serverId, String path) => favorites(serverId).contains(path);

  Future<void> toggleFavorite(String serverId, String path) async {
    final b = _buckets.putIfAbsent(serverId, () => _Bucket());
    if (b.favorites.contains(path)) {
      b.favorites.remove(path);
    } else {
      b.favorites.insert(0, path);
    }
    await _save();
  }
}

class _Bucket {
  List<String> recent;
  List<String> favorites;
  _Bucket({List<String>? recent, List<String>? favorites})
      : recent = recent ?? [],
        favorites = favorites ?? [];

  Map<String, dynamic> toJson() => {'recent': recent, 'favorites': favorites};
  factory _Bucket.fromJson(Map<String, dynamic> j) => _Bucket(
        recent: ((j['recent'] ?? []) as List).cast<String>(),
        favorites: ((j['favorites'] ?? []) as List).cast<String>(),
      );
}
