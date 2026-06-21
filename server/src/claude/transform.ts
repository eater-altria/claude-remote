import type {
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKMessage,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { SubagentItem, TodoItem, WireEvent } from '../protocol.js';
import { categorize, deriveFileChange, titleForTool } from './permissions.js';

let globalSeq = 0;
function nid(prefix: string): string {
  globalSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${globalSeq}`;
}

/** Normalize a TodoWrite tool input into the wire TodoItem[] shape, tolerating
 *  minor schema drift between Claude Code versions. */
function parseTodos(input: unknown): TodoItem[] {
  const raw = (input as any)?.todos;
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any): TodoItem => {
    const status = t?.status === 'in_progress' || t?.status === 'completed' ? t.status : 'pending';
    return {
      content: String(t?.content ?? t?.activeForm ?? '').trim(),
      status,
      activeForm: typeof t?.activeForm === 'string' ? t.activeForm : undefined,
    };
  });
}

function now(): number {
  return Date.now();
}

/**
 * Tracks the SDK's stateful task tools and rebuilds the whole checklist on each
 * change, so it can be shipped as the same replace-on-each `todos` wire event the
 * legacy single-shot `TodoWrite` produced — the app side is unchanged.
 *
 * The new tools are incremental, not whole-list: `TaskCreate` adds one task,
 * `TaskUpdate` mutates one by id (`status:'deleted'` removes it), and
 * `TaskList`/`TaskGet` are read-only queries. The SDK assigns sequential string
 * ids ("1","2",…) per create — exactly what `TaskUpdate.taskId` later references
 * — so we mirror that with a counter instead of parsing the (harness-formatted,
 * unreliable) tool_result text to learn the id.
 */
class TaskTracker {
  private seq = 0;
  private tasks = new Map<string, TodoItem>();

  /** Apply a tool_use. Returns 'mutated' (list changed → emit a todos snapshot),
   *  'read' (a read-only query → swallow its card, nothing changed), or null
   *  (not a task tool → let the caller render a normal tool card). */
  apply(name: string, input: unknown): 'mutated' | 'read' | null {
    const i = input as any;
    if (name === 'TaskCreate') {
      const id = String(++this.seq);
      this.tasks.set(id, {
        content: String(i?.subject ?? '').trim(),
        status: 'pending',
        activeForm: typeof i?.activeForm === 'string' ? i.activeForm : undefined,
      });
      return 'mutated';
    }
    if (name === 'TaskUpdate') {
      const id = String(i?.taskId ?? '');
      if (i?.status === 'deleted') {
        this.tasks.delete(id);
        return 'mutated';
      }
      const t = this.tasks.get(id);
      if (t) {
        if (i?.status === 'pending' || i?.status === 'in_progress' || i?.status === 'completed') t.status = i.status;
        if (typeof i?.subject === 'string') t.content = i.subject.trim();
        if (typeof i?.activeForm === 'string') t.activeForm = i.activeForm;
      }
      return 'mutated';
    }
    if (name === 'TaskList' || name === 'TaskGet') return 'read';
    return null;
  }

  snapshot(): TodoItem[] {
    return [...this.tasks.values()];
  }
}

/**
 * Tracks live `Task` subagent invocations by their tool_use_id, so the app can
 * show an always-on roster of running subagents. Fed by the Task tool_use (spawn)
 * and its matching tool_result (finish) — the same correlation the transcript uses
 * to flip a tool card to done.
 */
class SubagentTracker {
  private agents = new Map<string, SubagentItem>();

  /** Record a spawned subagent. Returns true (always emit a snapshot). */
  spawn(toolUseId: string, input: unknown): boolean {
    const i = input as any;
    const type = String(i?.subagent_type ?? 'agent').trim();
    this.agents.set(toolUseId, {
      id: toolUseId,
      type: type || 'agent',
      description: String(i?.description ?? type ?? 'subagent').trim() || 'subagent',
      status: 'running',
      ts: now(),
    });
    return true;
  }

  /** Mark a subagent finished if this tool_use_id is one we track. Returns true if
   *  the roster changed (→ emit a snapshot), false for unrelated tool results. */
  finish(toolUseId: string, isError: boolean): boolean {
    const a = this.agents.get(toolUseId);
    if (!a || a.status !== 'running') return false;
    a.status = isError ? 'failed' : 'completed';
    return true;
  }

  snapshot(): SubagentItem[] {
    return [...this.agents.values()];
  }
}

/** Flatten arbitrary tool_result / message content into plain text. */
export function contentToText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (c?.type === 'text') return c.text ?? '';
        if (c?.type === 'image') return '[image]';
        if (c?.type === 'tool_result') return contentToText(c.content);
        return typeof c?.text === 'string' ? c.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    const anyc = content as any;
    if (typeof anyc.text === 'string') return anyc.text;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

/**
 * Stateful, per-session transformer for the LIVE message stream.
 *
 * Strategy (validated against the SDK's actual output):
 *  - text & thinking blocks are streamed token-by-token from `stream_event`s
 *    as block_start / block_delta / block_end.
 *  - tool_use blocks are emitted consolidated from the `assistant` message
 *    (input fully formed). We derive file-change cards from edit tools.
 *  - tool results arrive as `user` messages with tool_result content blocks.
 */
export class LiveTransformer {
  private turnSeq = 0;
  private messageSeq = 0;
  private sawStreamThisTurn = false;
  /** index -> { blockId, type } for the message currently streaming. */
  private blockMap = new Map<number, { blockId: string; type: 'text' | 'thinking' }>();
  /** Session-long task state, fed by the SDK's TaskCreate/TaskUpdate tools. */
  private taskTracker = new TaskTracker();
  /** Session-long roster of spawned `Task` subagents, keyed by tool_use_id. */
  private subagentTracker = new SubagentTracker();

  /** Prime task state from a resumed session's transcript so a post-resume
   *  TaskUpdate(taskId) resolves against the right task and new ids continue the
   *  SDK's sequence. Replays the persisted assistant tool_use blocks in order. */
  seedTasks(messages: SessionMessage[]): void {
    for (const sm of messages) {
      if ((sm as any).type !== 'assistant') continue;
      const content = (sm as any).message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === 'tool_use') this.taskTracker.apply(block.name, block.input);
      }
    }
  }

  private blockId(index: number): string {
    return `t${this.turnSeq}.m${this.messageSeq}.b${index}`;
  }

  onStreamEvent(msg: SDKPartialAssistantMessage): WireEvent[] {
    const ev: any = msg.event;
    const out: WireEvent[] = [];
    switch (ev?.type) {
      case 'message_start': {
        this.messageSeq += 1;
        this.blockMap.clear();
        break;
      }
      case 'content_block_start': {
        const t = ev.content_block?.type;
        const index: number = ev.index ?? 0;
        if (t === 'text' || t === 'thinking' || t === 'redacted_thinking') {
          const blockType = t === 'text' ? 'text' : 'thinking';
          const blockId = this.blockId(index);
          this.blockMap.set(index, { blockId, type: blockType });
          this.sawStreamThisTurn = true;
          out.push({ kind: 'block_start', id: nid('bs'), blockId, blockType, ts: now() });
        }
        break;
      }
      case 'content_block_delta': {
        const index: number = ev.index ?? 0;
        const b = this.blockMap.get(index);
        if (!b) break;
        const d = ev.delta;
        let text = '';
        if (d?.type === 'text_delta') text = d.text ?? '';
        else if (d?.type === 'thinking_delta') text = d.thinking ?? '';
        else break; // ignore input_json_delta / signature_delta
        if (text) out.push({ kind: 'block_delta', id: nid('bd'), blockId: b.blockId, text, ts: now() });
        break;
      }
      case 'content_block_stop': {
        const index: number = ev.index ?? 0;
        const b = this.blockMap.get(index);
        if (b) {
          out.push({ kind: 'block_end', id: nid('be'), blockId: b.blockId, ts: now() });
          this.blockMap.delete(index);
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  onAssistant(msg: SDKAssistantMessage): WireEvent[] {
    const out: WireEvent[] = [];
    const content: any[] = Array.isArray((msg.message as any)?.content) ? (msg.message as any).content : [];
    for (const block of content) {
      if (block?.type === 'tool_use') {
        const name: string = block.name;
        // Task tools drive the dedicated task-progress panel, not a tool card.
        // Legacy TodoWrite ships its whole list; the newer stateful
        // TaskCreate/TaskUpdate tools are folded into a rebuilt snapshot.
        if (name === 'TodoWrite') {
          out.push({ kind: 'todos', id: nid('todos'), items: parseTodos(block.input), ts: now() });
          continue;
        }
        const taskKind = this.taskTracker.apply(name, block.input);
        if (taskKind === 'read') continue; // swallow read-only TaskList/TaskGet
        if (taskKind === 'mutated') {
          out.push({ kind: 'todos', id: nid('todos'), items: this.taskTracker.snapshot(), ts: now() });
          continue;
        }
        const category = categorize(name);
        const blockId = `t${this.turnSeq}.tool.${block.id}`;
        out.push({
          kind: 'tool_use',
          id: nid('tu'),
          blockId,
          toolUseId: block.id,
          name,
          category,
          title: titleForTool(name, category),
          input: block.input,
          fileChange: deriveFileChange(name, block.input),
          ts: now(),
        });
        // A Task tool spawns a subagent — also feed the always-on subagent panel.
        if (category === 'task' && this.subagentTracker.spawn(block.id, block.input)) {
          out.push({ kind: 'subagents', id: nid('sa'), items: this.subagentTracker.snapshot(), ts: now() });
        }
      } else if (!this.sawStreamThisTurn && (block?.type === 'text' || block?.type === 'thinking')) {
        // Fallback: no streaming deltas were seen this turn, emit consolidated.
        const blockType = block.type === 'text' ? 'text' : 'thinking';
        const text = block.type === 'text' ? block.text : block.thinking;
        const blockId = `t${this.turnSeq}.cons.${nid('c')}`;
        out.push({ kind: 'block_start', id: nid('bs'), blockId, blockType, initialText: text ?? '', ts: now() });
        out.push({ kind: 'block_end', id: nid('be'), blockId, ts: now() });
      }
    }
    return out;
  }

  onUser(msg: SDKUserMessage): WireEvent[] {
    const out: WireEvent[] = [];
    const content = (msg.message as any)?.content;
    if (!Array.isArray(content)) return out;
    for (const block of content) {
      if (block?.type === 'tool_result') {
        out.push({
          kind: 'tool_result',
          id: nid('tr'),
          toolUseId: block.tool_use_id,
          isError: block.is_error === true,
          text: contentToText(block.content),
          ts: now(),
        });
        // If this result closes out a tracked subagent, refresh the panel roster.
        if (this.subagentTracker.finish(block.tool_use_id, block.is_error === true)) {
          out.push({ kind: 'subagents', id: nid('sa'), items: this.subagentTracker.snapshot(), ts: now() });
        }
      }
    }
    return out;
  }

  onResult(msg: SDKResultMessage): WireEvent[] {
    const ev: WireEvent = {
      kind: 'result',
      id: nid('res'),
      subtype: msg.subtype,
      isError: msg.is_error === true,
      costUsd: (msg as any).total_cost_usd,
      numTurns: (msg as any).num_turns,
      ts: now(),
    };
    // Reset per-turn state for the next turn.
    this.turnSeq += 1;
    this.messageSeq = 0;
    this.sawStreamThisTurn = false;
    this.blockMap.clear();
    return [ev];
  }

  onSystem(msg: SDKMessage & { subtype?: string }): WireEvent[] {
    const m: any = msg;
    switch (m.subtype) {
      case 'task_started':
        return [{ kind: 'task', id: nid('task'), status: 'started', description: m.description ?? 'subagent', ts: now() }];
      case 'task_notification':
        return [
          {
            kind: 'task',
            id: nid('task'),
            status: m.status === 'completed' ? 'completed' : 'failed',
            description: m.summary ?? 'subagent finished',
            ts: now(),
          },
        ];
      case 'compact_boundary':
        return [{ kind: 'notice', id: nid('nt'), level: 'info', text: 'Context was compacted to free space.', ts: now() }];
      case 'worker_shutting_down':
        return [{ kind: 'notice', id: nid('nt'), level: 'warn', text: `Worker shutting down: ${m.reason ?? ''}`, ts: now() }];
      default:
        return [];
    }
  }
}

/**
 * Convert a persisted transcript (getSessionMessages) into wire events for the
 * app to render when (re)opening a session. No deltas here — everything is
 * consolidated.
 */
export function historyToEvents(messages: SessionMessage[]): WireEvent[] {
  const out: WireEvent[] = [];
  let turn = 0;
  // Rebuild the task checklist from the incremental Task* tools as we replay, then
  // emit one consolidated snapshot at the end (the panel only needs final state).
  const tasks = new TaskTracker();
  let sawTaskTool = false;
  // Rebuild the subagent roster too, so a reattach mid-run still shows the panel.
  const subagents = new SubagentTracker();
  let sawSubagent = false;
  for (const sm of messages) {
    const role = (sm as any).type;
    const message: any = (sm as any).message;
    const content = message?.content;

    if (role === 'user') {
      if (typeof content === 'string') {
        if (content.trim()) out.push({ kind: 'user', id: nid('u'), text: content, ts: now() });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_result') {
            out.push({
              kind: 'tool_result',
              id: nid('tr'),
              toolUseId: block.tool_use_id,
              isError: block.is_error === true,
              text: contentToText(block.content),
              ts: now(),
            });
            subagents.finish(block.tool_use_id, block.is_error === true);
          } else if (block?.type === 'text' && block.text?.trim()) {
            out.push({ kind: 'user', id: nid('u'), text: block.text, ts: now() });
          }
        }
      }
    } else if (role === 'assistant') {
      const blocks: any[] = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (block?.type === 'text') {
          const blockId = `h${turn}.${nid('b')}`;
          out.push({ kind: 'block_start', id: nid('bs'), blockId, blockType: 'text', initialText: block.text ?? '', ts: now() });
          out.push({ kind: 'block_end', id: nid('be'), blockId, ts: now() });
        } else if (block?.type === 'thinking') {
          const blockId = `h${turn}.${nid('b')}`;
          out.push({ kind: 'block_start', id: nid('bs'), blockId, blockType: 'thinking', initialText: block.thinking ?? '', ts: now() });
          out.push({ kind: 'block_end', id: nid('be'), blockId, ts: now() });
        } else if (block?.type === 'tool_use') {
          if (block.name === 'TodoWrite') {
            out.push({ kind: 'todos', id: nid('todos'), items: parseTodos(block.input), ts: now() });
            continue;
          }
          // Task tools fold into the consolidated snapshot emitted after the loop.
          if (tasks.apply(block.name, block.input) != null) {
            sawTaskTool = true;
            continue;
          }
          const category = categorize(block.name);
          out.push({
            kind: 'tool_use',
            id: nid('tu'),
            blockId: `h${turn}.tool.${block.id}`,
            toolUseId: block.id,
            name: block.name,
            category,
            title: titleForTool(block.name, category),
            input: block.input,
            fileChange: deriveFileChange(block.name, block.input),
            ts: now(),
          });
          if (category === 'task') {
            subagents.spawn(block.id, block.input);
            sawSubagent = true;
          }
        }
      }
      turn += 1;
    }
  }
  if (sawTaskTool) out.push({ kind: 'todos', id: nid('todos'), items: tasks.snapshot(), ts: now() });
  if (sawSubagent) out.push({ kind: 'subagents', id: nid('sa'), items: subagents.snapshot(), ts: now() });
  return out;
}
