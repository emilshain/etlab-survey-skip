/*
 * Tests for the modern survey adapter (src/wizard.js).
 *
 * jsdom has no React and no click handlers, so the parts that depend on the
 * real page (auto-save, step transitions, Finish Survey navigation) are out of
 * scope. What is covered here is the logic that decides *what* to click and
 * *how many* targets there are - the part most likely to break when ETLab
 * changes a label.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const engineSrc = fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8');
const wizardSrc = fs.readFileSync(path.join(root, 'src', 'wizard.js'), 'utf8');

const OPTIONS = ['Excellent 5', 'Very Good 4', 'Good 3', 'Fair 2', 'Poor 1'];

function row(labels, active) {
  return (
    '<div class="sd-options-row">' +
    labels
      .map((label) => `<button class="sd-option${label === active ? ' active' : ''}">${label}</button>`)
      .join('') +
    '</div>'
  );
}

function surveyHtml({ steps = 2, rows = 8, labels = OPTIONS } = {}) {
  const nav = Array.from(
    { length: steps },
    (_, i) =>
      `<button class="sd-step-question${i === 0 ? ' active' : ''}" aria-label="Question ${i + 1}">Q${i + 1}</button>`
  ).join('');
  return `<!doctype html><html><body>
    <div class="sd-hero-summary"><span>0/${steps * rows} ready</span></div>
    <nav>${nav}</nav>
    <div class="sd-card"><h3>Teaching quality</h3>
      ${Array.from({ length: rows }, () => row(labels)).join('')}
      <div class="sd-save-state">Saved</div>
    </div>
    <button class="sd-nav-btn primary">Next Question</button>
  </body></html>`;
}

function listHtml(pending = 1) {
  const cards = [
    '<button class="sv-card" aria-label="Physics survey pending"><span class="sv-icon-pending"></span>Physics</button>',
    '<button class="sv-card" aria-label="Maths survey completed">Maths</button>'
  ];
  if (pending === 0) {
    cards[0] = '<button class="sv-card" aria-label="Physics survey completed">Physics</button>';
  }
  return `<div class="sv-list">${cards.join('')}</div>`;
}

function load(html, url = 'https://students.etlab.app/s/abc') {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  dom.window.eval(engineSrc);
  dom.window.eval(wizardSrc);
  assert.ok(dom.window.ETLabEngine, 'engine should attach itself to the page');
  return dom;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    console.log('  FAIL ' + name + ' -> ' + error.message);
    process.exitCode = 1;
  }
}

/* ---------------------------------------------------------------- */

console.log('\nWizard detection and planning');

test('detects the SPA layout', () => {
  const w = load(surveyHtml()).window.ETLabEngine;
  assert.equal(w.wizardIs(load(surveyHtml()).window.document), true);
  assert.equal(w.wizardIs(load('<div>nothing here</div>').window.document), false);
});

test('counts questions x rating rows', () => {
  const dom = load(surveyHtml({ steps: 20, rows: 8 }));
  const plan = dom.window.ETLabEngine.wizardPlan(dom.window.document);
  assert.equal(plan.mode, 'wizard');
  assert.equal(plan.steps, 20);
  assert.equal(plan.rowsPerQuestion, 8);
  assert.equal(plan.total, 160);
  assert.match(plan.hero, /0\/160 ready/);
  assert.equal(plan.questions.length, 20);
  assert.equal(plan.questions[0].label, 'Q1');
});

console.log('\nOption ranking and selection');

test('ranks by the trailing number, not the word', () => {
  const w = load(surveyHtml()).window.ETLabEngine;
  assert.equal(w.wizardInternals.rankOf('Excellent 5'), 5);
  assert.equal(w.wizardInternals.rankOf('Poor 1'), 1);
  assert.equal(typeof w.wizardInternals.rankOf('Agree'), 'number');
});

test('best picks the highest-scoring option', () => {
  const dom = load(surveyHtml());
  const w = dom.window.ETLabEngine;
  const r = dom.window.document.querySelector('.sd-options-row');
  assert.equal(w.wizardInternals.pickIn(r, 'best', 0).textContent, 'Excellent 5');
});

test('best still wins when the options are listed in reverse', () => {
  const dom = load(surveyHtml({ labels: [...OPTIONS].reverse() }));
  const w = dom.window.ETLabEngine;
  const r = dom.window.document.querySelector('.sd-options-row');
  assert.equal(w.wizardInternals.pickIn(r, 'best', 0).textContent, 'Excellent 5');
});

test('average picks the middle option', () => {
  const dom = load(surveyHtml());
  const w = dom.window.ETLabEngine;
  const r = dom.window.document.querySelector('.sd-options-row');
  assert.equal(w.wizardInternals.pickIn(r, 'average', 0).textContent, 'Good 3');
});

test('first and index strategies are positional', () => {
  const dom = load(surveyHtml());
  const w = dom.window.ETLabEngine;
  const r = dom.window.document.querySelector('.sd-options-row');
  assert.equal(w.wizardInternals.pickIn(r, 'first', 0).textContent, 'Excellent 5');
  assert.equal(w.wizardInternals.pickIn(r, 'index', 3).textContent, 'Fair 2');
  assert.equal(w.wizardInternals.pickIn(r, 'index', 99).textContent, 'Poor 1');
});

test('random returns one of the row options', () => {
  const dom = load(surveyHtml());
  const w = dom.window.ETLabEngine;
  const r = dom.window.document.querySelector('.sd-options-row');
  assert.ok(OPTIONS.includes(w.wizardInternals.pickIn(r, 'random', 0).textContent));
});

console.log('\nSurvey list');

test('only pending cards are counted', () => {
  const dom = load(listHtml(1), 'https://students.etlab.app/surveys');
  const w = dom.window.ETLabEngine;
  const pending = w.wizardPendingCards(dom.window.document);
  assert.equal(pending.length, 1);
  assert.match(pending[0].text, /Physics/);

  const state = w.listState(dom.window.document);
  assert.equal(state.hasList, true);
  assert.equal(state.cards, 2);
  assert.equal(state.pending, 1);
});

test('a fully completed list reports nothing pending', () => {
  const dom = load(listHtml(0), 'https://students.etlab.app/surveys');
  const w = dom.window.ETLabEngine;
  assert.equal(w.listState(dom.window.document).pending, 0);
});

test('opening a card with nothing pending is an explicit error', () => {
  const dom = load(listHtml(0), 'https://students.etlab.app/surveys');
  const result = dom.window.ETLabEngine.wizardOpenCard(dom.window.document, { index: 0 });
  assert.match(result.error, /No pending survey card/);
});


console.log("Preview (must not click)");

try {
  const dom = load(surveyHtml());
  const w = dom.window.ETLabEngine;
  const seen = await w.wizardInspectQuestion(dom.window.document, { index: 0, strategy: "average" });
  assert.equal(seen.rows, 8);
  assert.equal(seen.picks.length, 8);
  assert.deepEqual([...new Set(seen.picks.map((p) => p.label))], ["Good 3"]);
  assert.equal(dom.window.document.querySelectorAll(".sd-option.active").length, 0);
  passed++;
  console.log("  ok   preview reports choices without clicking");
} catch (error) {
  console.log("  FAIL preview reports choices without clicking -> " + error.message);
  process.exitCode = 1;
}

console.log('\nAll ' + passed + ' wizard tests passed.');
