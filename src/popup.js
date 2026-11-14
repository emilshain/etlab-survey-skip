/* Popup logic: reads settings, sends one message to the service worker,
 * and prints whatever progress comes back. */

const $ = (id) => document.getElementById(id);

const logEl = $('log');
const fillThisBtn = $('fillThis');
const fillAllBtn = $('fillAll');

let running = false;

function logLine(text, kind) {
  const span = document.createElement('span');
  span.className = kind || '';
  span.textContent = text + '\n';
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

function resetLog(text) {
  logEl.textContent = '';
  if (text) logLine(text);
}

/* Which tab should be filled: the one you are looking at if it is ETLab,
 * otherwise the most recent ETLab tab you have open. */
async function targetTabId() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && /etlab/i.test(active.url || '')) return active.id;

  const tabs = await chrome.tabs.query({
    url: ['https://*.etlab.app/*', 'https://etlab.app/*', 'https://*.etlab.in/*', 'https://etlab.in/*']
  });
  return tabs.length ? tabs[tabs.length - 1].id : undefined;
}

function withTab(message) {
  return targetTabId().then((tabId) => {
    if (typeof tabId === 'number') message.tabId = tabId;
    return message;
  });
}

function options() {
  const strategy = $('strategy').value;
  return {
    strategy,
    answerIndex: Math.max(Number($('answerIndex').value || 1) - 1, 0),
    comment: $('comment').value || 'Good',
    preview: $('preview').checked
  };
}

function setBusy(busy) {
  running = busy;
  fillThisBtn.disabled = busy;
  fillAllBtn.disabled = busy;
}

/* ------------- settings persistence ------------- */

const DEFAULTS = { strategy: 'best', answerIndex: 1, comment: 'Good', preview: false };

async function loadSettings() {
  const saved = await chrome.storage.local.get(DEFAULTS);
  $('strategy').value = saved.strategy;
  $('answerIndex').value = saved.answerIndex;
  $('comment').value = saved.comment;
  $('preview').checked = !!saved.preview;
  $('indexRow').hidden = saved.strategy !== 'index';
}

function saveSettings() {
  chrome.storage.local.set({
    strategy: $('strategy').value,
    answerIndex: Number($('answerIndex').value || 1),
    comment: $('comment').value,
    preview: $('preview').checked
  });
}

/* ------------- actions ------------- */

fillThisBtn.addEventListener('click', async () => {
  if (running) return;
  setBusy(true);
  resetLog('Filling this page…');
  try {
    const res = await chrome.runtime.sendMessage(await withTab({ type: 'RUN_ONE', opts: options() }));
    if (!res || !res.ok) {
      logLine('Failed: ' + ((res && res.error) || 'no response'), 'bad');
      return;
    }
    const r = res.report;

    if (r.mode === 'wizard' && r.preview && r.picks) {
      logLine(`Preview: ${r.questions} question(s), ${r.total} target(s). Nothing was clicked.`, 'ok');
      r.picks.forEach((q) => {
        const labels = [...new Set(q.picks.map((p) => p.label))].filter(Boolean);
        const done = q.picks.filter((p) => p.already).length;
        logLine(`  Q${q.index + 1} ${q.heading ? '— ' + q.heading : ''}`);
        logLine(`     would pick: ${labels.join(' / ') || 'nothing'}${done ? ` (${done} already set)` : ''}`);
      });
      return;
    }

    if (r.mode === 'wizard') {
      logLine(`${r.answered} rating(s) selected across ${r.questions} question(s).`, 'ok');
      logLine(`Progress on the page: ${r.hero || 'unknown'}`);
      if (r.preview) logLine('Preview mode: nothing submitted.');
      else if (r.submitted) logLine(`Clicked "${r.submitLabel}". Check the page for a confirmation.`, 'ok');
      else logLine(r.error || 'Not submitted.', 'bad');
      return;
    }

    (r.log || []).forEach((line) => logLine('  ' + line));
    logLine(
      `${r.answered}/${r.total} question(s) answered, ${r.textFilled} comment box(es) filled.`,
      'ok'
    );
    if (r.preview) logLine('Preview mode: nothing submitted.');
    else if (r.submitted) logLine(`Clicked "${r.submitLabel}". Check the page for a confirmation.`, 'ok');
    else logLine(r.error || 'Not submitted.', 'bad');
  } catch (error) {
    logLine('Failed: ' + error.message, 'bad');
  } finally {
    setBusy(false);
  }
});

fillAllBtn.addEventListener('click', async () => {
  if (running) return;
  setBusy(true);
  resetLog('Looking for pending surveys…');
  try {
    const res = await chrome.runtime.sendMessage(await withTab({ type: 'RUN_ALL', opts: options() }));
    if (!res || !res.ok) logLine('Failed: ' + ((res && res.error) || 'no response'), 'bad');
  } catch (error) {
    logLine('Failed: ' + error.message, 'bad');
    setBusy(false);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'PROGRESS') return;
  if (msg.phase === 'start') logLine(msg.message);
  else if (msg.phase === 'item') logLine(msg.message, msg.ok ? 'ok' : 'bad');
  else if (msg.phase === 'done') {
    logLine(msg.message, 'ok');
    setBusy(false);
  }
});

$('strategy').addEventListener('change', () => {
  $('indexRow').hidden = $('strategy').value !== 'index';
  saveSettings();
});
['answerIndex', 'comment', 'preview'].forEach((id) => $(id).addEventListener('change', saveSettings));

loadSettings();
