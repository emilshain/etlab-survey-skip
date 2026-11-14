(() => {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const hero = document.querySelector('.sd-hero-summary span');
  const active = document.querySelector('.sd-step-question.active');
  return JSON.stringify({
    path: location.pathname.slice(0, 8),
    hero: hero ? clean(hero.textContent) : null,
    activeStep: active ? clean(active.innerText) : null,
    selectedOnThisQuestion: document.querySelectorAll('.sd-option.active').length,
    nav: Array.from(document.querySelectorAll('.sd-nav-btn')).map((b) => clean(b.innerText)),
    isList: !!document.querySelector('.sv-shell'),
    pendingCards: document.querySelectorAll('button.sv-card .sv-icon-pending').length
  });
})()
