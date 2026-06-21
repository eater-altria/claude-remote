import type { FileChange, SubagentItem, TodoItem, WireEvent } from '../api/protocol';

export type TranscriptItem =
  | { type: 'user'; id: string; text: string; imageCount?: number; ts: number }
  | { type: 'text'; id: string; text: string; streaming: boolean; ts: number }
  | { type: 'thinking'; id: string; text: string; streaming: boolean; ts: number }
  | {
      type: 'tool';
      id: string; // = toolUseId
      name: string;
      category: string;
      title: string;
      input: unknown;
      fileChange?: FileChange;
      status: 'pending' | 'done' | 'error';
      result?: string;
      ts: number;
    }
  | { type: 'result'; id: string; subtype: string; isError: boolean; costUsd?: number; ts: number }
  | { type: 'task'; id: string; status: string; description: string; ts: number }
  | { type: 'notice'; id: string; level: 'info' | 'warn' | 'error'; text: string; ts: number }
  | { type: 'file'; id: string; fileId: string; name: string; size: number; mime: string; description?: string; ts: number }
  | { type: 'image'; id: string; fileId: string; name: string; size: number; mime: string; caption?: string; ts: number };

/** Apply a single wire event to the item list, returning a new array. */
export function applyEvent(items: TranscriptItem[], ev: WireEvent): TranscriptItem[] {
  switch (ev.kind) {
    case 'user':
      return [...items, { type: 'user', id: ev.id, text: ev.text, imageCount: ev.imageCount, ts: ev.ts }];

    case 'block_start': {
      const item: TranscriptItem =
        ev.blockType === 'thinking'
          ? { type: 'thinking', id: ev.blockId, text: ev.initialText ?? '', streaming: true, ts: ev.ts }
          : { type: 'text', id: ev.blockId, text: ev.initialText ?? '', streaming: true, ts: ev.ts };
      // De-dupe if a block with this id already exists.
      if (items.some((i) => i.id === ev.blockId)) return items;
      return [...items, item];
    }

    case 'block_delta': {
      return items.map((i) =>
        i.id === ev.blockId && (i.type === 'text' || i.type === 'thinking')
          ? { ...i, text: i.text + ev.text }
          : i,
      );
    }

    case 'block_end': {
      return items.map((i) =>
        i.id === ev.blockId && (i.type === 'text' || i.type === 'thinking') ? { ...i, streaming: false } : i,
      );
    }

    case 'tool_use':
      if (items.some((i) => i.id === ev.toolUseId)) return items;
      return [
        ...items,
        {
          type: 'tool',
          id: ev.toolUseId,
          name: ev.name,
          category: ev.category,
          title: ev.title,
          input: ev.input,
          fileChange: ev.fileChange,
          status: 'pending',
          ts: ev.ts,
        },
      ];

    case 'tool_result': {
      let found = false;
      const next = items.map((i) => {
        if (i.type === 'tool' && i.id === ev.toolUseId) {
          found = true;
          return { ...i, status: ev.isError ? ('error' as const) : ('done' as const), result: ev.text };
        }
        return i;
      });
      return found ? next : items;
    }

    case 'result':
      return [...items, { type: 'result', id: ev.id, subtype: ev.subtype, isError: ev.isError, costUsd: ev.costUsd, ts: ev.ts }];

    case 'task':
      return [...items, { type: 'task', id: ev.id, status: ev.status, description: ev.description, ts: ev.ts }];

    case 'notice':
      return [...items, { type: 'notice', id: ev.id, level: ev.level, text: ev.text, ts: ev.ts }];

    case 'file':
      if (items.some((i) => i.id === ev.id)) return items;
      return [
        ...items,
        { type: 'file', id: ev.id, fileId: ev.fileId, name: ev.name, size: ev.size, mime: ev.mime, description: ev.description, ts: ev.ts },
      ];

    case 'image':
      if (items.some((i) => i.id === ev.id)) return items;
      return [
        ...items,
        { type: 'image', id: ev.id, fileId: ev.fileId, name: ev.name, size: ev.size, mime: ev.mime, caption: ev.caption, ts: ev.ts },
      ];

    default:
      return items;
  }
}

export function reduceEvents(events: WireEvent[]): TranscriptItem[] {
  let items: TranscriptItem[] = [];
  for (const ev of events) items = applyEvent(items, ev);
  return items;
}

/** The agent's latest todo checklist from a backlog (each TodoWrite replaces the
 *  whole list, so the last `todos` event wins). */
export function latestTodos(events: WireEvent[]): TodoItem[] {
  let todos: TodoItem[] = [];
  for (const ev of events) if (ev.kind === 'todos') todos = ev.items;
  return todos;
}

/** The session's latest subagent roster from a backlog (each `subagents` event
 *  replaces the whole roster, so the last one wins). */
export function latestSubagents(events: WireEvent[]): SubagentItem[] {
  let agents: SubagentItem[] = [];
  for (const ev of events) if (ev.kind === 'subagents') agents = ev.items;
  return agents;
}
