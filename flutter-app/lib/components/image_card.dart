import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/store.dart';
import '../state/transcript.dart';
import '../theme/theme.dart';

/// An image Claude wants shown inline. Bytes come from the authed file endpoint,
/// passed as a Bearer header on the image request.
class ImageCard extends StatelessWidget {
  final ImageItem item;
  final String sessionId;
  const ImageCard({super.key, required this.item, required this.sessionId});

  @override
  Widget build(BuildContext context) {
    final client = context.read<Store>().client;
    if (client == null) return const SizedBox.shrink();
    final url = '${client.baseUrl}/api/sessions/$sessionId/files/${item.fileId}';
    final headers = {'Authorization': 'Bearer ${client.cfg.token}'};

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Image.network(
          url,
          headers: headers,
          fit: BoxFit.contain,
          loadingBuilder: (ctx, child, progress) => progress == null
              ? child
              : const SizedBox(height: 160, child: Center(child: CircularProgressIndicator())),
          errorBuilder: (ctx, e, st) => Container(
            height: 120,
            alignment: Alignment.center,
            child: Text('Failed to load image', style: TextStyle(color: appColors.textDim)),
          ),
        ),
        if (item.caption != null)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text(item.caption!, style: TextStyle(color: appColors.textDim, fontSize: 12)),
          ),
      ]),
    );
  }
}
