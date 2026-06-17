import type { PermissionMode, ToolCategory, FileChange } from '../protocol.js';

/** The in-process MCP tool we use for clarification cards. Always pre-approved. */
export const ASK_TOOL_NAME = 'mcp__ask__ask_user';
/** The in-process MCP tool that delivers a file to the app. Always pre-approved —
 * the user's real consent is tapping Download on the card. */
export const SEND_FILE_TOOL_NAME = 'mcp__files__send_file';
/** The in-process MCP tool that shows an image inline in the app. Always pre-approved. */
export const SEND_IMAGE_TOOL_NAME = 'mcp__files__send_image';

const READ_ONLY = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'TodoWrite',
  'TodoRead',
  'ToolSearch',
  'ExitPlanMode',
  'BashOutput',
]);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);
const EXECUTE_TOOLS = new Set(['Bash', 'KillBash', 'KillShell']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);
const TASK_TOOLS = new Set(['Task', 'Agent']);

export function categorize(toolName: string): ToolCategory {
  if (toolName === ASK_TOOL_NAME) return 'ask';
  if (READ_ONLY.has(toolName)) return toolName === 'Glob' || toolName === 'Grep' ? 'search' : 'read';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (EXECUTE_TOOLS.has(toolName)) return 'execute';
  if (WEB_TOOLS.has(toolName)) return 'web';
  if (TASK_TOOLS.has(toolName)) return 'task';
  return 'other';
}

/** Tools that never need explicit approval, regardless of mode. */
export function isAlwaysAllowed(toolName: string): boolean {
  return (
    toolName === ASK_TOOL_NAME ||
    toolName === SEND_FILE_TOOL_NAME ||
    toolName === SEND_IMAGE_TOOL_NAME ||
    READ_ONLY.has(toolName)
  );
}

/**
 * Decide what the PreToolUse hook should do for a tool, given the session's mode
 * and any per-session "remembered" allow rules.
 *
 *  - 'allow'  → auto-approve, no prompt
 *  - 'deny'   → auto-reject (plan mode blocking writes)
 *  - 'ask'    → send a permission_request to the app and wait
 */
export function decidePolicy(
  toolName: string,
  mode: PermissionMode,
  remembered: Set<string>,
): 'allow' | 'deny' | 'ask' {
  if (isAlwaysAllowed(toolName)) return 'allow';
  if (remembered.has(toolName)) return 'allow';

  const category = categorize(toolName);

  if (mode === 'bypassPermissions') return 'allow';

  if (mode === 'plan') {
    // Plan mode: read/search only. Block anything with side effects.
    if (category === 'read' || category === 'search') return 'allow';
    return 'deny';
  }

  if (mode === 'acceptEdits') {
    if (category === 'edit') return 'allow';
    return 'ask';
  }

  // default
  return 'ask';
}

export function planDenyReason(toolName: string): string {
  return `Plan mode is active — '${toolName}' is blocked. Present your plan instead of taking action.`;
}

// ---------------------------------------------------------------------------
// Deriving file changes + human-readable details from tool input.
// ---------------------------------------------------------------------------
export function describeTool(toolName: string, input: any): string {
  try {
    switch (toolName) {
      case 'Bash':
        return String(input?.command ?? '').slice(0, 2000) || '(bash)';
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
      case 'NotebookEdit':
        return String(input?.file_path ?? input?.notebook_path ?? '');
      case 'Glob':
        return String(input?.pattern ?? '');
      case 'Grep':
        return `${input?.pattern ?? ''}${input?.path ? ` in ${input.path}` : ''}`;
      case 'WebFetch':
        return String(input?.url ?? '');
      case 'WebSearch':
        return String(input?.query ?? '');
      case 'Task':
        return String(input?.description ?? input?.subagent_type ?? 'subagent');
      case ASK_TOOL_NAME:
        return 'clarification';
      default:
        if (input && typeof input === 'object') {
          const firstStr = Object.values(input).find((v) => typeof v === 'string');
          return firstStr ? String(firstStr).slice(0, 300) : toolName;
        }
        return toolName;
    }
  } catch {
    return toolName;
  }
}

export function deriveFileChange(toolName: string, input: any): FileChange | undefined {
  try {
    if (toolName === 'Write') {
      return { path: String(input.file_path), changeType: 'write', content: String(input.content ?? '') };
    }
    if (toolName === 'Edit') {
      return {
        path: String(input.file_path),
        changeType: 'edit',
        edits: [{ oldText: String(input.old_string ?? ''), newText: String(input.new_string ?? '') }],
      };
    }
    if (toolName === 'MultiEdit') {
      const edits = Array.isArray(input.edits)
        ? input.edits.map((e: any) => ({ oldText: String(e.old_string ?? ''), newText: String(e.new_string ?? '') }))
        : [];
      return { path: String(input.file_path), changeType: 'edit', edits };
    }
    if (toolName === 'NotebookEdit') {
      return {
        path: String(input.notebook_path ?? input.file_path ?? ''),
        changeType: 'edit',
        edits: [{ oldText: '', newText: String(input.new_source ?? '') }],
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function titleForTool(toolName: string, category: ToolCategory): string {
  switch (category) {
    case 'execute':
      return 'Run command';
    case 'edit':
      return toolName === 'Write' ? 'Write file' : 'Edit file';
    case 'read':
      return 'Read file';
    case 'search':
      return 'Search';
    case 'web':
      return toolName === 'WebSearch' ? 'Web search' : 'Fetch URL';
    case 'task':
      return 'Run subagent';
    case 'ask':
      return 'Ask you a question';
    default:
      return toolName;
  }
}
