/*
 * Drives the real extension popup (opened as a page so it can be tested):
 *
 *   node scripts/drive-popup.mjs preview   # fill, don't submit
 *   node scripts/drive-popup.mjs one       # fill + submit the open survey
 *   node scripts/drive-popup.mjs all       # fill + submit every pending survey
 */

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const mode = process.argv[2] || 'preview';
const timeoutMs = Number(process.argv[3] || 300000);

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

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'threw');
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await list();
  const worker = targets.find((t) => /\/src\/background\.js$/.test(t.url || ''));
  // The MV3 service worker is dormant until something talks to it, so fall back
  // to the deterministic unpacked-extension id for this folder.
  const extensionId = worker
    ? new URL(worker.url).host
    : process.env.EXT_ID || 'cphpnnngbnecjllcieidpmkbdgolmbed';
  console.log('extension: ' + extensionId + (worker ? ' (worker running)' : ' (worker dormant)'));

  const popupUrl = `chrome-extension://${extensionId}/src/popup.html`;
  let popup = targets.find((t) => t.type === 'page' && (t.url || '').includes('/src/popup.html'));
  if (!popup) {
    await fetch(BASE + '/json/new?' + encodeURIComponent(popupUrl), { method: 'PUT' });
    for (let i = 0; i < 20 && !popup; i++) {
      await sleep(300);
      popup = (await list()).find((t) => t.type === 'page' && (t.url || '').includes('/src/popup.html'));
    }
  }
  if (!popup) throw new Error('could not open the popup page');

  const client = await connect(popup.webSocketDebuggerUrl);
  try {
    await sleep(500);

    const start = await evaluate(
      client,
      `(() => {
         const p = document.getElementById('preview');
         const wantPreview = ${mode === 'preview'};
         if (p && p.checked !== wantPreview) p.click();
         const btn = document.getElementById('${mode === 'all' ? 'fillAll' : 'fillThis'}');
         if (!btn) return 'no button';
         document.getElementById('log').textContent = '';
         btn.click();
         return 'clicked ' + btn.id + ' preview=' + (p ? p.checked : 'n/a');
       })()`
    );
    console.log(start);

    const deadline = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < deadline) {
      await sleep(1500);
      const log = await evaluate(client, `document.getElementById('log').innerText`);
      if (log !== last) {
        const fresh = log.slice(last.length);
        if (fresh.trim()) process.stdout.write(fresh);
        last = log;
      }
      const finished =
        /Preview mode|Clicked "|^Failed|Stopped:|Not submitted|Finished:/m.test(log) && !/…$/.test(log.trim());
      const stillStarting = /^(Filling|Looking)/.test(log.trim());
      if (finished && !stillStarting) break;
    }

    console.log('\n--- final popup log ---');
    console.log(await evaluate(client, `document.getElementById('log').innerText`));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exit(1);
});
