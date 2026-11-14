/*
 * Background service worker: runs the engine in tabs.
 *
 * Runs nothing on its own; every fill is triggered by the popup button, and it
 * only ever clicks controls that are already on your page.
 *
 * Two survey layouts are supported:
 *   classic - plain HTML form with radio buttons (src/engine.js)
 *   wizard  - the current students.etlab.app SPA (src/wizard.js)
 */

const ENGINE_FILES = ['src/engine.js', 'src/wizard.js'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Runs an engine function in a tab's isolated world.
 *
 * executeScript args must be JSON-serializable and a literal `undefined`
 * throws "Value is unserializable" - so the payload travels as a JSON string.
 * That makes every value legal, including missing options. */
async function callEngine(tabId, fnName, arg) {
  const payloadJson = JSON.stringify(arg === undefined ? null : arg);
  await chrome.scripting.executeScript({ target: { tabId }, files: ENGINE_FILES });
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name, valueJson) => {
      const engine = globalThis.ETLabEngine;
      if (!engine) return { error: 'engine failed to load' };
      if (typeof engine[name] !== 'function') return { error: 'unknown engine function: ' + name };
      let value = null;
      try {
        value = JSON.parse(valueJson);
      } catch (e) {
        value = null;
      }
      return engine[name](document, value);
    },
    args: [String(fnName), payloadJson]
  });
  return results && results[0] ? results[0].result : null;
}

/* Auto-accept confirm()/alert() so a "Submit survey?" popup can't stall us. */
async function allowDialogs(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        window.confirm = () => true;
        window.alert = () => {};
      }
    });
  } catch (e) {
    // Not fatal: some pages don't use dialogs at all.
  }
}

async function waitForComplete(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (e) {
      throw new Error('tab was closed before it finished loading');
    }
    if (tab.status === 'complete') return tab;
    await sleep(250);
  }
  throw new Error('page load timed out');
}

function progress(payload) {
  chrome.runtime.sendMessage({ type: 'PROGRESS', ...payload }).catch(() => {});
}

/* The popup can pass the tab it wants; otherwise use the active tab, then any
 * ETLab tab (the popup is not always focused on the ETLab tab). */
async function getTargetTab(preferredId) {
  if (typeof preferredId === 'number') {
    try {
      const tab = await chrome.tabs.get(preferredId);
      if (tab && /etlab/i.test(tab.url || '')) return tab;
    } catch (e) {
      // Tab is gone; fall through.
    }
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && /etlab/i.test(active.url || '')) return active;

  const etlabTabs = await chrome.tabs.query({
    url: ['https://*.etlab.app/*', 'https://etlab.app/*', 'https://*.etlab.in/*', 'https://etlab.in/*']
  });
  if (etlabTabs.length) return etlabTabs[etlabTabs.length - 1];

  if (active) return active; // let the caller show a clear message
  throw new Error('No ETLab tab is open. Log in to your college portal first.');
}

/* ---------------------------------------------------------------- *
 * Modern SPA wizard: 20 questions x 8 rating rows
 * ---------------------------------------------------------------- */

async function fillWizard(tabId, opts) {
  await allowDialogs(tabId);

  const plan = await callEngine(tabId, 'wizardPlan');
  if (!plan || plan.error) throw new Error((plan && plan.error) || 'Could not read this survey.');
  if (!plan.questions || !plan.questions.length) throw new Error('No questions found on this survey.');

  progress({
    phase: 'start',
    message: `Survey: ${plan.questions.length} question(s) x ${plan.rowsPerQuestion} target(s) = ${plan.total} rating(s). Starting at ${plan.hero}.`
  });

  /* Preview walks every question and reports what it *would* click. No option
   * is ever clicked, so nothing is recorded on the server - unlike the old
   * preview, which still auto-saved each rating. */
  if (opts.preview) {
    const picks = [];
    for (let i = 0; i < plan.questions.length; i++) {
      const seen = await callEngine(tabId, 'wizardInspectQuestion', { ...opts, index: i });
      if (seen && seen.picks) picks.push(seen);
      progress({
        phase: 'item',
        ok: true,
        message: `Q${i + 1}/${plan.questions.length}: ${(seen && seen.rows) || 0} target(s), nothing clicked`
      });
    }
    return {
      mode: 'wizard',
      questions: plan.questions.length,
      total: plan.total,
      answered: 0,
      hero: plan.hero,
      submitted: false,
      submitLabel: null,
      preview: true,
      picks
    };
  }

  let answered = 0;
  for (let i = 0; i < plan.questions.length; i++) {
    const result = await callEngine(tabId, 'wizardFillQuestion', { ...opts, index: i });
    if (!result || result.error) {
      progress({ phase: 'item', ok: false, message: `Q${i + 1}: ${(result && result.error) || 'no response'}` });
      break;
    }
    answered += result.filled || 0;
    progress({
      phase: 'item',
      ok: true,
      message: `Q${i + 1}/${plan.questions.length}: ${result.filled} selected${result.already ? ', ' + result.already + ' already set' : ''} — ${result.hero}`
    });
  }

  const finish = await callEngine(tabId, 'wizardSubmit', opts);
  return {
    mode: 'wizard',
    questions: plan.questions.length,
    total: plan.total,
    answered,
    hero: (finish && finish.hero) || null,
    submitted: !!(finish && finish.submitted),
    submitLabel: (finish && finish.label) || null,
    preview: !!opts.preview,
    error: finish && finish.error ? finish.error : null
  };
}

