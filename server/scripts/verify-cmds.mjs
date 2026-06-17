import WebSocket from 'ws';
const BASE = 'http://127.0.0.1:8799', TOKEN = 'testtoken';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

const r = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers: H, body: JSON.stringify({ cwd: '/tmp/cr-workdir', title: 'cmds', permissionMode: 'bypassPermissions' }) });
const { session } = await r.json();
const sid = session.id;
console.log('session', sid);

const ws = new WebSocket(`ws://127.0.0.1:8799/ws?token=${TOKEN}`);
await new Promise((res) => ws.on('open', res));
let caps = null, reset = false, done, stage = 'init';
const p = new Promise((res) => (done = res));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'capabilities' && !caps) {
    caps = m.capabilities;
    console.log(`CAPABILITIES: ${caps.commands.length} commands, ${caps.models.length} models, ${caps.agents.length} agents; /clear=${caps.commands.some(c=>c.name==='clear')} /model(client)=${caps.commands.some(c=>c.name==='model'&&c.client)}`);
    stage = 'turn';
    ws.send(JSON.stringify({ t: 'user_message', sessionId: sid, text: 'Reply with exactly: hi' }));
  } else if (m.t === 'event' && m.event.kind === 'result' && stage === 'turn') {
    stage = 'clear';
    console.log('--- first turn done, sending /clear ---');
    ws.send(JSON.stringify({ t: 'user_message', sessionId: sid, text: '/clear' }));
  } else if (m.t === 'transcript_reset') {
    reset = true;
    console.log('TRANSCRIPT_RESET received');
    done();
  } else if (m.t === 'error') console.log('ERROR', m.message);
});
ws.send(JSON.stringify({ t: 'attach', sessionId: sid }));
await Promise.race([p, new Promise((res) => setTimeout(res, 100000))]);
console.log('SUMMARY caps=' + !!caps + ' reset=' + reset);
await fetch(`${BASE}/api/sessions/${sid}`, { method: 'DELETE', headers: H });
ws.close();
process.exit(caps && reset ? 0 : 1);
