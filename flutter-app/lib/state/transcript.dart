import '../protocol/protocol.gen.dart';

/// Rendered transcript item — the app-side view model the chat list renders.
/// Mirrors app/src/state/transcript.ts. Streaming fields (text / streaming /
/// status / result) are mutable so token deltas patch in place.
sealed class TranscriptItem {
  final String id;
  final num ts;
  TranscriptItem(this.id, this.ts);
}

class UserItem extends TranscriptItem {
  final String text;
  final num? imageCount;
  UserItem({required String id, required this.text, this.imageCount, required num ts}) : super(id, ts);
}

class TextItem extends TranscriptItem {
  String text;
  bool streaming;
  TextItem({required String id, required this.text, required this.streaming, required num ts}) : super(id, ts);
}

class ThinkingItem extends TranscriptItem {
  String text;
  bool streaming;
  ThinkingItem({required String id, required this.text, required this.streaming, required num ts}) : super(id, ts);
}

enum ToolStatus { pending, done, error }

class ToolItem extends TranscriptItem {
  final String name;
  final ToolCategory category;
  final String title;
  final Object? input;
  final FileChange? fileChange;
  ToolStatus status;
  String? result;
  ToolItem({
    required String id,
    required this.name,
    required this.category,
    required this.title,
    required this.input,
    this.fileChange,
    required this.status,
    this.result,
    required num ts,
  }) : super(id, ts);
}

class ResultItem extends TranscriptItem {
  final String subtype;
  final bool isError;
  final num? costUsd;
  ResultItem({required String id, required this.subtype, required this.isError, this.costUsd, required num ts})
      : super(id, ts);
}

class TaskItem extends TranscriptItem {
  final String status;
  final String description;
  TaskItem({required String id, required this.status, required this.description, required num ts}) : super(id, ts);
}

class NoticeItem extends TranscriptItem {
  final String level; // info | warn | error
  final String text;
  NoticeItem({required String id, required this.level, required this.text, required num ts}) : super(id, ts);
}

class FileItem extends TranscriptItem {
  final String fileId;
  final String name;
  final num size;
  final String mime;
  final String? description;
  FileItem({
    required String id,
    required this.fileId,
    required this.name,
    required this.size,
    required this.mime,
    this.description,
    required num ts,
  }) : super(id, ts);
}

class ImageItem extends TranscriptItem {
  final String fileId;
  final String name;
  final num size;
  final String mime;
  final String? caption;
  ImageItem({
    required String id,
    required this.fileId,
    required this.name,
    required this.size,
    required this.mime,
    this.caption,
    required num ts,
  }) : super(id, ts);
}

/// Apply a single wire event to the item list, mutating it in place and
/// returning it. Streaming deltas patch existing items; new blocks append.
List<TranscriptItem> applyEvent(List<TranscriptItem> items, WireEvent ev) {
  switch (ev) {
    case WireUser():
      items.add(UserItem(id: ev.id, text: ev.text, imageCount: ev.imageCount, ts: ev.ts));

    case WireBlockStart():
      if (items.any((i) => i.id == ev.blockId)) break;
      if (ev.blockType == 'thinking') {
        items.add(ThinkingItem(id: ev.blockId, text: ev.initialText ?? '', streaming: true, ts: ev.ts));
      } else {
        items.add(TextItem(id: ev.blockId, text: ev.initialText ?? '', streaming: true, ts: ev.ts));
      }

    case WireBlockDelta():
      for (final i in items) {
        if (i.id == ev.blockId) {
          if (i is TextItem) i.text += ev.text;
          if (i is ThinkingItem) i.text += ev.text;
        }
      }

    case WireBlockEnd():
      for (final i in items) {
        if (i.id == ev.blockId) {
          if (i is TextItem) i.streaming = false;
          if (i is ThinkingItem) i.streaming = false;
        }
      }

    case WireToolUse():
      if (items.any((i) => i.id == ev.toolUseId)) break;
      items.add(ToolItem(
        id: ev.toolUseId,
        name: ev.name,
        category: ev.category,
        title: ev.title,
        input: ev.input,
        fileChange: ev.fileChange,
        status: ToolStatus.pending,
        ts: ev.ts,
      ));

    case WireToolResult():
      for (final i in items) {
        if (i is ToolItem && i.id == ev.toolUseId) {
          i.status = ev.isError ? ToolStatus.error : ToolStatus.done;
          i.result = ev.text;
        }
      }

    case WireResult():
      items.add(ResultItem(id: ev.id, subtype: ev.subtype, isError: ev.isError, costUsd: ev.costUsd, ts: ev.ts));

    case WireTask():
      items.add(TaskItem(id: ev.id, status: ev.status, description: ev.description, ts: ev.ts));

    case WireNotice():
      items.add(NoticeItem(id: ev.id, level: ev.level, text: ev.text, ts: ev.ts));

    case WireFile():
      if (items.any((i) => i.id == ev.id)) break;
      items.add(FileItem(
        id: ev.id,
        fileId: ev.fileId,
        name: ev.name,
        size: ev.size,
        mime: ev.mime,
        description: ev.description,
        ts: ev.ts,
      ));

    case WireImage():
      if (items.any((i) => i.id == ev.id)) break;
      items.add(ImageItem(
        id: ev.id,
        fileId: ev.fileId,
        name: ev.name,
        size: ev.size,
        mime: ev.mime,
        caption: ev.caption,
        ts: ev.ts,
      ));

    // todos / subagents drive always-on panels, not transcript items.
    case WireTodos():
    case WireSubagents():
      break;
  }
  return items;
}

List<TranscriptItem> reduceEvents(List<WireEvent> events) {
  final items = <TranscriptItem>[];
  for (final ev in events) {
    applyEvent(items, ev);
  }
  return items;
}

/// The agent's latest TodoWrite checklist from a backlog (last one wins).
List<TodoItem> latestTodos(List<WireEvent> events) {
  var todos = <TodoItem>[];
  for (final ev in events) {
    if (ev is WireTodos) todos = ev.items;
  }
  return todos;
}

/// The session's latest subagent roster from a backlog (last one wins).
List<SubagentItem> latestSubagents(List<WireEvent> events) {
  var agents = <SubagentItem>[];
  for (final ev in events) {
    if (ev is WireSubagents) agents = ev.items;
  }
  return agents;
}