async function waitForList(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await callEngine(tabId, 'listState');
    if (state && state.hasList) return state;
    await sleep(300);
  }
  return { hasList: false, pending: 0 };
}

async function openWizard(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await callEngine(tabId, 'inspect');
    if (info && info.mode === 'wizard') return info;
    await sleep(400);
  }
  return null;
}

/* Reload the survey list, open the first pending survey, fill it, submit it,
 * repeat until nothing is pending. Reloading each round means we never lose
 * track of which survey is which. */
/* What a preview run would do, in one line: the distinct picks and how often
 * each one appears. Preview clicks nothing, so its result is never a
 * "submission" - the bulk loop must not treat it as a failure. */
function previewSummary(report, title) {
  const counts = new Map();
  (report.picks || []).forEach((question) =>
    (question.picks || []).forEach((pick) => {
      if (!pick.label) return;
      counts.set(pick.label, (counts.get(pick.label) || 0) + 1);
    })
  );
  const answer =
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => label + " x" + n)
      .join(", ") || "nothing";
  const name = String(title || "").replace(/s+/g, " ").slice(0, 45);
  return (
    "Preview only - \"" + name + "\": " + report.questions + " question(s), " +
    report.total + " rating(s), nothing clicked. Would answer: " + answer + "."
  );
}

async function fillAllWizard(tab, opts) {
  const origin = new URL(tab.url).origin;
  let submitted = 0;
  let failed = 0;
  let consecutive = 0;
  const rounds = 25;

  for (let round = 0; round < rounds; round++) {
    await chrome.tabs.update(tab.id, { url: origin + '/surveys' });
    await waitForComplete(tab.id);
    await sleep(500);

    const state = await waitForList(tab.id);
    if (!state.hasList) {
      progress({ phase: 'done', message: 'Could not read the survey list page.' });
      break;
    }
    if (!state.pending) {
      progress({ phase: 'done', message: `Nothing pending. ${submitted} survey(s) submitted in this run.` });
      break;
    }

    progress({ phase: 'start', message: `Pending: ${state.pending} — opening "${(state.first || '').slice(0, 60)}".` });

    const opened = await callEngine(tab.id, 'wizardOpenCard', { index: 0 });
    if (!opened || opened.error) {
      failed++;
      progress({ phase: 'item', ok: false, message: 'Could not open survey: ' + ((opened && opened.error) || 'unknown') });
      if (++consecutive >= 2) break;
      continue;
    }

    const info = await openWizard(tab.id);
    if (!info) {
      failed++;
      progress({ phase: 'item', ok: false, message: 'Survey page did not open.' });
      continue;
    }

    try {
      const report = await fillWizard(tab.id, opts);
      // A preview is a sample of one survey, not a batch: report it and stop.
      if (opts.preview) {
        progress({ phase: "done", message: previewSummary(report, opened.text) });
        return;
      }

      if (report.submitted) {
        submitted++;
        consecutive = 0;
        progress({ phase: 'item', ok: true, message: `Submitted "${opened.text.slice(0, 45)}" (${report.hero}).` });
      } else {
        failed++;
        progress({
          phase: 'item',
          ok: false,
          message: `Not submitted ("${opened.text.slice(0, 45)}"): ${report.error || 'stopped'}`
        });
        // Keep going with the rest: one bad survey should not abandon the run.
        // Two failures in a row means something systemic (login, markup) - stop.
        if (++consecutive >= 2) break;
        continue;
      }
    } catch (error) {
      failed++;
      progress({ phase: 'item', ok: false, message: 'Error: ' + error.message });
      if (++consecutive >= 2) break;
      continue;
    }

    await sleep(1200);
  }

  progress({
    phase: 'done',
    message: `Finished: ${submitted} submitted, ${failed} failed.`
  });
}

