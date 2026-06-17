import type {
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKMessage,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { WireEvent } from '../protocol.js';
import { categorize, deriveFileChange, titleForTool } from './permissions.js';

let globalSeq = 0;
function nid(prefix: string): string {
  globalSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${globalSeq}`;
}

function now(): number {
  return Date.now();
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
        }
      }
      turn += 1;
    }
  }
  return out;
}
