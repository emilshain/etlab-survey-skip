(() => {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const buttons = Array.from(document.querySelectorAll('button')).map((b) =>
    [
      clean(b.className).slice(0, 46),
      'txt=' + clean(b.innerText || b.value).slice(0, 30),
      b.getAttribute('aria-pressed') !== null ? 'pressed=' + b.getAttribute('aria-pressed') : '',
      b.getAttribute('role') ? 'role=' + b.getAttribute('role') : '',
      b.getAttribute('aria-checked') !== null ? 'checked=' + b.getAttribute('aria-checked') : '',
      b.disabled ? 'disabled' : ''
    ]
      .filter(Boolean)
      .join(' | ')
  );

  const roleRadios = document.querySelectorAll('[role="radio"]').length;
  const roleRadioGroups = document.querySelectorAll('[role="radiogroup"]').length;

  // The element that holds the currently visible question text.
  const leaf = Array.from(document.querySelectorAll('*')).find(
    (e) => e.children.length === 0 && /Teacher is regular/i.test(e.textContent)
  );
  let panel = '';
  if (leaf) {
    let node = leaf;
    for (let i = 0; i < 6 && node.parentElement; i++) node = node.parentElement;
    panel = node.outerHTML.slice(0, 5000);
  }

  return JSON.stringify(
    {
      url: location.pathname.slice(0, 12) + '…',
      roleRadios,
      roleRadioGroups,
      inputCount: document.querySelectorAll('input').length,
      inputs: Array.from(document.querySelectorAll('input')).slice(0, 12).map((i) => i.type + ':' + i.name + ':' + i.value),
      buttons: buttons.slice(0, 45),
      panel
    },
    null,
    1
  );
})()
