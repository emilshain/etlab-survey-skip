(async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'PING' });
    return 'ok';
  } catch (e) {
    return 'woke: ' + e.message.slice(0, 60);
  }
})()
