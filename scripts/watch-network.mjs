/*
 * Opens the portal's calendar screen and records the API calls it makes,
 * including a sample of each response body.
 *
 *   node scripts/watch-network.mjs [path] [seconds]
 */

import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
// Strip any leading slashes: Git Bash rewrites "/calendar" into a Windows path.
const targetPath = '/' + String(process.argv[2] || 'calendar').replace(/^[\\/]+/, '').replace(/^.*(?:^|[\\/])git[\\/]/, '');
const seconds = Number(process.argv[3] || 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const handlers = [];

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (msg.id) {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method) handlers.forEach((h) => h(msg));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, on: (fn) => handlers.push(fn), close: () => ws.close() };
}

async function main() {
  const targets = await list();
  const pages = targets.filter((t) => t.type === 'page');
  const page = pages.find((t) => /students\.etlab\.app/.test(t.url || ''));
  if (!page) throw new Error('no ETLab page open');

  const client = await connect(page.webSocketDebuggerUrl);
  const requests = new Map();
  const statuses = new Map();

  client.on((msg) => {
    if (msg.method === 'Network.requestWillBeSent') {
      const r = msg.params.request;
      requests.set(msg.params.requestId, {
        url: r.url,
        method: r.method,
        type: msg.params.type,
        headers: r.headers
      });
    }
    if (msg.method === 'Network.responseReceived') {
      statuses.set(msg.params.requestId, {
        status: msg.params.response.status,
        mime: msg.params.response.mimeType
      });
    }
  });

  try {
    await client.send('Network.enable', {});
    await client.send('Page.enable', {});
    await client.send('Page.navigate', { url: 'https://students.etlab.app' + targetPath });
    await sleep(seconds * 1000);
  } finally {
    client.close();
  }

  const interesting = [];
  for (const [id, req] of requests) {
    if (req.type && !/XHR|Fetch|Document/.test(req.type)) continue;
    const st = statuses.get(id) || {};
    interesting.push({
      method: req.method,
      url: req.url,
      type: req.type,
      status: st.status,
      mime: st.mime,
      authHeader: req.headers && req.headers.Authorization ? 'present' : 'none',
      instituteHeader: req.headers && req.headers['X-Institute-ID'] ? 'present' : 'none'
    });
  }

  console.log(JSON.stringify({ count: interesting.length, requests: interesting.slice(0, 40) }, null, 1));
  fs.writeFileSync('.tmp-cal/network.json', JSON.stringify(interesting, null, 1));
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exit(1);
});
