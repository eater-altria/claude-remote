// GENERATED — DO NOT EDIT BY HAND.
// Source of truth: server/src/protocol.ts
// Regenerate with:  cd codegen && npm run gen
//
// Wire protocol shared between the Claude Remote server and the Flutter app.
// ignore_for_file: constant_identifier_names, non_constant_identifier_names

/// Wire protocol version (must match the server's PROTOCOL_VERSION).
const int kProtocolVersion = 1;

enum PermissionMode {
  default_('default'),
  acceptEdits('acceptEdits'),
  bypassPermissions('bypassPermissions'),
  plan('plan');

  final String wire;
  const PermissionMode(this.wire);

  static PermissionMode fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown PermissionMode: $w'));
  String toJson() => wire;
}

enum EffortLevel {
  low('low'),
  medium('medium'),
  high('high'),
  xhigh('xhigh'),
  max('max');

  final String wire;
  const EffortLevel(this.wire);

  static EffortLevel fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown EffortLevel: $w'));
  String toJson() => wire;
}

enum SessionState {
  starting('starting'),
  idle('idle'),
  running('running'),
  awaitingPermission('awaiting_permission'),
  awaitingQuestion('awaiting_question'),
  error('error'),
  closed('closed');

  final String wire;
  const SessionState(this.wire);

  static SessionState fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown SessionState: $w'));
  String toJson() => wire;
}

enum ToolCategory {
  read('read'),
  edit('edit'),
  execute('execute'),
  search('search'),
  web('web'),
  task('task'),
  ask('ask'),
  other('other');

  final String wire;
  const ToolCategory(this.wire);

  static ToolCategory fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown ToolCategory: $w'));
  String toJson() => wire;
}

enum PermissionDecision {
  allow('allow'),
  deny('deny');

  final String wire;
  const PermissionDecision(this.wire);

  static PermissionDecision fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown PermissionDecision: $w'));
  String toJson() => wire;
}

class SessionMeta {
  final String id;
  final String cwd;
  final String title;
  final String? model;
  final PermissionMode permissionMode;
  final EffortLevel? effort;
  final SessionState state;
  final num createdAt;
  final num updatedAt;
  final bool live;
  final String? lastError;
  final num? totalCostUsd;

  const SessionMeta({required this.id, required this.cwd, required this.title, this.model, required this.permissionMode, this.effort, required this.state, required this.createdAt, required this.updatedAt, required this.live, this.lastError, this.totalCostUsd});

  factory SessionMeta.fromJson(Map<String, dynamic> json) =>
      SessionMeta(
        id: json['id'] as String,
        cwd: json['cwd'] as String,
        title: json['title'] as String,
        model: json['model'] as String?,
        permissionMode: PermissionMode.fromWire(json['permissionMode'] as String),
        effort: json['effort'] == null ? null : EffortLevel.fromWire(json['effort'] as String),
        state: SessionState.fromWire(json['state'] as String),
        createdAt: json['createdAt'] as num,
        updatedAt: json['updatedAt'] as num,
        live: json['live'] as bool,
        lastError: json['lastError'] as String?,
        totalCostUsd: json['totalCostUsd'] as num?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'cwd': cwd,
        'title': title,
        'model': model,
        'permissionMode': permissionMode.toJson(),
        if (effort != null) 'effort': effort?.toJson(),
        'state': state.toJson(),
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'live': live,
        if (lastError != null) 'lastError': lastError,
        if (totalCostUsd != null) 'totalCostUsd': totalCostUsd,
      };
}

class FileChange {
  final String path;
  final String changeType;
  final List<FileChangeEdits>? edits;
  final String? content;

  const FileChange({required this.path, required this.changeType, this.edits, this.content});

  factory FileChange.fromJson(Map<String, dynamic> json) =>
      FileChange(
        path: json['path'] as String,
        changeType: json['changeType'] as String,
        edits: json['edits'] == null ? null : (json['edits'] as List<dynamic>).map((e) => FileChangeEdits.fromJson(e as Map<String, dynamic>)).toList(),
        content: json['content'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'path': path,
        'changeType': changeType,
        if (edits != null) 'edits': edits?.map((e) => e.toJson()).toList(),
        if (content != null) 'content': content,
      };
}

class TodoItem {
  final String content;
  final String status;
  final String? activeForm;

  const TodoItem({required this.content, required this.status, this.activeForm});

  factory TodoItem.fromJson(Map<String, dynamic> json) =>
      TodoItem(
        content: json['content'] as String,
        status: json['status'] as String,
        activeForm: json['activeForm'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'content': content,
        'status': status,
        if (activeForm != null) 'activeForm': activeForm,
      };
}

class SubagentItem {
  final String id;
  final String type;
  final String description;
  final String status;
  final num ts;

  const SubagentItem({required this.id, required this.type, required this.description, required this.status, required this.ts});

  factory SubagentItem.fromJson(Map<String, dynamic> json) =>
      SubagentItem(
        id: json['id'] as String,
        type: json['type'] as String,
        description: json['description'] as String,
        status: json['status'] as String,
        ts: json['ts'] as num,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'description': description,
        'status': status,
        'ts': ts,
      };
}

class PermissionRequest {
  final String requestId;
  final String toolName;
  final ToolCategory category;
  final String title;
  final String detail;
  final Object? input;
  final FileChange? fileChange;
  final num ts;

  const PermissionRequest({required this.requestId, required this.toolName, required this.category, required this.title, required this.detail, this.input, this.fileChange, required this.ts});

  factory PermissionRequest.fromJson(Map<String, dynamic> json) =>
      PermissionRequest(
        requestId: json['requestId'] as String,
        toolName: json['toolName'] as String,
        category: ToolCategory.fromWire(json['category'] as String),
        title: json['title'] as String,
        detail: json['detail'] as String,
        input: json['input'],
        fileChange: json['fileChange'] == null ? null : FileChange.fromJson(json['fileChange'] as Map<String, dynamic>),
        ts: json['ts'] as num,
      );

