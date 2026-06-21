// Smoke tests for the Claude Remote Flutter app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:claude_remote/api/pairing.dart';

void main() {
  test('parsePairing reads a full claude-remote:// URI', () {
    final p = parsePairing('claude-remote://add?url=http://10.0.0.2:8787&token=abc&name=Mac');
    expect(p, isNotNull);
    expect(p!.url, 'http://10.0.0.2:8787');
    expect(p.token, 'abc');
    expect(p.name, 'Mac');
  });

  test('parsePairing treats a bare URL as address-only', () {
    final p = parsePairing('https://relay.example/s/abc/');
    expect(p, isNotNull);
    expect(p!.url, 'https://relay.example/s/abc'); // trailing slash trimmed
    expect(p.token, isNull);
  });

  testWidgets('MaterialApp renders', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('ok'))));
    expect(find.text('ok'), findsOneWidget);
  });
}
