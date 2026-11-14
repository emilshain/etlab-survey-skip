/*
 * The preview summary is a pure function, so these tests feed it the report the
 * extension actually produces - built here by running the real wizard engine
 * over the real markup - rather than a hand-written object that proves nothing.
 *
 * That is the point: previewSummary depends on report.questions, report.total
 * and report.picks[].picks[].label. This file fails if production stops
 * producing them.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OPTIONS = ['Excellent 5', 'Very Good 4', 'Good 3', 'Average 2', 'Poor 1'];

function surveyHtml({ steps = 2, rows = 8, labels = OPTIONS, heading = 'Teaching quality' } = {}) {
  const stepBtn = (i) =>
    `<button class="sd-nav-btn${i === steps - 1 ? ' primary' : ''}">Step ${i + 1}</button>`;

  return `<!doctype html><html><body>
    <div class="sd-question-progress">Question <strong>1</strong> of ${steps}</div>
    ${Array.from({ length: steps }, (_, s) => `
      <div class="sd-step-question${s === 0 ? '' : ' hidden'}" data-step="${s}">
        <div class="sd-card"><h3>${heading}</h3>
          ${Array.from({ length: rows }, (_, r) => `
            <div class="sd-options-row" data-faculty="${r}">
              ${labels.map((l) => `<button class="sd-option">${l}</button>`).join('')}
            </div>`).join('')}
        </div>
        <div class="sd-nav">${stepBtn(s)}</div>
      </div>`).join('')}
  </body></html>`;
}

function load(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://students.etlab.app/' });
  for (const file of ['engine.js', 'wizard.js', 'summary.js']) {
    dom.window.eval(fs.readFileSync(path.join(root, 'src', file), 'utf8'));
  }
  return dom;
}

/* Build exactly what fillWizard's preview branch returns, using the engine. */
async function previewReport(steps = 2, rows = 8, heading) {
  const dom = load(surveyHtml({ steps, rows, heading }));
  const w = dom.window.ETLabEngine;
  const plan = w.wizardPlan(dom.window.document);
  const picks = [];

  for (let i = 0; i < plan.questions.length; i++) {
    const seen = await w.wizardInspectQuestion(dom.window.document, { index: i, strategy: 'best' });
    if (seen && seen.picks) picks.push(seen);
  }

  return {
    mode: 'wizard',
    questions: plan.questions.length,
    total: plan.total,
    answered: 0,
    hero: plan.hero,
    submitted: false,
    submitLabel: null,
    preview: true,
    picks
  };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    console.log('  FAIL ' + name + ' -> ' + error.message);
    process.exitCode = 1;
  }
}

await test('the engine produces every field the summary reads', async () => {
  const report = await previewReport();
  assert.equal(typeof report.questions, 'number');
  assert.equal(typeof report.total, 'number');
  assert.ok(Array.isArray(report.picks));
  assert.ok(report.picks.every((q) => Array.isArray(q.picks)));
  assert.ok(report.picks.every((q) => q.picks.every((p) => typeof p.label === 'string')));
});

await test('summarises a real report with the real counts', async () => {
  const dom = load(surveyHtml());
  const report = await previewReport();
  const text = dom.window.ETLabSummary.previewSummary(report, 'Physics - Dr. X');

  // Expectations come from the report itself: whatever the engine counted is
  // what the summary must echo, so this stays true if the counts change.
  const rows = report.picks.reduce((n, q) => n + q.picks.length, 0);
  assert.ok(rows > 0, 'engine produced no picks');

  assert.match(text, new RegExp(`${report.questions} question\\(s\\)`));
  assert.match(text, new RegExp(`${report.total} rating\\(s\\)`));
  assert.match(text, new RegExp(`Excellent 5 x${rows}`));
  assert.match(text, /Physics - Dr\. X/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

await test('a report with no picks says so instead of "undefined"', () => {
  const dom = load(surveyHtml());
  const text = dom.window.ETLabSummary.previewSummary({ questions: 20, total: 160 }, 'Survey');
  assert.match(text, /nothing readable/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

await test('a bare report degrades to zeroes, never undefined', () => {
  const dom = load(surveyHtml());
  const text = dom.window.ETLabSummary.previewSummary({}, '');
  assert.match(text, /0 question\(s\), 0 rating\(s\)/);
  assert.match(text, /"this survey"/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

await test('missing or noisy titles are cleaned up', () => {
  const dom = load(surveyHtml());
  const text = dom.window.ETLabSummary.previewSummary(
    { questions: 1, total: 1, picks: [] },
    '  Physics\n\tDr.   X  '
  );
  assert.match(text, /"Physics Dr\. X"/);
});

await test('counts follow the strategy in use', async () => {
  const dom = load(surveyHtml());
  const report = await previewReport(2, 8, 'Percentage of class not engaged');
  const text = dom.window.ETLabSummary.previewSummary(report, 'Survey');
  const rows = report.picks.reduce((n, q) => n + q.picks.length, 0);

  assert.match(text, new RegExp(`Poor 1 x${rows}`));
  assert.doesNotMatch(text, /Excellent 5/);
});

console.log('\nAll ' + passed + ' summary tests passed.');
