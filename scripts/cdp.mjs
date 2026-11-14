/*
 * Minimal DevTools-protocol driver for the Edge instance launched with
 * --remote-debugging-port. No dependencies (Node's built-in fetch + WebSocket).
 *
 *   node scripts/cdp.mjs list
 *   node scripts/cdp.mjs open <url>
 *   node scripts/cdp.mjs eval <url-substring> <expression>
 *   node scripts/cdp.mjs shot <url-substring> <file.png>
 */

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;

async function json(path, options) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Bad response from ${path}: ${text.slice(0, 200)}`);
  }
}

async function list() {
  return json('/json/list');
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

function findTarget(targets, needle) {
  const pages = targets.filter((t) => t.type === 'page');
  const match = pages.find((t) => (t.url || '').includes(needle));
  if (match) return match;
  throw new Error(
    `No page matching "${needle}". Open pages:\n` +
      pages.map((t) => '  ' + t.url).join('\n')
  );
}

async function evaluate(needle, expression) {
  const target = findTarget(await list(), needle);
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluation threw');
    }
    return result.result.value;
  } finally {
    client.close();
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'list': {
      const targets = await list();
      for (const t of targets) console.log(`${t.type.padEnd(16)} ${t.id}  ${t.url}`);
      break;
    }
    case 'open': {
      const created = await json('/json/new?' + encodeURIComponent(rest[0]), { method: 'PUT' });
      console.log(created.url || rest[0]);
      break;
    }
    case 'eval': {
      const value = await evaluate(rest[0], rest[1]);
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
      break;
    }
    case 'go': {
      const target = findTarget(await list(), rest[0]);
      const client = await connect(target.webSocketDebuggerUrl);
      try {
        await client.send('Page.enable');
        await client.send('Page.navigate', { url: rest[1] });
        await new Promise((r) => setTimeout(r, 2500));
        const url = await client.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
        console.log(url.result.value);
      } finally {
        client.close();
      }
      break;
    }
    case 'shot': {
      const target = findTarget(await list(), rest[0]);
      const client = await connect(target.webSocketDebuggerUrl);
      try {
        const shot = await client.send('Page.captureScreenshot', { format: 'png' });
        (await import('node:fs')).writeFileSync(rest[1], Buffer.from(shot.data, 'base64'));
        console.log('wrote ' + rest[1]);
      } finally {
        client.close();
      }
      break;
    }
    default:
      console.error('usage: node scripts/cdp.mjs <list|open|eval|shot> ...');
      process.exit(2);
  }
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exit(1);
});
