(() => {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const chain = (el) => {
    const out = [];
    let n = el;
    for (let i = 0; i < 6 && n; i++) {
      out.push(n.tagName + (n.className ? '.' + clean(n.className).split(' ').slice(0, 2).join('.') : ''));
      n = n.parentElement;
    }
    return out.join('  <  ');
  };

  const opts = Array.from(document.querySelectorAll('.sd-option'));
  const card = document.querySelector('.sd-card');

  const buttons = Array.from(document.querySelectorAll('button'));
  const submitLike = buttons
    .map((b) => clean(b.className) + ' :: ' + clean(b.innerText || b.value).slice(0, 40))
    .filter((t) => /submit|finish|complete|done|save|next|continue/i.test(t));

  // How many options sit in the same group as the first one?
  let group = opts[0];
  let groupSize = 0;
  if (group) {
    let node = group.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const n = node.querySelectorAll('.sd-option').length;
      if (n > 0 && n % 5 === 0) {
        group = node;
        groupSize = n;
        break;
      }
      node = node.parentElement;
    }
  }

  return JSON.stringify(
    {
      totalOptions: opts.length,
      groupsOfFive: opts.length / 5,
      groupContainerSize: groupSize,
      groupChain: group ? chain(group) : null,
      firstOptionHTML: opts[0] ? opts[0].outerHTML.slice(0, 400) : null,
      selectedOptions: document.querySelectorAll('.sd-option[aria-pressed="true"], .sd-option.is-selected, .sd-option.selected')
        .length,
      cardHTML: card ? card.outerHTML.slice(0, 3600) : null,
      submitLike,
      tailButtons: buttons.slice(-8).map((b) => clean(b.className) + ' :: ' + clean(b.innerText).slice(0, 30))
    },
    null,
    1
  );
})()
