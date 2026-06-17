import WebSocket from 'ws';

const BASE = 'http://127.0.0.1:8799';
const TOKEN = 'testtoken';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

const short = (o, n = 200) => { const s = typeof o === 'string' ? o : JSON.stringify(o); return s.length > n ? s.slice(0, n) + '…' : s; };

async function main() {
  // 1. create session
  const r = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers: H, body: JSON.stringify({ cwd: '/tmp/cr-workdir', title: 'smoke', permissionMode: 'default' }) });
  const { session } = await r.json();
  console.log('created session', session.id, 'state', session.state, 'model', session.model);

  const ws = new WebSocket(`ws://127.0.0.1:8799/ws?token=${TOKEN}`);
  const sid = session.id;
  let gotPermission = false, gotToolResult = false, gotResult = 0, gotQuestion = false, gotAskResult = false;
  let stage = 'bash';

  await new Promise((res) => ws.on('open', res));
  console.log('ws open');

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'event') {
      const e = m.event;
      if (e.kind === 'block_delta') return; // too noisy
      if (e.kind === 'tool_use') console.log(`  event tool_use ${e.name} detail=${short(e.input)}`);
      else if (e.kind === 'tool_result') { gotToolResult = true; console.log(`  event tool_result err=${e.isError} text=${short(e.text,120)}`); }
      else if (e.kind === 'result') { gotResult++; console.log(`  event result #${gotResult} subtype=${e.subtype} cost=${e.costUsd}`); onResult(); }
      else if (e.kind === 'block_start') console.log(`  event block_start ${e.blockType}${e.initialText ? ' (full)' : ''}`);
      else if (e.kind === 'user') console.log(`  event user: ${short(e.text,80)}`);
      else console.log('  event', e.kind);
    } else if (m.t === 'permission_request') {
      gotPermission = true;
      console.log(`>> PERMISSION REQUEST: ${m.request.title} :: ${short(m.request.detail,100)} (cat=${m.request.category})`);
      ws.send(JSON.stringify({ t: 'permission_response', sessionId: sid, requestId: m.request.requestId, decision: 'allow' }));
    } else if (m.t === 'question_request') {
      gotQuestion = true;
      const q = m.request.questions[0];
      console.log(`>> QUESTION: ${q.question} opts=${q.options.map(o=>o.label).join('|')}`);
      ws.send(JSON.stringify({ t: 'question_response', sessionId: sid, requestId: m.request.requestId, answer: { selections: [[q.options[0].label]] } }));
    } else if (m.t === 'session_state') {
      // console.log('  state', m.meta.state);
    } else if (m.t === 'backlog') {
      console.log(`  backlog ${m.events.length} events`);
    } else if (m.t === 'attached') {
      console.log('  attached');
    } else if (m.t === 'error') {
      console.log('  ERROR', m.message);
    }
  });

  function onResult() {
    if (stage === 'bash') {
      stage = 'ask';
      console.log('--- sending clarification turn ---');
      ws.send(JSON.stringify({ t: 'user_message', sessionId: sid, text: 'Use the ask_user tool to ask me which color I prefer, options Red, Green, Blue. Then just tell me my choice in one short sentence.' }));
    } else if (stage === 'ask') {
      gotAskResult = true;
      finish();
    }
  }

  ws.send(JSON.stringify({ t: 'attach', sessionId: sid }));
  await new Promise((r) => setTimeout(r, 300));
  console.log('--- sending bash turn ---');
  ws.send(JSON.stringify({ t: 'user_message', sessionId: sid, text: 'Run the bash command `cat notes.txt` and tell me the answer it contains.' }));

  const timeout = setTimeout(() => { console.log('TIMEOUT'); finish(); }, 120000);
  function finish() {
    clearTimeout(timeout);
    console.log('\n=== SUMMARY ===');
    console.log('permission_request seen:', gotPermission);
    console.log('tool_result seen:', gotToolResult);
    console.log('question_request seen:', gotQuestion);
    console.log('results seen:', gotResult);
    // delete session
    fetch(`${BASE}/api/sessions/${sid}`, { method: 'DELETE', headers: H }).then(() => { console.log('deleted'); ws.close(); process.exit(0); });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
