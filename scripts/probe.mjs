/*
 * Reads the live ETLab page through the real engine and prints what it finds.
 * Read-only: it never clicks submit.
 *
 *   node scripts/probe.mjs [url-substring]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const needle = process.argv[2] || 'etlab';

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

async function evaluateOn(target, expression) {
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

const REPORT = `(() => {
  const engine = globalThis.ETLabEngine;
  const internals = engine._internals;

  const groups = [];
  const seen = new Set();
  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    if (input.disabled) return;
    const key = input.name || '(unnamed)';
    if (seen.has(key)) return;
    seen.add(key);
    const same = Array.from(document.querySelectorAll('input[type="radio"]')).filter(
      (r) => (r.name || '') === (input.name || '') && r.closest('tr,fieldset,li,.form-group') === input.closest('tr,fieldset,li,.form-group')
    );
    groups.push({
      name: key,
      question: internals.questionText(input).slice(0, 90),
      options: same.slice(0, 6).map((r) => internals.optionLabel(r).slice(0, 28))
    });
  });

  const body = (document.body && document.body.innerText) || '';
  return JSON.stringify({
    url: location.href,
    title: document.title,
    inspect: engine.inspect(document),
    groups: groups.slice(0, 12),
    groupCount: groups.length,
    links: engine.collectSurveyLinks(document).slice(0, 15),
    pageMentionsSurvey: /survey|feedback|evaluat|questionnaire/i.test(body),
    bodySnippet: body.replace(/\\s+/g, ' ').slice(0, 300)
  }, null, 1);
})()`;

async function main() {
  const targets = await list();
  const pages = targets.filter((t) => t.type === 'page');
  const page = pages.find((t) => (t.url || '').includes(needle));
  if (!page) {
    console.log('Open pages:\n' + pages.map((t) => '  ' + t.url).join('\n'));
    throw new Error(`no page matching "${needle}"`);
  }

  const engineSrc = fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8');
  await evaluateOn(page, engineSrc);
  console.log(await evaluateOn(page, REPORT));
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exit(1);
});
