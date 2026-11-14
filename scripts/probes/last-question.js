(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const steps = Array.from(document.querySelectorAll('.sd-step-question'));
  if (!steps.length) return 'NO STEPS';
  const last = steps[steps.length - 1];
  last.click();
  await sleep(1200);

  const buttons = Array.from(document.querySelectorAll('button'));
  return JSON.stringify(
    {
      steps: steps.length,
      activeStep: clean((document.querySelector('.sd-step-question.active') || {}).innerText),
      questionHeading: clean((document.querySelector('.sd-card h3') || {}).textContent).slice(0, 120),
      navButtons: buttons
        .filter((b) => /sd-nav-btn|submit|finish/i.test(clean(b.className)))
        .map((b) => clean(b.className) + ' :: ' + clean(b.innerText).slice(0, 40)),
      submitCandidates: buttons
        .map((b) => clean(b.innerText || b.value))
        .filter((t) => /submit|finish|complete/i.test(t))
        .slice(0, 10),
      optionRows: document.querySelectorAll('.sd-options-row').length,
      hero: clean((document.querySelector('.sd-hero-summary span') || {}).textContent),
      saveStates: Array.from(document.querySelectorAll('.sd-save-state')).slice(0, 3).map(clean)
    },
    null,
    1
  );
})()