  Map<String, dynamic> toJson() => {
        'requestId': requestId,
        'toolName': toolName,
        'category': category.toJson(),
        'title': title,
        'detail': detail,
        'input': input,
        if (fileChange != null) 'fileChange': fileChange?.toJson(),
        'ts': ts,
      };
}

class QuestionOption {
  final String label;
  final String? description;
  final String? preview;

  const QuestionOption({required this.label, this.description, this.preview});

  factory QuestionOption.fromJson(Map<String, dynamic> json) =>
      QuestionOption(
        label: json['label'] as String,
        description: json['description'] as String?,
        preview: json['preview'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'label': label,
        if (description != null) 'description': description,
        if (preview != null) 'preview': preview,
      };
}

class Question {
  final String header;
  final String question;
  final bool multiSelect;
  final List<QuestionOption> options;

  const Question({required this.header, required this.question, required this.multiSelect, required this.options});

  factory Question.fromJson(Map<String, dynamic> json) =>
      Question(
        header: json['header'] as String,
        question: json['question'] as String,
        multiSelect: json['multiSelect'] as bool,
        options: (json['options'] as List<dynamic>).map((e) => QuestionOption.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Map<String, dynamic> toJson() => {
        'header': header,
        'question': question,
        'multiSelect': multiSelect,
        'options': options.map((e) => e.toJson()).toList(),
      };
}

class QuestionRequest {
  final String requestId;
  final List<Question> questions;
  final num ts;

  const QuestionRequest({required this.requestId, required this.questions, required this.ts});

  factory QuestionRequest.fromJson(Map<String, dynamic> json) =>
      QuestionRequest(
        requestId: json['requestId'] as String,
        questions: (json['questions'] as List<dynamic>).map((e) => Question.fromJson(e as Map<String, dynamic>)).toList(),
        ts: json['ts'] as num,
      );

  Map<String, dynamic> toJson() => {
        'requestId': requestId,
        'questions': questions.map((e) => e.toJson()).toList(),
        'ts': ts,
      };
}

class QuestionAnswer {
  final List<List<String>> selections;

  const QuestionAnswer({required this.selections});

  factory QuestionAnswer.fromJson(Map<String, dynamic> json) =>
      QuestionAnswer(
        selections: (json['selections'] as List<dynamic>).map((e) => (e as List<dynamic>).map((e) => e as String).toList()).toList(),
      );

  Map<String, dynamic> toJson() => {
        'selections': selections.map((e) => e.map((e) => e).toList()).toList(),
      };
}

class HealthResponse {
  final bool ok;
  final String name;
  final String version;
  final num protocol;
  final String claudeCodeVersion;
  final String platform;

  const HealthResponse({required this.ok, required this.name, required this.version, required this.protocol, required this.claudeCodeVersion, required this.platform});

  factory HealthResponse.fromJson(Map<String, dynamic> json) =>
      HealthResponse(
        ok: json['ok'] as bool,
        name: json['name'] as String,
        version: json['version'] as String,
        protocol: json['protocol'] as num,
        claudeCodeVersion: json['claudeCodeVersion'] as String,
        platform: json['platform'] as String,
      );

  Map<String, dynamic> toJson() => {
        'ok': ok,
        'name': name,
        'version': version,
        'protocol': protocol,
        'claudeCodeVersion': claudeCodeVersion,
        'platform': platform,
      };
}

class CreateSessionRequest {
  final String cwd;
  final String? title;
  final String? model;
  final PermissionMode? permissionMode;

  const CreateSessionRequest({required this.cwd, this.title, this.model, this.permissionMode});

  factory CreateSessionRequest.fromJson(Map<String, dynamic> json) =>
      CreateSessionRequest(
        cwd: json['cwd'] as String,
        title: json['title'] as String?,
        model: json['model'] as String?,
        permissionMode: json['permissionMode'] == null ? null : PermissionMode.fromWire(json['permissionMode'] as String),
      );

  Map<String, dynamic> toJson() => {
        'cwd': cwd,
        if (title != null) 'title': title,
        if (model != null) 'model': model,
        if (permissionMode != null) 'permissionMode': permissionMode?.toJson(),
      };
}

class FsEntry {
  final String name;
  final String path;
  final bool isDir;
  final bool isSymlink;

  const FsEntry({required this.name, required this.path, required this.isDir, required this.isSymlink});

  factory FsEntry.fromJson(Map<String, dynamic> json) =>
      FsEntry(
        name: json['name'] as String,
        path: json['path'] as String,
        isDir: json['isDir'] as bool,
        isSymlink: json['isSymlink'] as bool,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'path': path,
        'isDir': isDir,
        'isSymlink': isSymlink,
      };
}

class FsListResponse {
  final String path;
  final String? parent;
  final List<FsEntry> entries;

  const FsListResponse({required this.path, this.parent, required this.entries});

  factory FsListResponse.fromJson(Map<String, dynamic> json) =>
      FsListResponse(
        path: json['path'] as String,
        parent: json['parent'] as String?,
        entries: (json['entries'] as List<dynamic>).map((e) => FsEntry.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Map<String, dynamic> toJson() => {
        'path': path,
        'parent': parent,
        'entries': entries.map((e) => e.toJson()).toList(),
      };
}

class FsRoot {
  final String name;
  final String path;

  const FsRoot({required this.name, required this.path});

  factory FsRoot.fromJson(Map<String, dynamic> json) =>
      FsRoot(
        name: json['name'] as String,
        path: json['path'] as String,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'path': path,
      };
}

class ModelInfoDTO {
  final String id;
  final String displayName;
  final String? description;

  const ModelInfoDTO({required this.id, required this.displayName, this.description});

  factory ModelInfoDTO.fromJson(Map<String, dynamic> json) =>
      ModelInfoDTO(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        description: json['description'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        if (description != null) 'description': description,
      };
}

class GitFileChange {
  final String path;
  final String code;
  final bool staged;

  const GitFileChange({required this.path, required this.code, required this.staged});

  factory GitFileChange.fromJson(Map<String, dynamic> json) =>
      GitFileChange(
        path: json['path'] as String,
        code: json['code'] as String,
        staged: json['staged'] as bool,
      );

  Map<String, dynamic> toJson() => {
        'path': path,
        'code': code,
        'staged': staged,
      };
}

class GitStatusDTO {
  final bool isRepo;
  final String? branch;
  final num? ahead;
  final num? behind;
  final List<GitFileChange> files;
  final num insertions;
  final num deletions;
  final bool clean;

  const GitStatusDTO({required this.isRepo, this.branch, this.ahead, this.behind, required this.files, required this.insertions, required this.deletions, required this.clean});

  factory GitStatusDTO.fromJson(Map<String, dynamic> json) =>
      GitStatusDTO(
        isRepo: json['isRepo'] as bool,
        branch: json['branch'] as String?,
        ahead: json['ahead'] as num?,
        behind: json['behind'] as num?,
        files: (json['files'] as List<dynamic>).map((e) => GitFileChange.fromJson(e as Map<String, dynamic>)).toList(),
        insertions: json['insertions'] as num,
        deletions: json['deletions'] as num,
        clean: json['clean'] as bool,
      );

  Map<String, dynamic> toJson() => {
        'isRepo': isRepo,
        if (branch != null) 'branch': branch,
        if (ahead != null) 'ahead': ahead,
        if (behind != null) 'behind': behind,
        'files': files.map((e) => e.toJson()).toList(),
        'insertions': insertions,
        'deletions': deletions,
        'clean': clean,
      };
}

class SlashCommandDTO {
  final String name;
  final String description;
  final String argumentHint;
  final List<String>? aliases;
  final String source;
  final bool? client;

  const SlashCommandDTO({required this.name, required this.description, required this.argumentHint, this.aliases, required this.source, this.client});

  factory SlashCommandDTO.fromJson(Map<String, dynamic> json) =>
      SlashCommandDTO(
        name: json['name'] as String,
        description: json['description'] as String,
        argumentHint: json['argumentHint'] as String,
        aliases: json['aliases'] == null ? null : (json['aliases'] as List<dynamic>).map((e) => e as String).toList(),
        source: json['source'] as String,
        client: json['client'] as bool?,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
        'argumentHint': argumentHint,
        if (aliases != null) 'aliases': aliases?.map((e) => e).toList(),
        'source': source,
        if (client != null) 'client': client,
      };
}

class ModelOptionDTO {
  final String value;
  final String displayName;
  final String? description;
  final bool? supportsEffort;

  const ModelOptionDTO({required this.value, required this.displayName, this.description, this.supportsEffort});

  factory ModelOptionDTO.fromJson(Map<String, dynamic> json) =>
      ModelOptionDTO(
        value: json['value'] as String,
        displayName: json['displayName'] as String,
        description: json['description'] as String?,
        supportsEffort: json['supportsEffort'] as bool?,
      );

  Map<String, dynamic> toJson() => {
        'value': value,
        'displayName': displayName,
        if (description != null) 'description': description,
        if (supportsEffort != null) 'supportsEffort': supportsEffort,
      };
}

class AgentOptionDTO {
  final String name;
  final String description;

  const AgentOptionDTO({required this.name, required this.description});

  factory AgentOptionDTO.fromJson(Map<String, dynamic> json) =>
      AgentOptionDTO(
        name: json['name'] as String,
        description: json['description'] as String,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
      };
}

class Capabilities {
  final List<SlashCommandDTO> commands;
  final List<ModelOptionDTO> models;
  final List<AgentOptionDTO> agents;
  final String? currentModel;

  const Capabilities({required this.commands, required this.models, required this.agents, this.currentModel});

  factory Capabilities.fromJson(Map<String, dynamic> json) =>
      Capabilities(
        commands: (json['commands'] as List<dynamic>).map((e) => SlashCommandDTO.fromJson(e as Map<String, dynamic>)).toList(),
        models: (json['models'] as List<dynamic>).map((e) => ModelOptionDTO.fromJson(e as Map<String, dynamic>)).toList(),
        agents: (json['agents'] as List<dynamic>).map((e) => AgentOptionDTO.fromJson(e as Map<String, dynamic>)).toList(),
        currentModel: json['currentModel'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'commands': commands.map((e) => e.toJson()).toList(),
        'models': models.map((e) => e.toJson()).toList(),
        'agents': agents.map((e) => e.toJson()).toList(),
        if (currentModel != null) 'currentModel': currentModel,
      };
}

class ContextUsageDTO {
  final String model;
  final num totalTokens;
  final num maxTokens;
  final num percentage;
  final List<ContextUsageDTOCategories> categories;

  const ContextUsageDTO({required this.model, required this.totalTokens, required this.maxTokens, required this.percentage, required this.categories});

  factory ContextUsageDTO.fromJson(Map<String, dynamic> json) =>
      ContextUsageDTO(
        model: json['model'] as String,
        totalTokens: json['totalTokens'] as num,
        maxTokens: json['maxTokens'] as num,
        percentage: json['percentage'] as num,
        categories: (json['categories'] as List<dynamic>).map((e) => ContextUsageDTOCategories.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Map<String, dynamic> toJson() => {
        'model': model,
        'totalTokens': totalTokens,
        'maxTokens': maxTokens,
        'percentage': percentage,
        'categories': categories.map((e) => e.toJson()).toList(),
      };
}

class UsageDTO {
  final num sessionCostUsd;
  final num linesAdded;
  final num linesRemoved;
  final List<UsageModelDTO> models;
  final String? subscriptionType;
  final List<UsageRateLimitDTO> rateLimits;

  const UsageDTO({required this.sessionCostUsd, required this.linesAdded, required this.linesRemoved, required this.models, this.subscriptionType, required this.rateLimits});

  factory UsageDTO.fromJson(Map<String, dynamic> json) =>
      UsageDTO(
        sessionCostUsd: json['sessionCostUsd'] as num,
        linesAdded: json['linesAdded'] as num,
        linesRemoved: json['linesRemoved'] as num,
        models: (json['models'] as List<dynamic>).map((e) => UsageModelDTO.fromJson(e as Map<String, dynamic>)).toList(),
        subscriptionType: json['subscriptionType'] as String?,
        rateLimits: (json['rateLimits'] as List<dynamic>).map((e) => UsageRateLimitDTO.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Map<String, dynamic> toJson() => {
        'sessionCostUsd': sessionCostUsd,
        'linesAdded': linesAdded,
        'linesRemoved': linesRemoved,
        'models': models.map((e) => e.toJson()).toList(),
        'subscriptionType': subscriptionType,
        'rateLimits': rateLimits.map((e) => e.toJson()).toList(),
      };
}

class UsageModelDTO {
  final String model;
  final num inputTokens;
  final num outputTokens;
  final num costUsd;

  const UsageModelDTO({required this.model, required this.inputTokens, required this.outputTokens, required this.costUsd});

  factory UsageModelDTO.fromJson(Map<String, dynamic> json) =>
      UsageModelDTO(
        model: json['model'] as String,
        inputTokens: json['inputTokens'] as num,
        outputTokens: json['outputTokens'] as num,
        costUsd: json['costUsd'] as num,
      );

  Map<String, dynamic> toJson() => {
        'model': model,
        'inputTokens': inputTokens,
        'outputTokens': outputTokens,
        'costUsd': costUsd,
      };
}

class UsageRateLimitDTO {
  final String label;
  final num? utilization;
  final String? resetsAt;

  const UsageRateLimitDTO({required this.label, this.utilization, this.resetsAt});

  factory UsageRateLimitDTO.fromJson(Map<String, dynamic> json) =>
      UsageRateLimitDTO(
        label: json['label'] as String,
        utilization: json['utilization'] as num?,
        resetsAt: json['resetsAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'label': label,
        'utilization': utilization,
        'resetsAt': resetsAt,
      };
}

sealed class WireEvent {
  const WireEvent();

  factory WireEvent.fromJson(Map<String, dynamic> json) {
    switch (json['kind'] as String) {
      case 'user':
        return WireUser.fromJson(json);
      case 'block_start':
        return WireBlockStart.fromJson(json);
      case 'block_delta':
        return WireBlockDelta.fromJson(json);
      case 'block_end':
        return WireBlockEnd.fromJson(json);
      case 'tool_use':
        return WireToolUse.fromJson(json);
      case 'tool_result':
        return WireToolResult.fromJson(json);
      case 'task':
        return WireTask.fromJson(json);
      case 'todos':
        return WireTodos.fromJson(json);
      case 'subagents':
        return WireSubagents.fromJson(json);
      case 'result':
        return WireResult.fromJson(json);
      case 'notice':
        return WireNotice.fromJson(json);
      case 'file':
        return WireFile.fromJson(json);
      case 'image':
        return WireImage.fromJson(json);
      default:
        throw ArgumentError('Unknown WireEvent kind: ${json['kind']}');
    }
  }

  Map<String, dynamic> toJson();
}

class WireUser extends WireEvent {
  final String id;
  final String text;
  final num? imageCount;
  final num ts;

  const WireUser({required this.id, required this.text, this.imageCount, required this.ts});

  factory WireUser.fromJson(Map<String, dynamic> json) =>
      WireUser(
        id: json['id'] as String,
        text: json['text'] as String,
        imageCount: json['imageCount'] as num?,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'user',
        'id': id,
        'text': text,
        if (imageCount != null) 'imageCount': imageCount,
        'ts': ts,
      };
}

class WireBlockStart extends WireEvent {
  final String id;
  final String blockId;
  final String blockType;
  final String? initialText;
  final num ts;

  const WireBlockStart({required this.id, required this.blockId, required this.blockType, this.initialText, required this.ts});

  factory WireBlockStart.fromJson(Map<String, dynamic> json) =>
      WireBlockStart(
        id: json['id'] as String,
        blockId: json['blockId'] as String,
        blockType: json['blockType'] as String,
        initialText: json['initialText'] as String?,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'block_start',
        'id': id,
        'blockId': blockId,
        'blockType': blockType,
        if (initialText != null) 'initialText': initialText,
        'ts': ts,
      };
}

class WireBlockDelta extends WireEvent {
  final String id;
  final String blockId;
  final String text;
  final num ts;

  const WireBlockDelta({required this.id, required this.blockId, required this.text, required this.ts});

  factory WireBlockDelta.fromJson(Map<String, dynamic> json) =>
      WireBlockDelta(
        id: json['id'] as String,
        blockId: json['blockId'] as String,
        text: json['text'] as String,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'block_delta',
        'id': id,
        'blockId': blockId,
        'text': text,
        'ts': ts,
      };
}

class WireBlockEnd extends WireEvent {
  final String id;
  final String blockId;
  final num ts;

  const WireBlockEnd({required this.id, required this.blockId, required this.ts});

  factory WireBlockEnd.fromJson(Map<String, dynamic> json) =>
      WireBlockEnd(
        id: json['id'] as String,
        blockId: json['blockId'] as String,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'block_end',
        'id': id,
        'blockId': blockId,
        'ts': ts,
      };
}

class WireToolUse extends WireEvent {
  final String id;
  final String blockId;
  final String toolUseId;
  final String name;
  final ToolCategory category;
  final String title;
  final Object? input;
  final FileChange? fileChange;
  final num ts;

  const WireToolUse({required this.id, required this.blockId, required this.toolUseId, required this.name, required this.category, required this.title, this.input, this.fileChange, required this.ts});

  factory WireToolUse.fromJson(Map<String, dynamic> json) =>
      WireToolUse(
        id: json['id'] as String,
        blockId: json['blockId'] as String,
        toolUseId: json['toolUseId'] as String,
        name: json['name'] as String,
        category: ToolCategory.fromWire(json['category'] as String),
        title: json['title'] as String,
        input: json['input'],
        fileChange: json['fileChange'] == null ? null : FileChange.fromJson(json['fileChange'] as Map<String, dynamic>),
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'tool_use',
        'id': id,
        'blockId': blockId,
        'toolUseId': toolUseId,
        'name': name,
        'category': category.toJson(),
        'title': title,
        'input': input,
        if (fileChange != null) 'fileChange': fileChange?.toJson(),
        'ts': ts,
      };
}

class WireToolResult extends WireEvent {
  final String id;
  final String toolUseId;
  final bool isError;
  final String text;
  final num ts;

  const WireToolResult({required this.id, required this.toolUseId, required this.isError, required this.text, required this.ts});

  factory WireToolResult.fromJson(Map<String, dynamic> json) =>
      WireToolResult(
        id: json['id'] as String,
        toolUseId: json['toolUseId'] as String,
        isError: json['isError'] as bool,
        text: json['text'] as String,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'tool_result',
        'id': id,
        'toolUseId': toolUseId,
        'isError': isError,
        'text': text,
        'ts': ts,
      };
}

class WireTask extends WireEvent {
  final String id;
  final String status;
  final String description;
  final num ts;

  const WireTask({required this.id, required this.status, required this.description, required this.ts});

  factory WireTask.fromJson(Map<String, dynamic> json) =>
      WireTask(
        id: json['id'] as String,
        status: json['status'] as String,
        description: json['description'] as String,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'task',
        'id': id,
        'status': status,
        'description': description,
        'ts': ts,
      };
}

class WireTodos extends WireEvent {
  final String id;
  final List<TodoItem> items;
  final num ts;

  const WireTodos({required this.id, required this.items, required this.ts});

  factory WireTodos.fromJson(Map<String, dynamic> json) =>
      WireTodos(
        id: json['id'] as String,
        items: (json['items'] as List<dynamic>).map((e) => TodoItem.fromJson(e as Map<String, dynamic>)).toList(),
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'todos',
        'id': id,
        'items': items.map((e) => e.toJson()).toList(),
        'ts': ts,
      };
}

class WireSubagents extends WireEvent {
  final String id;
  final List<SubagentItem> items;
  final num ts;

  const WireSubagents({required this.id, required this.items, required this.ts});

  factory WireSubagents.fromJson(Map<String, dynamic> json) =>
      WireSubagents(
        id: json['id'] as String,
        items: (json['items'] as List<dynamic>).map((e) => SubagentItem.fromJson(e as Map<String, dynamic>)).toList(),
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'subagents',
        'id': id,
        'items': items.map((e) => e.toJson()).toList(),
        'ts': ts,
      };
}

class WireResult extends WireEvent {
  final String id;
  final String subtype;
  final bool isError;
  final num? costUsd;
  final num? numTurns;
  final num ts;

  const WireResult({required this.id, required this.subtype, required this.isError, this.costUsd, this.numTurns, required this.ts});

  factory WireResult.fromJson(Map<String, dynamic> json) =>
      WireResult(
        id: json['id'] as String,
        subtype: json['subtype'] as String,
        isError: json['isError'] as bool,
        costUsd: json['costUsd'] as num?,
        numTurns: json['numTurns'] as num?,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'result',
        'id': id,
        'subtype': subtype,
        'isError': isError,
        if (costUsd != null) 'costUsd': costUsd,
        if (numTurns != null) 'numTurns': numTurns,
        'ts': ts,
      };
}

class WireNotice extends WireEvent {
  final String id;
  final String level;
  final String text;
  final num ts;

  const WireNotice({required this.id, required this.level, required this.text, required this.ts});

  factory WireNotice.fromJson(Map<String, dynamic> json) =>
      WireNotice(
        id: json['id'] as String,
        level: json['level'] as String,
        text: json['text'] as String,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'notice',
        'id': id,
        'level': level,
        'text': text,
        'ts': ts,
      };
}

class WireFile extends WireEvent {
  final String id;
  final String fileId;
  final String name;
  final num size;
  final String mime;
  final String? description;
  final num ts;

  const WireFile({required this.id, required this.fileId, required this.name, required this.size, required this.mime, this.description, required this.ts});

  factory WireFile.fromJson(Map<String, dynamic> json) =>
      WireFile(
        id: json['id'] as String,
        fileId: json['fileId'] as String,
        name: json['name'] as String,
        size: json['size'] as num,
        mime: json['mime'] as String,
        description: json['description'] as String?,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'file',
        'id': id,
        'fileId': fileId,
        'name': name,
        'size': size,
        'mime': mime,
        if (description != null) 'description': description,
        'ts': ts,
      };
}

class WireImage extends WireEvent {
  final String id;
  final String fileId;
  final String name;
  final num size;
  final String mime;
  final String? caption;
  final num ts;

  const WireImage({required this.id, required this.fileId, required this.name, required this.size, required this.mime, this.caption, required this.ts});

  factory WireImage.fromJson(Map<String, dynamic> json) =>
      WireImage(
        id: json['id'] as String,
        fileId: json['fileId'] as String,
        name: json['name'] as String,
        size: json['size'] as num,
        mime: json['mime'] as String,
        caption: json['caption'] as String?,
        ts: json['ts'] as num,
      );

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'image',
        'id': id,
        'fileId': fileId,
        'name': name,
        'size': size,
        'mime': mime,
        if (caption != null) 'caption': caption,
        'ts': ts,
      };
}

sealed class ClientMessage {
  const ClientMessage();

  factory ClientMessage.fromJson(Map<String, dynamic> json) {
    switch (json['t'] as String) {
      case 'attach':
        return ClientAttach.fromJson(json);
      case 'detach':
        return ClientDetach.fromJson(json);
      case 'user_message':
        return ClientUserMessage.fromJson(json);
      case 'permission_response':
        return ClientPermissionResponse.fromJson(json);
      case 'question_response':
        return ClientQuestionResponse.fromJson(json);
      case 'interrupt':
        return ClientInterrupt.fromJson(json);
      case 'set_permission_mode':
        return ClientSetPermissionMode.fromJson(json);
      case 'set_model':
        return ClientSetModel.fromJson(json);
      case 'set_effort':
        return ClientSetEffort.fromJson(json);
      case 'get_context':
        return ClientGetContext.fromJson(json);
      case 'get_usage':
        return ClientGetUsage.fromJson(json);
      case 'ping':
        return ClientPing.fromJson(json);
      default:
        throw ArgumentError('Unknown ClientMessage t: ${json['t']}');
    }
  }

  Map<String, dynamic> toJson();
}

class ClientAttach extends ClientMessage {
  final String sessionId;

  const ClientAttach({required this.sessionId});

  factory ClientAttach.fromJson(Map<String, dynamic> json) =>
      ClientAttach(
        sessionId: json['sessionId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'attach',
        'sessionId': sessionId,
      };
}

class ClientDetach extends ClientMessage {
  final String sessionId;

  const ClientDetach({required this.sessionId});

  factory ClientDetach.fromJson(Map<String, dynamic> json) =>
      ClientDetach(
        sessionId: json['sessionId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'detach',
        'sessionId': sessionId,
      };
}

class ClientUserMessage extends ClientMessage {
  final String sessionId;
  final String text;
  final List<ClientUserMessageImages>? images;

  const ClientUserMessage({required this.sessionId, required this.text, this.images});

  factory ClientUserMessage.fromJson(Map<String, dynamic> json) =>
      ClientUserMessage(
        sessionId: json['sessionId'] as String,
        text: json['text'] as String,
        images: json['images'] == null ? null : (json['images'] as List<dynamic>).map((e) => ClientUserMessageImages.fromJson(e as Map<String, dynamic>)).toList(),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'user_message',
        'sessionId': sessionId,
        'text': text,
        if (images != null) 'images': images?.map((e) => e.toJson()).toList(),
      };
}

class ClientPermissionResponse extends ClientMessage {
  final String sessionId;
  final String requestId;
  final PermissionDecision decision;
  final bool? remember;

  const ClientPermissionResponse({required this.sessionId, required this.requestId, required this.decision, this.remember});

  factory ClientPermissionResponse.fromJson(Map<String, dynamic> json) =>
      ClientPermissionResponse(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
        decision: PermissionDecision.fromWire(json['decision'] as String),
        remember: json['remember'] as bool?,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'permission_response',
        'sessionId': sessionId,
        'requestId': requestId,
        'decision': decision.toJson(),
        if (remember != null) 'remember': remember,
      };
}

class ClientQuestionResponse extends ClientMessage {
  final String sessionId;
  final String requestId;
  final QuestionAnswer answer;

  const ClientQuestionResponse({required this.sessionId, required this.requestId, required this.answer});

  factory ClientQuestionResponse.fromJson(Map<String, dynamic> json) =>
      ClientQuestionResponse(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
        answer: QuestionAnswer.fromJson(json['answer'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'question_response',
        'sessionId': sessionId,
        'requestId': requestId,
        'answer': answer.toJson(),
      };
}

class ClientInterrupt extends ClientMessage {
  final String sessionId;

  const ClientInterrupt({required this.sessionId});

  factory ClientInterrupt.fromJson(Map<String, dynamic> json) =>
      ClientInterrupt(
        sessionId: json['sessionId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'interrupt',
        'sessionId': sessionId,
      };
}

class ClientSetPermissionMode extends ClientMessage {
  final String sessionId;
  final PermissionMode mode;

  const ClientSetPermissionMode({required this.sessionId, required this.mode});

  factory ClientSetPermissionMode.fromJson(Map<String, dynamic> json) =>
      ClientSetPermissionMode(
        sessionId: json['sessionId'] as String,
        mode: PermissionMode.fromWire(json['mode'] as String),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'set_permission_mode',
        'sessionId': sessionId,
        'mode': mode.toJson(),
      };
}

class ClientSetModel extends ClientMessage {
  final String sessionId;
  final String? model;

  const ClientSetModel({required this.sessionId, this.model});

  factory ClientSetModel.fromJson(Map<String, dynamic> json) =>
      ClientSetModel(
        sessionId: json['sessionId'] as String,
        model: json['model'] as String?,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'set_model',
        'sessionId': sessionId,
        'model': model,
      };
}

class ClientSetEffort extends ClientMessage {
  final String sessionId;
  final EffortLevel? effort;

  const ClientSetEffort({required this.sessionId, this.effort});

  factory ClientSetEffort.fromJson(Map<String, dynamic> json) =>
      ClientSetEffort(
        sessionId: json['sessionId'] as String,
        effort: json['effort'] == null ? null : EffortLevel.fromWire(json['effort'] as String),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'set_effort',
        'sessionId': sessionId,
        'effort': effort?.toJson(),
      };
}

class ClientGetContext extends ClientMessage {
  final String sessionId;
  final String requestId;

  const ClientGetContext({required this.sessionId, required this.requestId});

  factory ClientGetContext.fromJson(Map<String, dynamic> json) =>
      ClientGetContext(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'get_context',
        'sessionId': sessionId,
        'requestId': requestId,
      };
}

class ClientGetUsage extends ClientMessage {
  final String sessionId;
  final String requestId;

  const ClientGetUsage({required this.sessionId, required this.requestId});

  factory ClientGetUsage.fromJson(Map<String, dynamic> json) =>
      ClientGetUsage(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'get_usage',
        'sessionId': sessionId,
        'requestId': requestId,
      };
}

class ClientPing extends ClientMessage {
  const ClientPing();

  factory ClientPing.fromJson(Map<String, dynamic> json) =>
      const ClientPing();

  @override
  Map<String, dynamic> toJson() => {
        't': 'ping',
      };
}

sealed class ServerMessage {
  const ServerMessage();

  factory ServerMessage.fromJson(Map<String, dynamic> json) {
    switch (json['t'] as String) {
      case 'hello':
        return ServerHello.fromJson(json);
      case 'attached':
        return ServerAttached.fromJson(json);
      case 'event':
        return ServerEvent.fromJson(json);
      case 'backlog':
        return ServerBacklog.fromJson(json);
      case 'permission_request':
        return ServerPermissionRequest.fromJson(json);
      case 'permission_resolved':
        return ServerPermissionResolved.fromJson(json);
      case 'question_request':
        return ServerQuestionRequest.fromJson(json);
      case 'question_resolved':
        return ServerQuestionResolved.fromJson(json);
      case 'session_state':
        return ServerSessionState.fromJson(json);
      case 'alert':
        return ServerAlert.fromJson(json);
      case 'capabilities':
        return ServerCapabilities.fromJson(json);
      case 'transcript_reset':
        return ServerTranscriptReset.fromJson(json);
      case 'error':
        return ServerError.fromJson(json);
      case 'info_result':
        return ServerInfoResult.fromJson(json);
      case 'pong':
        return ServerPong.fromJson(json);
      default:
        throw ArgumentError('Unknown ServerMessage t: ${json['t']}');
    }
  }

  Map<String, dynamic> toJson();
}

class ServerHello extends ServerMessage {
  final num protocol;
  final String version;

  const ServerHello({required this.protocol, required this.version});

  factory ServerHello.fromJson(Map<String, dynamic> json) =>
      ServerHello(
        protocol: json['protocol'] as num,
        version: json['version'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'hello',
        'protocol': protocol,
        'version': version,
      };
}

class ServerAttached extends ServerMessage {
  final String sessionId;
  final SessionMeta meta;

  const ServerAttached({required this.sessionId, required this.meta});

  factory ServerAttached.fromJson(Map<String, dynamic> json) =>
      ServerAttached(
        sessionId: json['sessionId'] as String,
        meta: SessionMeta.fromJson(json['meta'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'attached',
        'sessionId': sessionId,
        'meta': meta.toJson(),
      };
}

class ServerEvent extends ServerMessage {
  final String sessionId;
  final WireEvent event;

  const ServerEvent({required this.sessionId, required this.event});

  factory ServerEvent.fromJson(Map<String, dynamic> json) =>
      ServerEvent(
        sessionId: json['sessionId'] as String,
        event: WireEvent.fromJson(json['event'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'event',
        'sessionId': sessionId,
        'event': event.toJson(),
      };
}

class ServerBacklog extends ServerMessage {
  final String sessionId;
  final List<WireEvent> events;
  final SessionMeta meta;

  const ServerBacklog({required this.sessionId, required this.events, required this.meta});

  factory ServerBacklog.fromJson(Map<String, dynamic> json) =>
      ServerBacklog(
        sessionId: json['sessionId'] as String,
        events: (json['events'] as List<dynamic>).map((e) => WireEvent.fromJson(e as Map<String, dynamic>)).toList(),
        meta: SessionMeta.fromJson(json['meta'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'backlog',
        'sessionId': sessionId,
        'events': events.map((e) => e.toJson()).toList(),
        'meta': meta.toJson(),
      };
}

class ServerPermissionRequest extends ServerMessage {
  final String sessionId;
  final PermissionRequest request;

  const ServerPermissionRequest({required this.sessionId, required this.request});

  factory ServerPermissionRequest.fromJson(Map<String, dynamic> json) =>
      ServerPermissionRequest(
        sessionId: json['sessionId'] as String,
        request: PermissionRequest.fromJson(json['request'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'permission_request',
        'sessionId': sessionId,
        'request': request.toJson(),
      };
}

class ServerPermissionResolved extends ServerMessage {
  final String sessionId;
  final String requestId;
  final PermissionDecision decision;

  const ServerPermissionResolved({required this.sessionId, required this.requestId, required this.decision});

  factory ServerPermissionResolved.fromJson(Map<String, dynamic> json) =>
      ServerPermissionResolved(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
        decision: PermissionDecision.fromWire(json['decision'] as String),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'permission_resolved',
        'sessionId': sessionId,
        'requestId': requestId,
        'decision': decision.toJson(),
      };
}

class ServerQuestionRequest extends ServerMessage {
  final String sessionId;
  final QuestionRequest request;

  const ServerQuestionRequest({required this.sessionId, required this.request});

  factory ServerQuestionRequest.fromJson(Map<String, dynamic> json) =>
      ServerQuestionRequest(
        sessionId: json['sessionId'] as String,
        request: QuestionRequest.fromJson(json['request'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'question_request',
        'sessionId': sessionId,
        'request': request.toJson(),
      };
}

class ServerQuestionResolved extends ServerMessage {
  final String sessionId;
  final String requestId;

  const ServerQuestionResolved({required this.sessionId, required this.requestId});

  factory ServerQuestionResolved.fromJson(Map<String, dynamic> json) =>
      ServerQuestionResolved(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'question_resolved',
        'sessionId': sessionId,
        'requestId': requestId,
      };
}

class ServerSessionState extends ServerMessage {
  final String sessionId;
  final SessionMeta meta;

  const ServerSessionState({required this.sessionId, required this.meta});

  factory ServerSessionState.fromJson(Map<String, dynamic> json) =>
      ServerSessionState(
        sessionId: json['sessionId'] as String,
        meta: SessionMeta.fromJson(json['meta'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'session_state',
        'sessionId': sessionId,
        'meta': meta.toJson(),
      };
}

class ServerAlert extends ServerMessage {
  final String sessionId;
  final String kind;
  final String title;
  final String body;
  final String? requestId;
  final String? categoryId;

  const ServerAlert({required this.sessionId, required this.kind, required this.title, required this.body, this.requestId, this.categoryId});

  factory ServerAlert.fromJson(Map<String, dynamic> json) =>
      ServerAlert(
        sessionId: json['sessionId'] as String,
        kind: json['kind'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        requestId: json['requestId'] as String?,
        categoryId: json['categoryId'] as String?,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'alert',
        'sessionId': sessionId,
        'kind': kind,
        'title': title,
        'body': body,
        if (requestId != null) 'requestId': requestId,
        if (categoryId != null) 'categoryId': categoryId,
      };
}

class ServerCapabilities extends ServerMessage {
  final String sessionId;
  final Capabilities capabilities;

  const ServerCapabilities({required this.sessionId, required this.capabilities});

  factory ServerCapabilities.fromJson(Map<String, dynamic> json) =>
      ServerCapabilities(
        sessionId: json['sessionId'] as String,
        capabilities: Capabilities.fromJson(json['capabilities'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'capabilities',
        'sessionId': sessionId,
        'capabilities': capabilities.toJson(),
      };
}

class ServerTranscriptReset extends ServerMessage {
  final String sessionId;
  final SessionMeta meta;

  const ServerTranscriptReset({required this.sessionId, required this.meta});

  factory ServerTranscriptReset.fromJson(Map<String, dynamic> json) =>
      ServerTranscriptReset(
        sessionId: json['sessionId'] as String,
        meta: SessionMeta.fromJson(json['meta'] as Map<String, dynamic>),
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'transcript_reset',
        'sessionId': sessionId,
        'meta': meta.toJson(),
      };
}

class ServerError extends ServerMessage {
  final String? sessionId;
  final String message;

  const ServerError({this.sessionId, required this.message});

  factory ServerError.fromJson(Map<String, dynamic> json) =>
      ServerError(
        sessionId: json['sessionId'] as String?,
        message: json['message'] as String,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'error',
        if (sessionId != null) 'sessionId': sessionId,
        'message': message,
      };
}

class ServerInfoResult extends ServerMessage {
  final String sessionId;
  final String requestId;
  final String kind;
  final bool ok;
  final ContextUsageDTO? context;
  final UsageDTO? usage;
  final String? error;

  const ServerInfoResult({required this.sessionId, required this.requestId, required this.kind, required this.ok, this.context, this.usage, this.error});

  factory ServerInfoResult.fromJson(Map<String, dynamic> json) =>
      ServerInfoResult(
        sessionId: json['sessionId'] as String,
        requestId: json['requestId'] as String,
        kind: json['kind'] as String,
        ok: json['ok'] as bool,
        context: json['context'] == null ? null : ContextUsageDTO.fromJson(json['context'] as Map<String, dynamic>),
        usage: json['usage'] == null ? null : UsageDTO.fromJson(json['usage'] as Map<String, dynamic>),
        error: json['error'] as String?,
      );

  @override
  Map<String, dynamic> toJson() => {
        't': 'info_result',
        'sessionId': sessionId,
        'requestId': requestId,
        'kind': kind,
        'ok': ok,
        if (context != null) 'context': context?.toJson(),
        if (usage != null) 'usage': usage?.toJson(),
        if (error != null) 'error': error,
      };
}

class ServerPong extends ServerMessage {
  const ServerPong();

  factory ServerPong.fromJson(Map<String, dynamic> json) =>
      const ServerPong();

  @override
  Map<String, dynamic> toJson() => {
        't': 'pong',
      };
}

class FileChangeEdits {
  final String oldText;
  final String newText;

  const FileChangeEdits({required this.oldText, required this.newText});

  factory FileChangeEdits.fromJson(Map<String, dynamic> json) =>
      FileChangeEdits(
        oldText: json['oldText'] as String,
        newText: json['newText'] as String,
      );

  Map<String, dynamic> toJson() => {
        'oldText': oldText,
        'newText': newText,
      };
}

class ContextUsageDTOCategories {
  final String name;
  final num tokens;
  final String color;

  const ContextUsageDTOCategories({required this.name, required this.tokens, required this.color});

  factory ContextUsageDTOCategories.fromJson(Map<String, dynamic> json) =>
      ContextUsageDTOCategories(
        name: json['name'] as String,
        tokens: json['tokens'] as num,
        color: json['color'] as String,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'tokens': tokens,
        'color': color,
      };
}

class ClientUserMessageImages {
  final String mime;
  final String data;

  const ClientUserMessageImages({required this.mime, required this.data});

  factory ClientUserMessageImages.fromJson(Map<String, dynamic> json) =>
      ClientUserMessageImages(
        mime: json['mime'] as String,
        data: json['data'] as String,
      );

  Map<String, dynamic> toJson() => {
        'mime': mime,
        'data': data,
      };
}
