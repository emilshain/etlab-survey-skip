/*
 * Evaluates a snippet from a file inside the live page (avoids shell quoting).
 *
 *   node scripts/eval.mjs <snippet-file> [url-substring]
 */

import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const snippetPath = process.argv[2];
const needle = process.argv[3] || 'etlab';

if (!snippetPath) {
  console.error('usage: node scripts/eval.mjs <snippet-file> [url-substring]');
  process.exit(2);
}

async function list() {
  return (await fetch(BASE + '/json/list')).json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function main() {
  const expression = fs.readFileSync(snippetPath, 'utf8');
  const targets = await list();
  const pages = targets.filter((t) => t.type === 'page' || t.type === 'service_worker');
  const page = pages.find((t) => (t.url || '').includes(needle));
  if (!page) {
    console.log('Open pages:\n' + pages.map((t) => '  ' + t.url).join('\n'));
    throw new Error(`no page matching "${needle}"`);
  }

  const client = await connect(page.webSocketDebuggerUrl);
  try {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'threw');
    }
    const value = result.result.value;
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exit(1);
});
