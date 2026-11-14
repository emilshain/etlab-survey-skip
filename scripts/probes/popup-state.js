(() => {
  return JSON.stringify({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    buttons: document.querySelectorAll('button').length,
    hasFillThis: !!document.getElementById('fillThis'),
    hasPreview: !!document.getElementById('preview'),
    hasLog: !!document.getElementById('log'),
    bodyText: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 160),
    chromeApis: typeof chrome !== 'undefined' && chrome.runtime ? Object.keys(chrome.runtime).slice(0, 8) : null
  });
})()