/* ---------------------------------------------------------------- *
 * Classic layout
 * ---------------------------------------------------------------- */

async function fillClassic(tabId, opts) {
  await allowDialogs(tabId);
  const report = await callEngine(tabId, 'run', opts);
  if (!report) throw new Error('The page did not report a result.');
  return { ...report, mode: 'classic' };
}

async function fillAllClassic(active, opts) {
  const links = await callEngine(active.id, 'collectSurveyLinks');
  if (links && links.error) throw new Error(links.error);
  if (!links || !links.length) {
    throw new Error('No survey links found. Open the page that lists your surveys.');
  }

  progress({ phase: 'start', total: links.length, message: `Found ${links.length} survey link(s).` });

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const label = link.text || link.url;

    if (!link.url) {
      skipped++;
      progress({
        phase: 'item',
        index: i + 1,
        total: links.length,
        ok: false,
        message: `Skipped "${label}" - it opens without a direct link. Open it manually and press "Fill this page".`
      });
      continue;
    }

    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url: link.url, active: false, openerTabId: active.id });
      tabId = tab.id;
      await waitForComplete(tabId);
      await allowDialogs(tabId);

      const info = await callEngine(tabId, 'inspect');
      if (!info || !info.looksLikeSurvey) {
        skipped++;
        progress({
          phase: 'item',
          index: i + 1,
          total: links.length,
          ok: false,
          message: `Skipped "${label}" - no questions on that page.`
        });
        continue;
      }

      const report = info.mode === 'wizard' ? await fillWizard(tabId, opts) : await fillClassic(tabId, opts);
      if (report && report.submitted) {
        done++;
        progress({
          phase: 'item',
          index: i + 1,
          total: links.length,
          ok: true,
          message: `Submitted "${label}".`
        });
      } else {
        failed++;
        progress({
          phase: 'item',
          index: i + 1,
          total: links.length,
          ok: false,
          message: `Could not submit "${label}": ${(report && report.error) || 'unknown reason'}.`
        });
      }
    } catch (error) {
      failed++;
      progress({
        phase: 'item',
        index: i + 1,
        total: links.length,
        ok: false,
        message: `Error on "${label}": ${error.message}`
      });
    } finally {
      if (tabId !== null) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          // Tab already closed by the page itself.
        }
      }
    }

    await sleep(600);
  }

  progress({
    phase: 'done',
    total: links.length,
    message: `Finished: ${done} submitted, ${skipped} skipped, ${failed} failed.`
  });
}

/* ---------------------------------------------------------------- *
 * Entry points
 * ---------------------------------------------------------------- */

async function fillCurrent(tabId, opts) {
  const info = await callEngine(tabId, 'inspect');
  if (info && info.error) throw new Error(info.error);
  if (!info || !info.looksLikeSurvey) {
    throw new Error('No survey questions found on this page. Open a survey first.');
  }
  return info.mode === 'wizard' ? await fillWizard(tabId, opts) : await fillClassic(tabId, opts);
}

async function fillAll(opts, preferredTabId) {
  const active = await getTargetTab(preferredTabId);
  if (!/etlab/i.test(active.url || '')) {
    throw new Error('Open your ETLab survey list page first, then press this button.');
  }

  // Modern SPA list ("Pending / Completed" cards)?
  const state = await callEngine(active.id, 'listState');
  if (state && state.hasList) {
    await fillAllWizard(active, opts);
    return;
  }

  await fillAllClassic(active, opts);
}

/* Show how many surveys are waiting on the toolbar icon, so the number is
 * visible without opening the popup. Errors are ignored: the badge is a hint,
 * never a reason to break a page. */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !/etlab/i.test((tab && tab.url) || '')) return;

  try {
    const state = await callEngine(tabId, 'listState');
    const text = state && state.hasList && state.pending ? String(state.pending) : '';
    await chrome.action.setBadgeText({ tabId, text });
    if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#24405e' });
  } catch (error) {
    /* not a survey list, or the tab went away */
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'RUN_ONE') {
    (async () => {
      try {
        const tab = await getTargetTab(msg.tabId);
        const report = await fillCurrent(tab.id, msg.opts || {});
        sendResponse({ ok: true, report });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'RUN_ALL') {
    sendResponse({ ok: true, started: true });
    fillAll(msg.opts || {}, msg.tabId).catch((error) => {
      progress({ phase: 'done', message: `Stopped: ${error.message}` });
    });
    return false;
  }

  return false;
});
