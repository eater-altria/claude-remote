import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../api/pairing.dart';
import '../state/store.dart';
import '../theme/theme.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  bool _handled = false;

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null) return;
    final pairing = parsePairing(raw);
    if (pairing == null) return;
    _handled = true;

    final store = context.read<Store>();
    if (pairing.token != null) {
      // Full one-tap add (server-printed QR).
      store.addServer(
        name: pairing.name ?? pairing.url,
        baseUrl: pairing.url,
        token: pairing.token!,
      );
      Navigator.pop(context);
    } else {
      // Relay-printed QR: address only — ask for the token.
      _askToken(pairing.url, pairing.name);
    }
  }

  void _askToken(String url, String? name) {
    final token = TextEditingController();
    final nameCtrl = TextEditingController(text: name ?? url);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: appColors.card,
        title: const Text('Enter token'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(url, style: TextStyle(color: appColors.textDim, fontSize: 12)),
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
          TextField(controller: token, decoration: const InputDecoration(labelText: 'Token')),
        ]),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (token.text.trim().isEmpty) return;
              context.read<Store>().addServer(
                  name: nameCtrl.text, baseUrl: url, token: token.text.trim());
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan pairing QR')),
      body: Stack(children: [
        MobileScanner(onDetect: _onDetect),
        const Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Point at the QR printed by your server.\nRelay QRs will ask for the token.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, backgroundColor: Colors.black54),
            ),
          ),
        ),
      ]),
    );
  }
}
