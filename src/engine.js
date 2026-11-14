/*
 * ETLab Survey Engine
 * -------------------
 * Reads the survey form that is already on the page, picks an answer for every
 * question, fills comment boxes and clicks the real submit button.
 *
 * It never talks to the network on its own and never touches your login: it
 * only clicks the same controls you would click by hand.
 *
 * Exposes: globalThis.ETLabEngine = { run, inspect, collectSurveyLinks }
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Answer scoring
   * ------------------------------------------------------------------ */

  // Higher score = more positive answer. Longer phrases come first so that
  // "very good" (95) beats the "good" (75) inside it.
  var WORDS = [
    ['strongly agree', 100], ['outstanding', 100], ['excellent', 100],
    ['very good', 95], ['highly satisfactory', 92], ['very high', 90], ['always', 90],
    ['agree', 80], ['good', 75], ['often', 70], ['satisfied', 70], ['high', 70],
    ['neutral', 50], ['average', 50], ['moderate', 50], ['satisfactory', 55],
    ['sometimes', 40], ['disagree', 25], ['poor', 20], ['rarely', 15], ['low', 15],
    ['strongly disagree', 5], ['very poor', 5], ['never', 5], ['bad', 15]
  ];

  // Questions where a *lower* number is the "good" answer
  // ("Percentage of class not engaged" -> "< 10%").
  var NEGATIVE_Q = /not engaged|not attend|absent|bunk|missed|irregular|irresponsib|negative|complain|how many (class|day|time)|no of (class|day|time)/i;

  // A <select> that looks like page navigation rather than a survey question.
  var NAV_SELECT = /(^|[_\-\s])(year|sem|semester|dept|department|branch|batch|filter|search|sort|page|college|subject_filter)([_\-\s]|$)/i;

  var TEXT_HINT = /comment|suggest|remark|reason|why|explain|opinion|feedback|message|note/i;

  var SUBMIT_TEXT = /submit|save|finish|done|send|complete|next/i;
  var NOT_SUBMIT = /back|cancel|reset|clear|logout|log out|delete|view|print|download/i;

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function attr(el, name) {
    return el && el.getAttribute ? norm(el.getAttribute(name)) : '';
  }

  // Style-based visibility check. Deliberately avoids offsetParent/getClientRects
  // so the same logic runs in jsdom during tests.
  function isHidden(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden) return true;
      if (attr(node, 'aria-hidden') === 'true') return true;
      var style = node.style || {};
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      var cls = typeof node.className === 'string' ? node.className : '';
      if (/(^|\s)(d-none|hidden|hide|invisible)(\s|$)/i.test(cls)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function usable(el) {
    return !!el && !el.disabled && !isHidden(el);
  }

  function scoreOf(label) {
    var text = norm(label).toLowerCase();
    if (!text) return null;
    var best = null;
    for (var i = 0; i < WORDS.length; i++) {
      if (text.indexOf(WORDS[i][0]) !== -1) {
        if (best === null || WORDS[i][1] > best) best = WORDS[i][1];
      }
    }
    if (best !== null) return best;
    var m = text.match(/-?\d+(\.\d+)?/);
    if (m) return 100 + Number(m[0]); // unmatched numeric labels rank by value
    return null;
  }

  function firstNumber(label) {
    var m = norm(label).match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  /* ------------------------------------------------------------------ *
   * Reading the form
   * ------------------------------------------------------------------ */

  function optionLabel(input) {
    var parts = [];
    try {
      if (input.labels && input.labels.length) {
        for (var i = 0; i < input.labels.length; i++) parts.push(input.labels[i].textContent);
      }
    } catch (e) { /* labels can be unavailable in exotic documents */ }

    if (!parts.length && input.closest) {
      var wrap = input.closest('label');
      if (wrap) parts.push(wrap.textContent);
    }
    if (!parts.length) {
      var sib = input.nextElementSibling;
      if (sib && /^(label|span|div|p|b|strong)$/i.test(sib.tagName)) parts.push(sib.textContent);
      var prev = input.previousElementSibling;
      if (!parts.length && prev && /^(label|span|div|p|b|strong)$/i.test(prev.tagName)) parts.push(prev.textContent);
    }
    if (!parts.length && input.id && input.form && input.form.querySelector) {
      var forLabel = input.form.querySelector('label[for="' + input.id.replace(/"/g, '\\"') + '"]');
      if (forLabel) parts.push(forLabel.textContent);
    }

    parts.push(input.value, attr(input, 'aria-label'), attr(input, 'title'));
    return norm(parts.filter(Boolean).join(' '));
  }

  var containerIds = null;
  function containerKey(el) {
    var node = el.parentElement;
    var guard = 0;
    while (node && guard++ < 8) {
      if (/^(TR|FIELDSET|LI)$/.test(node.tagName)) break;
      var cls = typeof node.className === 'string' ? node.className : '';
      if (/form-group|question|field|row/i.test(cls)) break;
      node = node.parentElement;
    }
    if (!node) return 'root';
    if (!containerIds.has(node)) containerIds.set(node, containerIds.size);
    return String(containerIds.get(node));
  }

  // The question text: the surrounding row/fieldset/group with the answer
  // labels stripped out, so keyword checks aren't confused by option text.
  function questionText(input) {
    var node = input.parentElement;
    var guard = 0;
    while (node && guard++ < 8) {
      if (/^(TR|FIELDSET|LI)$/.test(node.tagName)) break;
      var cls = typeof node.className === 'string' ? node.className : '';
      if (/form-group|question|field|row/i.test(cls)) break;
      node = node.parentElement;
    }
    if (!node) return '';

    var clone = node.cloneNode(true);
    var junk = clone.querySelectorAll('input, select, textarea, button, label');
    for (var i = 0; i < junk.length; i++) {
      if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
    }
    var text = norm(clone.textContent);
    if (text.length > 3) return text.slice(0, 200);

    // Fall back to the row's first cell for table layouts.
    var row = input.closest && input.closest('tr');
    if (row && row.cells && row.cells.length) return norm(row.cells[0].textContent).slice(0, 200);
    return '';
  }

  function radioGroups(doc) {
    containerIds = new Map();
    var radios = [].slice.call(doc.querySelectorAll('input[type="radio"]')).filter(usable);
    var groups = new Map();
    var order = [];
    radios.forEach(function (r) {
      var key = r.name ? 'n:' + r.name : 'p:' + containerKey(r);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key).push(r);
    });
    return order
      .map(function (k) { return groups.get(k); })
      .filter(function (g) { return g.length > 1; });
  }

  function selectFields(doc) {
    return [].slice.call(doc.querySelectorAll('select')).filter(function (s) {
      if (!usable(s)) return false;
      var id = norm(s.id) + ' ' + norm(s.name);
      if (NAV_SELECT.test(id)) return false;
      return s.options && s.options.length > 1;
    });
  }

  function textFields(doc) {
    return [].slice.call(doc.querySelectorAll('textarea, input[type="text"]')).filter(function (el) {
      if (!usable(el)) return false;
      if (el.tagName === 'TEXTAREA') return true;
      var hint = [el.name, el.id, el.placeholder, attr(el, 'aria-label')].join(' ');
      return el.required === true || TEXT_HINT.test(hint);
    });
  }

  function checkboxFields(doc) {
    return [].slice.call(doc.querySelectorAll('input[type="checkbox"]')).filter(function (c) {
      return usable(c) && c.required === true && !c.checked;
    });
  }

  /* ------------------------------------------------------------------ *
   * Writing values
   * ------------------------------------------------------------------ */

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? root.HTMLTextAreaElement && root.HTMLTextAreaElement.prototype
      : root.HTMLInputElement && root.HTMLInputElement.prototype;
    var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new root.Event('input', { bubbles: true }));
    el.dispatchEvent(new root.Event('change', { bubbles: true }));
  }

  function clickRadio(input) {
    input.click();
    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new root.Event('click', { bubbles: true }));
      input.dispatchEvent(new root.Event('change', { bubbles: true }));
    }
  }

  function pickOption(inputs, strategy, opts) {
    var candidates = inputs.map(function (input, index) {
      var label = optionLabel(input);
      return { input: input, label: label, index: index, score: scoreOf(label), num: firstNumber(label) };
    });

    if (strategy === 'first') return candidates[0];
    // "Normal"/middle answer: whichever option sits in the middle of the list,
    // which lands on Good/Average for a 5-point scale and Neutral for a 4-point one.
    if (strategy === 'average' || strategy === 'middle') {
      return candidates[Math.floor(candidates.length / 2)];
    }
    if (strategy === 'random') {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (strategy === 'index') {
      var wanted = Math.min(Math.max(Number(opts && opts.answerIndex) || 0, 0), candidates.length - 1);
      return candidates[wanted];
    }

    // "best": most positive label, or the smallest number for negatively
    // worded questions.
    var negative = NEGATIVE_Q.test(opts && opts.question);
    if (negative) {
      var withNum = candidates.filter(function (c) { return c.num !== null; });
      if (withNum.length) {
        return withNum.reduce(function (a, b) { return b.num < a.num ? b : a; });
      }
    }
    var scored = candidates.filter(function (c) { return c.score !== null; });
    if (!scored.length) return candidates[0];
    return scored.reduce(function (a, b) {
      if (b.score > a.score) return b;
      if (b.score === a.score && b.index < a.index) return b;
      return a;
    });
  }

  function pickSelectOption(select, strategy, question) {
    var options = [].slice.call(select.options).filter(function (o) {
      if (o.disabled) return false;
      var t = norm(o.textContent).toLowerCase();
      return o.value !== '' && t !== '' && !/^(-{2,}|select|choose|please select)/.test(t);
    });
    if (!options.length) return null;
    if (strategy === 'first') return options[0];
    if (strategy === 'average' || strategy === 'middle') {
      return options[Math.floor(options.length / 2)];
    }
    if (strategy === 'random') return options[Math.floor(Math.random() * options.length)];
    if (strategy === 'index') {
      return options[Math.min(Number(question && question.answerIndex) || 0, options.length - 1)];
    }
    var negative = NEGATIVE_Q.test(question && question.text);
    var scored = options.map(function (o) {
      return { option: o, label: norm(o.textContent), score: scoreOf(o.textContent), num: firstNumber(o.textContent) };
    });
    if (negative) {
      var nums = scored.filter(function (s) { return s.num !== null; });
      if (nums.length) {
        return nums.reduce(function (a, b) { return b.num < a.num ? b : a; }).option;
      }
    }
    var valid = scored.filter(function (s) { return s.score !== null; });
    if (!valid.length) return options[0];
    return valid.reduce(function (a, b) { return b.score > a.score ? b : a; }).option;
  }

  /* ------------------------------------------------------------------ *
   * Submit button
   * ------------------------------------------------------------------ */

  function findSubmit(doc) {
    var forms = [].slice.call(doc.querySelectorAll('form'));
    var surveyForm = forms.filter(function (f) {
      return f.querySelector('input[type="radio"], textarea, select');
    })[0];

    var scope = surveyForm || doc;
    var candidates = [].slice.call(
      scope.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a.button')
    ).filter(usable);

    var best = null;
    var bestRank = -1;
    candidates.forEach(function (el) {
      var label = el.tagName === 'INPUT' ? (attr(el, 'value') || el.value) : el.textContent;
      label = norm(label);
      if (!label || NOT_SUBMIT.test(label) || !SUBMIT_TEXT.test(label)) return;
      var rank = 1;
      if (/submit|save|finish|complete/i.test(label)) rank = 2;
      if (/submit/i.test(label)) rank = 3;
      var isSubmitType = el.tagName === 'BUTTON'
        ? (attr(el, 'type') || 'submit').toLowerCase() === 'submit'
        : attr(el, 'type').toLowerCase() === 'submit';
      if (isSubmitType) rank += 1;
      if (rank > bestRank) {
        best = el;
        bestRank = rank;
      }
    });
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var DEFAULT_COMMENT = 'Good';

  function inspect(doc) {
    containerIds = new Map();

    // Modern students.etlab.app survey screen: no <input> at all, just
    // .sd-option buttons inside .sd-options-row, driven question by question.
    var wizardOptions = doc.querySelectorAll('.sd-options-row .sd-option').length;
    if (wizardOptions) {
      var stepButtons = doc.querySelectorAll('.sd-step-question').length;
      var rows = doc.querySelectorAll('.sd-options-row').length;
      var heading = doc.querySelector('.sd-card h3');
      return {
        mode: 'wizard',
        looksLikeSurvey: true,
        questions: stepButtons || rows,
        rowsPerQuestion: rows,
        total: (stepButtons || 1) * rows,
        heading: norm(heading ? heading.textContent : '').slice(0, 120),
        selects: 0,
        textBoxes: 0,
        submitLabel: 'Finish Survey'
      };
    }

    var groups = radioGroups(doc);
    return {
      mode: groups.length ? 'classic' : 'none',
      looksLikeSurvey: groups.length > 0,
      questions: groups.length,
      selects: selectFields(doc).length,
      textBoxes: textFields(doc).length,
      submitLabel: (function () {
        var b = findSubmit(doc);
        if (!b) return null;
        return norm(b.tagName === 'INPUT' ? attr(b, 'value') : b.textContent);
      })()
    };
  }

  function run(doc, opts) {
    opts = opts || {};
    var strategy = opts.strategy || 'best';
    var preview = !!opts.preview;
    var comment = opts.comment || DEFAULT_COMMENT;
    var log = [];

    containerIds = new Map();

    var report = {
      total: 0,
      answered: 0,
      unanswered: [],
      textFilled: 0,
      checkboxesTicked: 0,
      submitted: false,
      submitLabel: null,
      preview: preview,
      log: log
    };

    // 1. Radio questions
    var groups = radioGroups(doc);
    report.total = groups.length;

    groups.forEach(function (inputs) {
      var question = questionText(inputs[0]);
      var already = inputs.filter(function (r) { return r.checked; })[0];
      if (already) {
        report.answered++;
        return;
      }
      var choice = pickOption(inputs, strategy, { question: question, answerIndex: opts.answerIndex });
      if (choice) {
        clickRadio(choice.input);
        report.answered++;
        log.push('Q: ' + (question || '(unlabeled)').slice(0, 70) + ' -> ' + (choice.label || '(no label)'));
      }
    });

    // 2. Dropdown questions
    selectFields(doc).forEach(function (select) {
      var question = questionText(select);
      if (select.value && select.selectedIndex > 0) return;
      var option = pickSelectOption(select, strategy, { text: question, answerIndex: opts.answerIndex });
      if (!option) return;
      select.value = option.value;
      select.dispatchEvent(new root.Event('change', { bubbles: true }));
      log.push('Select: ' + (question || norm(select.name) || '(unlabeled)').slice(0, 70) + ' -> ' + norm(option.textContent));
    });

    // 3. Comment boxes (only when empty, so nothing you typed is overwritten)
    textFields(doc).forEach(function (el) {
      if (norm(el.value)) return;
      setNativeValue(el, comment);
      report.textFilled++;
    });

    // 4. Required checkboxes (e.g. "I have read the instructions")
    checkboxFields(doc).forEach(function (cb) {
      cb.click();
      if (!cb.checked) cb.checked = true;
      report.checkboxesTicked++;
    });

    // 5. Verify nothing is left blank before submitting
    radioGroups(doc).forEach(function (inputs) {
      if (!inputs.some(function (r) { return r.checked; })) {
        report.unanswered.push(questionText(inputs[0]) || '(unlabeled question)');
      }
    });

    var submit = findSubmit(doc);
    report.submitLabel = submit ? norm(submit.tagName === 'INPUT' ? attr(submit, 'value') : submit.textContent) : null;

    if (preview) {
      report.submitted = false;
      return report;
    }
    if (!submit) {
      report.error = 'No submit button found on this page.';
      return report;
    }
    if (report.unanswered.length) {
      report.error = 'Refused to submit: ' + report.unanswered.length + ' question(s) still unanswered.';
      return report;
    }

    submit.click();
    report.submitted = true;
    return report;
  }

  // Links that look like pending surveys, used by "Complete all pending".
  function collectSurveyLinks(doc) {
    var out = [];
    var seen = {};
    var nodes = [].slice.call(doc.querySelectorAll('a[href], [onclick]'));

    nodes.forEach(function (el) {
      var text = norm(el.textContent);
      if (!text || text.length > 90) return;
      if (/(submitted|completed|done|already|view response|response)$/i.test(text)) return;
      if (!/survey|feedback|evaluat|questionnaire/i.test(text + ' ' + attr(el, 'href'))) return;

      var href = attr(el, 'href');
      var url = '';
      if (href && !/^javascript:/i.test(href) && href !== '#') {
        try {
          url = new URL(href, doc.location ? doc.location.href : 'https://students.etlab.app/').href;
        } catch (e) { return; }
      }
      var key = url || text;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ text: text, url: url });
    });

    return out.slice(0, 60);
  }

  root.ETLabEngine = {
    run: run,
    inspect: inspect,
    collectSurveyLinks: collectSurveyLinks,
    findSubmit: findSubmit,
    _internals: { scoreOf: scoreOf, optionLabel: optionLabel, questionText: questionText, pickOption: pickOption }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
