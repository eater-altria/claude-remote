import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../state/store.dart';
import '../state/transcript.dart';
import '../theme/theme.dart';

const _downloadChannel = MethodChannel('claude_remote/downloads');

String _humanSize(num bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
}

enum _Status { idle, downloading, done, error }

/// A file Claude is delivering. On Android the download is handed to the system
/// DownloadManager (saves to public Downloads + notification, no install prompt);
/// elsewhere we fetch the bytes and open them. Mirrors FileCard.tsx.
class FileCard extends StatefulWidget {
  final FileItem item;
  final String sessionId;
  const FileCard({super.key, required this.item, required this.sessionId});

  @override
  State<FileCard> createState() => _FileCardState();
}

class _FileCardState extends State<FileCard> {
  _Status _status = _Status.idle;
  String? _savedPath;
  String? _error;

  Future<void> _download() async {
    final client = context.read<Store>().client;
    if (client == null) {
      setState(() {
        _status = _Status.error;
        _error = 'Not connected to a server.';
      });
      return;
    }
    setState(() {
      _status = _Status.downloading;
      _error = null;
    });
    try {
      if (Platform.isAndroid) {
        // Auth via ?token so the system DownloadManager needs no custom headers.
        final url = '${client.baseUrl}/api/sessions/${widget.sessionId}/files/${widget.item.fileId}'
            '?token=${Uri.encodeComponent(client.cfg.token)}';
        await _downloadChannel.invokeMethod('enqueue', {
          'url': url,
          'filename': widget.item.name,
          'title': widget.item.name,
          'mime': widget.item.mime,
        });
        if (!mounted) return;
        setState(() => _status = _Status.done);
      } else {
        final url = '${client.baseUrl}/api/sessions/${widget.sessionId}/files/${widget.item.fileId}';
        final res = await http
            .get(Uri.parse(url), headers: {'Authorization': 'Bearer ${client.cfg.token}'})
            .timeout(const Duration(seconds: 60));
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw HttpException('HTTP ${res.statusCode}');
        }
        final base = await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory();
        final file = File('${base.path}/${widget.item.name}');
        await file.writeAsBytes(res.bodyBytes);
        if (!mounted) return;
        setState(() {
          _status = _Status.done;
          _savedPath = file.path;
        });
        await OpenFilex.open(file.path);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _Status.error;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: appColors.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: appColors.border),
      ),
      child: Row(children: [
        Icon(Icons.insert_drive_file_outlined, color: appColors.accent),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${_humanSize(item.size)} · ${item.mime}',
                style: TextStyle(color: appColors.textDim, fontSize: 12)),
            if (item.description != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(item.description!, style: TextStyle(color: appColors.textDim, fontSize: 12)),
              ),
            if (_status == _Status.done)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(Platform.isAndroid ? 'Saved to Downloads' : 'Saved · tap to open',
                    style: TextStyle(color: appColors.success, fontSize: 11)),
              ),
            if (_status == _Status.error && _error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(_error!, style: TextStyle(color: appColors.danger, fontSize: 11)),
              ),
          ]),
        ),
        _action(),
      ]),
    );
  }

  Widget _action() {
    switch (_status) {
      case _Status.downloading:
        return const Padding(
          padding: EdgeInsets.all(8),
          child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
        );
      case _Status.done:
        return IconButton(
          icon: Icon(Platform.isAndroid ? Icons.check : Icons.open_in_new, color: appColors.success),
          tooltip: Platform.isAndroid ? 'Saved' : 'Open',
          onPressed: Platform.isAndroid || _savedPath == null ? null : () => OpenFilex.open(_savedPath!),
        );
      case _Status.error:
        return IconButton(
          icon: Icon(Icons.refresh, color: appColors.accent),
          tooltip: 'Retry',
          onPressed: _download,
        );
      case _Status.idle:
        return IconButton(
          icon: Icon(Icons.download_outlined, color: appColors.accent),
          tooltip: 'Download',
          onPressed: _download,
        );
    }
  }
}
