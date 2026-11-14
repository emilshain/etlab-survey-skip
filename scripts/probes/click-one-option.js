(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const row = document.querySelector('.sd-options-row');
  if (!row) return 'NO OPTIONS ROW';
  const before = {
    progress: clean((document.querySelector('.sd-question-progress strong') || {}).textContent),
    hero: clean((document.querySelector('.sd-hero-summary span') || {}).textContent)
  };

  const excellent = row.querySelector('.sd-option');
  const label = clean(excellent.innerText);
  excellent.click();
  await sleep(1500);

  return JSON.stringify(
    {
      clicked: label,
      before,
      afterProgress: clean((document.querySelector('.sd-question-progress strong') || {}).textContent),
      afterHero: clean((document.querySelector('.sd-hero-summary span') || {}).textContent),
      optionStates: Array.from(row.querySelectorAll('.sd-option')).map((o) =>
        clean(o.className) + ' | pressed=' + (o.getAttribute('aria-pressed') || '-') + ' | ' + clean(o.innerText)
      ),
      saveState: clean((row.parentElement.querySelector('.sd-save-state') || {}).textContent),
      stepActiveClasses: Array.from(document.querySelectorAll('.sd-step-question'))
        .slice(0, 3)
        .map((s) => clean(s.className))
    },
    null,
    1
  );
})()
