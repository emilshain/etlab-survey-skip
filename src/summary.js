/*
 * Preview summary
 * ---------------
 * Turns the report from a preview run into one readable line.
 *
 * The report comes from fillWizard's preview branch:
 *
 *   { questions: 20, total: 160, picks: [
 *       { index: 0, heading: '...', rows: 8, picks: [{ label, already }, ...] } ] }
 *
 * Every field is treated as optional: a report that is missing one degrades to
 * whatever the rest of it can prove, instead of printing "undefined" at the
 * user. test/summary.test.mjs builds a report with the real engine and asserts
 * the fields this relies on exist.
 *
 * Exposes: globalThis.ETLabSummary = { previewSummary }
 */
(function (root) {
  'use strict';

  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function previewSummary(report, title) {
    report = report || {};

    var questions = Array.isArray(report.picks) ? report.picks : [];
    var counts = new Map();
    var ratings = 0;

    questions.forEach(function (question) {
      var picks = (question && question.picks) || [];
      picks.forEach(function (pick) {
        ratings++;
        if (pick && pick.label) counts.set(pick.label, (counts.get(pick.label) || 0) + 1);
      });
    });

    var questionCount = num(report.questions, questions.length);
    var total = num(report.total, ratings);
    var name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 45);

    var answer = Array.from(counts.entries())
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (entry) { return entry[0] + ' x' + entry[1]; })
      .join(', ');

    if (!answer) answer = 'nothing readable';

    return (
      'Preview only - "' + (name || 'this survey') + '": ' +
      questionCount + ' question(s), ' + total + ' rating(s), nothing clicked. ' +
      'Would answer: ' + answer + '.'
    );
  }

  root.ETLabSummary = { previewSummary: previewSummary };
})(typeof globalThis !== 'undefined' ? globalThis : this);
