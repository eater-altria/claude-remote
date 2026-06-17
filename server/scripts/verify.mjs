import WebSocket from 'ws';
const BASE = 'http://127.0.0.1:8799';
const TOKEN = 'testtoken';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const phase = process.argv[2];
const SIDFILE = '/tmp/cr-verify-sid.txt';
import fs from 'node:fs';

async function phase1() {
  const r = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers: H, body: JSON.stringify({ cwd: '/tmp/cr-workdir', title: 'verify', permissionMode: 'bypassPermissions' }) });
  const { session } = await r.json();
  fs.writeFileSync(SIDFILE, session.id);
  const ws = new WebSocket(`ws://127.0.0.1:8799/ws?token=${TOKEN}`);
  await new Promise((res) => ws.on('open', res));
  await new Promise((res) => setTimeout(res, 200));
  let done;
  const p = new Promise((r) => (done = r));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'event' && m.event.kind === 'result') done();
  });
  ws.send(JSON.stringify({ t: 'attach', sessionId: session.id }));
  ws.send(JSON.stringify({ t: 'user_message', sessionId: session.id, text: 'Reply with exactly the word READY and nothing else.' }));
  await Promise.race([p, new Promise((r) => setTimeout(r, 90000))]);
  ws.close();
  // live history
  const h = await (await fetch(`${BASE}/api/sessions/${session.id}/messages`, { headers: H })).json();
  console.log(`PHASE1 live messages events=${h.events.length} (expect > 0)`);
  console.log(`PHASE1 session sdk persisted? state=${h.session.state}`);
  process.exit(h.events.length > 0 ? 0 : 1);
}

async function phase2() {
  const sid = fs.readFileSync(SIDFILE, 'utf8').trim();
  // disk history path (fresh server, session not in memory)
  const h = await (await fetch(`${BASE}/api/sessions/${sid}/messages`, { headers: H })).json();
  console.log(`PHASE2 disk-resume messages events=${h.events.length} (expect > 0)`);
  // attach -> backlog should be seeded from disk
  const ws = new WebSocket(`ws://127.0.0.1:8799/ws?token=${TOKEN}`);
  await new Promise((res) => ws.on('open', res));
  let backlogLen = -1;
  const p = new Promise((r) => {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'backlog' && m.sessionId === sid) { backlogLen = m.events.length; r(); }
    });
  });
  ws.send(JSON.stringify({ t: 'attach', sessionId: sid }));
  await Promise.race([p, new Promise((r) => setTimeout(r, 15000))]);
  console.log(`PHASE2 attach backlog events=${backlogLen} (expect > 0, seeded from disk)`);
  ws.close();
  // list shows it
  const list = await (await fetch(`${BASE}/api/sessions`, { headers: H })).json();
  console.log(`PHASE2 sessions in list=${list.sessions.length}`);
  // cleanup
  await fetch(`${BASE}/api/sessions/${sid}`, { method: 'DELETE', headers: H });
  console.log('PHASE2 deleted');
  process.exit(h.events.length > 0 && backlogLen > 0 ? 0 : 1);
}

(phase === 'p2' ? phase2() : phase1()).catch((e) => { console.error(e); process.exit(1); });
