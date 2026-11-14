(async () => {
  const tabs = await chrome.tabs.query({ url: ['https://*.etlab.app/*'] });
  const tab = tabs.find((t) => /\/s\//.test(t.url || '')) || tabs[0];
  if (!tab) return 'no etlab tab';

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/engine.js', 'src/wizard.js']
  });

  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const e = globalThis.ETLabEngine;
      if (!e) return { hasEngine: false };
      return {
        hasEngine: true,
        hasWizard: typeof e.wizardFillQuestion === 'function',
        hasListState: typeof e.listState === 'function',
        mode: e.inspect(document).mode,
        steps: e.wizardPlan(document).steps,
        rows: e.wizardPlan(document).rowsPerQuestion,
        hero: e.wizardPlan(document).hero
      };
    }
  });

  return JSON.stringify({ tab: (tab.url || '').slice(0, 42), ...(res.result || {}) });
})()
