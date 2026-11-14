(async () => {
  const tabs = await chrome.tabs.query({ url: ['https://*.etlab.app/*'] });
  const t = tabs[tabs.length - 1];
  if (!t) return 'no etlab tab';

  const out = {};
  const tryArgs = async (name, args) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: (a, b) => [a, b],
        args
      });
      out[name] = 'ok';
    } catch (e) {
      out[name] = 'FAIL: ' + e.message.slice(0, 90);
    }
  };

  await tryArgs('nullArg', ['x', null]);
  await tryArgs('objArg', ['x', { index: 0, strategy: 'best', preview: false }]);
  await tryArgs('undefArg', ['x', undefined]);
  await tryArgs('objWithUndef', ['x', { index: 0, tabId: undefined }]);

  return JSON.stringify(out, null, 1);
})()
