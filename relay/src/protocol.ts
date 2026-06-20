/**
 * Control-channel wire protocol between the cloud relay and a local server's
 * "agent" (the dial-out bridge in server/src/relay/agent.ts).
 *
 * This is a SEPARATE protocol from the app↔server protocol. The relay never
 * understands the app payloads — it only multiplexes HTTP requests and WebSocket
 * connections from apps onto a single persistent control socket per server,
 * tagging each with a `streamId`. The agent replays them onto its own loopback
 * (127.0.0.1) listener, so 100% of the existing server logic is reused.
 */

/** Frames the local agent sends UP to the relay. */
export type AgentToRelay =
  // First frame after connecting: announce which server this is + a hash of its
  // access token (so the relay can pre-reject apps with the wrong token without
  // ever seeing the raw token).
  | { t: 'register'; serverId: string; keyHash: string; name?: string }
  // HTTP response, streamed back: head, then zero+ chunks, then end (or error).
  | { t: 'res'; streamId: string; status: number; headers: Record<string, string> }
  | { t: 'res_chunk'; streamId: string; data: string } // base64
  | { t: 'res_end'; streamId: string }
  | { t: 'res_error'; streamId: string; message: string }
  // Proxied WebSocket: a frame from the server destined for the app.
  | { t: 'ws_msg'; streamId: string; data: string }
  | { t: 'ws_close'; streamId: string };

/** Frames the relay sends DOWN to the local agent. */
export type RelayToAgent =
  | { t: 'registered' }
  | { t: 'register_error'; message: string }
  // A buffered HTTP request from an app (bodies are small JSON / form posts).
  | { t: 'req'; streamId: string; method: string; path: string; headers: Record<string, string>; body?: string }
  // An app opened a WebSocket. `path` includes the query string (carrying ?token=).
  | { t: 'ws_open'; streamId: string; path: string }
  // A frame from the app destined for the server.
  | { t: 'ws_msg'; streamId: string; data: string }
  | { t: 'ws_close'; streamId: string }
  // The relay gave up on an in-flight HTTP request (app disconnected / timeout).
  | { t: 'cancel'; streamId: string };
