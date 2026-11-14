(() => {
  const items = [];
  const seen = new Set();
  document.querySelectorAll('a, button, [onclick], [role="button"]').forEach((el) => {
    const text = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const line = [
      el.tagName,
      'href=' + (el.getAttribute('href') || '-'),
      'cls=' + String(el.className || '').slice(0, 40),
      'txt=' + (text || '-')
    ].join(' | ');
    if (text && !seen.has(line)) {
      seen.add(line);
      items.push(line);
    }
  });

  const containers = [];
  document.querySelectorAll('div, section, ul, table').forEach((el) => {
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (/pending|survey|course|exit/i.test(t) && t.length < 400 && el.children.length > 1) {
      containers.push('<' + el.tagName + ' class="' + String(el.className || '').slice(0, 60) + '"> ' + t.slice(0, 200));
    }
  });

  return JSON.stringify(
    {
      url: location.href,
      clickables: items.slice(0, 40),
      containers: containers.slice(0, 12),
      html: (document.querySelector('main') || document.body).innerHTML.slice(0, 3000)
    },
    null,
    1
  );
})()
