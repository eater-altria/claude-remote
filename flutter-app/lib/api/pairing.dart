import 'dart:convert';

/// Pairing payload encoded in the QR codes the server/relay print. Mirrors
/// server/src/pairing.ts (and the Expo app's app/src/api/pairing.ts).
///
/// Canonical form:  claude-remote://add?url=<baseUrl>&token=<token>&name=<label>
///   - `token` is present in server-printed QRs (full one-tap add).
///   - `token` is absent in relay-printed QRs (the relay never sees it), so the
///     scan screen prefills the address and asks the user to paste the token.
class Pairing {
  final String url;
  final String? token;
  final String? name;
  const Pairing({required this.url, this.token, this.name});
}

Pairing? parsePairing(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return null;

  // claude-remote://add?url=...&token=...&name=...
  if (RegExp(r'^claude-remote://', caseSensitive: false).hasMatch(text)) {
    final q = text.indexOf('?');
    if (q < 0) return null;
    final params = Uri.splitQueryString(text.substring(q + 1));
    final url = params['url']?.trim();
    if (url == null || url.isEmpty) return null;
    return _clean(Pairing(url: url, token: params['token'], name: params['name']));
  }

  // Plain JSON blob.
  if (text.startsWith('{')) {
    try {
      final o = jsonDecode(text);
      if (o is Map && o['url'] is String && (o['url'] as String).trim().isNotEmpty) {
        return _clean(Pairing(
          url: o['url'] as String,
          token: o['token'] as String?,
          name: o['name'] as String?,
        ));
      }
    } catch (_) {
      /* not JSON — fall through */
    }
    return null;
  }

  // Bare address (relay-style, token entered manually).
  if (RegExp(r'^https?://', caseSensitive: false).hasMatch(text)) {
    return _clean(Pairing(url: text));
  }

  return null;
}

Pairing _clean(Pairing p) {
  String? trimEmpty(String? s) {
    final t = s?.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  return Pairing(
    url: p.url.trim().replaceAll(RegExp(r'/+$'), ''),
    token: trimEmpty(p.token),
    name: trimEmpty(p.name),
  );
}
