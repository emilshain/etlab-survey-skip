(() => {
  const cards = Array.from(document.querySelectorAll('button.sv-card'));
  if (!cards.length) return 'NO CARDS FOUND';
  const first = cards[0];
  const label = (first.innerText || '').replace(/\s+/g, ' ').slice(0, 60);
  first.click();
  return 'clicked: ' + label + ' (cards: ' + cards.length + ')';
})()
