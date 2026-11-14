/*
 * ETLab Survey Engine - modern survey UI ("sd-" layout)
 * -----------------------------------------------------
 * The current students.etlab.app survey screen is a single-page wizard:
 *
 *   .sd-step-question        one button per question (Q1 … Q20)
 *   .sd-card h3              the question being shown
 *   .sd-faculty-row          one teacher/course target
 *   .sd-options-row          ../../.. the five .sd-option buttons for that target
 *   .sd-option.active        the option that is currently selected
 *   .sd-nav-btn.primary      "Next Question" … "Finish Survey" on the last one
 *
 * There are no <input type="radio"> elements at all, which is why the classic
 * engine finds nothing here. This module clicks the real buttons instead.
 *
 * Exposes: globalThis.ETLabEngine.wizard*
 */
(function (root) {
  'use strict';

  var engine = root.ETLabEngine;
  if (!engine) return;

  var clean = function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  };
  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  /* React owns these clicks, so the DOM updates a frame or two later. Waiting
   * for the change is faster than a fixed sleep on a quick page and safer than
   * one on a slow page. Resolves false if the deadline passes. */
  function waitUntil(check, timeoutMs, stepMs) {
    var deadline = Date.now() + (timeoutMs || 600);
    return new Promise(function (resolve) {
      (function loop() {
        if (check()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(loop, stepMs || 40);
      })();
    });
  }

  function isWizard(doc) {
    return !!doc.querySelector('.sd-options-row .sd-option');
  }

  function steps(doc) {
    return Array.prototype.slice.call(doc.querySelectorAll('.sd-step-question'));
  }

  function heroText(doc) {
    var el = doc.querySelector('.sd-hero-summary span');
    return clean(el ? el.textContent : '');
  }

  /* Options are labelled "Excellent 5" … "Poor 1". The trailing number is the
   * reliable ordering, so prefer it over the word score. */
  function rankOf(text) {
    var m = clean(text).match(/(\d+)\s*$/);
    if (m) return Number(m[1]);
    var score = engine._internals.scoreOf(text);
    return score === null ? 0 : score / 20;
  }

  /* Negatively worded questions want the lowest number, not the highest:
   * "Percentage of class not engaged" -> "< 10 %". Same rule set as the
   * classic engine so both layouts answer consistently. */
  var NEGATIVE_Q = /not engaged|not attend|absent|bunk|missed|irregular|irresponsib|negative|complain|how many (class|day|time)|no of (class|day|time)/i;

  function plan(doc) {
    var s = steps(doc);
    var rows = doc.querySelectorAll('.sd-options-row').length;
    return {
      mode: 'wizard',
      steps: s.length,
      rowsPerQuestion: rows,
      total: s.length * rows,
      hero: heroText(doc),
      questions: s.map(function (btn, i) {
        return {
          index: i,
          label: clean(btn.innerText || btn.textContent) || 'Q' + (i + 1),
          text: clean(btn.getAttribute('aria-label')).slice(0, 120)
        };
      })
    };
  }

  async function gotoStep(doc, index) {
    var all = steps(doc);
    var btn = all[index];
    if (!btn) throw new Error('Question ' + (index + 1) + ' is not on this page.');

    var name = clean(btn.innerText || btn.textContent);
    if (!btn.classList.contains('active')) btn.click();

    return await waitUntil(function () {
      var active = doc.querySelector('.sd-step-question.active');
      return !!active && clean(active.innerText || active.textContent) === name;
    }, 2000, 50);
  }

  function pickIn(row, strategy, answerIndex, questionText) {
    var options = Array.prototype.slice.call(row.querySelectorAll('.sd-option'));
    if (!options.length) return null;
    if (strategy === 'first') return options[0];
    // "Normal"/middle answer: the option in the middle of the row ("Good 3" on
    // the five-point Excellent…Poor scale).
    if (strategy === 'average' || strategy === 'middle') {
      return options[Math.floor(options.length / 2)];
    }
    if (strategy === 'random') return options[Math.floor(Math.random() * options.length)];
    if (strategy === 'index') {
      return options[Math.min(Math.max(Number(answerIndex) || 0, 0), options.length - 1)];
    }

    var negative = NEGATIVE_Q.test(questionText || '');
    var best = null;
    var bestRank = negative ? Infinity : -1;
    options.forEach(function (opt) {
      var rank = rankOf(opt.innerText || opt.textContent);
      var better = negative ? rank < bestRank : rank > bestRank;
      if (better) {
        bestRank = rank;
        best = opt;
      }
    });
    return best || options[0];
  }

  async function fillQuestion(doc, opts) {
    opts = opts || {};
    var index = Number(opts.index) || 0;
    var strategy = opts.strategy || 'best';
    var answerIndex = opts.answerIndex || 0;

    var navigated = await gotoStep(doc, index);
    await sleep(150);

    var headingEl = doc.querySelector('.sd-card h3');
    var questionText = clean(headingEl ? headingEl.textContent : '');

    var rows = Array.prototype.slice.call(doc.querySelectorAll('.sd-options-row'));
    var filled = 0;
    var already = 0;
    var retried = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.querySelector('.sd-option.active')) {
        already++;
        continue;
      }
      var choice = pickIn(row, strategy, answerIndex, questionText);
      if (!choice) continue;
      choice.click();
      filled++;
      var settled = await waitUntil(function () {
        return !!row.querySelector('.sd-option.active');
      }, 600, 40);

      // A click can land while React is mid-render and be lost. One retry is
      // cheap and turns a stuck rating into a recovered one.
      if (!settled) {
        retried++;
        choice.click();
        await waitUntil(function () {
          return !!row.querySelector('.sd-option.active');
        }, 800, 40);
      }
    }

    // Wait for "Saving…" to clear (max ~4s) so the next question starts clean.
    for (var t = 0; t < 20; t++) {
      var saving = Array.prototype.slice.call(doc.querySelectorAll('.sd-save-state')).some(function (el) {
        return /saving/i.test(clean(el.textContent));
      });
      if (!saving) break;
      await sleep(200);
    }

    var progress = doc.querySelector('.sd-question-progress strong');
    return {
      index: index,
      navigated: navigated,
      rows: rows.length,
      filled: filled,
      already: already,
      retried: retried,
      heading: questionText.slice(0, 120),
      questionProgress: clean(progress ? progress.textContent : ''),
      hero: heroText(doc)
    };
  }

  /* What would be chosen on a question, without clicking a single option: only
   * the step navigation happens, so nothing is recorded on the server. */
  async function inspectQuestion(doc, opts) {
    opts = opts || {};
    var index = Number(opts.index) || 0;
    var navigated = await gotoStep(doc, index);
    var rows = Array.prototype.slice.call(doc.querySelectorAll('.sd-options-row'));
    var headingEl = doc.querySelector('.sd-card h3');
    var questionText = clean(headingEl ? headingEl.textContent : '');

    return {
      index: index,
      navigated: navigated,
      heading: questionText.slice(0, 90),
      rows: rows.length,
      picks: rows.map(function (row) {
        var choice = pickIn(row, opts.strategy || 'best', opts.answerIndex || 0, questionText);
        var active = row.querySelector('.sd-option.active');
        return {
          label: clean(choice ? choice.innerText || choice.textContent : ''),
          already: clean(active ? active.innerText || active.textContent : '')
        };
      })
    };
  }

  function findFinish(doc) {
    var buttons = Array.prototype.slice.call(doc.querySelectorAll('button, a[role="button"]'));
    var matches = buttons.filter(function (b) {
      return !b.disabled && /submit|finish|complete/i.test(clean(b.innerText || b.value));
    });
    var primary = matches.filter(function (b) {
      return /primary/i.test(clean(b.className));
    })[0];
    return primary || matches[0] || null;
  }

  async function submit(doc, opts) {
    opts = opts || {};
    var btn = findFinish(doc);
    if (!btn) {
      return {
        submitted: false,
        label: null,
        hero: heroText(doc),
        error: 'No "Finish Survey"/Submit button here. Open the last question, then run it again.'
      };
    }

    var label = clean(btn.innerText || btn.value);
    if (opts.preview) {
      return { submitted: false, label: label, hero: heroText(doc), preview: true };
    }

    btn.click();
    await sleep(2000);
    return {
      submitted: true,
      label: label,
      hero: heroText(doc),
      url: doc.location ? doc.location.href : '',
      body: clean(doc.body ? doc.body.innerText : '').slice(0, 200)
    };
  }

  /* -------- survey list page (button.sv-card) -------- */

  function pendingCards(doc) {
    var cards = Array.prototype.slice.call(doc.querySelectorAll('button.sv-card'));
    return cards
      .map(function (card, index) {
        return {
          index: index,
          text: clean(card.innerText || card.textContent).slice(0, 90),
          pending: !!card.querySelector('.sv-icon-pending') || /pending/i.test(clean(card.getAttribute('aria-label')))
        };
      })
      .filter(function (c) {
        return c.pending;
      });
  }

  function listState(doc) {
    var cards = doc.querySelectorAll('button.sv-card');
    var pending = pendingCards(doc);
    return {
      hasList: !!doc.querySelector('.sv-shell, .sv-list, button.sv-card'),
      cards: cards.length,
      pending: pending.length,
      first: pending.length ? pending[0].text : null,
      text: clean(doc.body ? doc.body.innerText : '').slice(0, 180)
    };
  }

  function openCard(doc, opts) {
    var pending = pendingCards(doc);
    var wanted = pending[Number(opts && opts.index) || 0];
    if (!wanted) return { error: 'No pending survey card found.' };

    var cards = doc.querySelectorAll('button.sv-card');
    var card = cards[wanted.index];
    if (!card) return { error: 'Survey card disappeared.' };

    card.click();
    return { opened: true, text: wanted.text, remaining: pending.length };
  }

  engine.wizardInternals = { rankOf: rankOf, pickIn: pickIn };
  engine.wizardIs = isWizard;
  engine.wizardPlan = plan;
  engine.wizardFillQuestion = fillQuestion;
  engine.wizardInspectQuestion = inspectQuestion;
  engine.wizardSubmit = submit;
  engine.wizardPendingCards = pendingCards;
  engine.wizardOpenCard = openCard;
  engine.listState = listState;
})(typeof globalThis !== 'undefined' ? globalThis : this);
