/*
 * Tests for the survey engine, run against realistic ETLab-shaped fixtures.
 *
 *   npm test
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

function load(fixture, url = 'https://students.etlab.app/student/survey/answer/101') {
  const html = fs.readFileSync(path.join(here, 'fixtures', fixture), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  dom.window.eval(engineSrc);
  assert.ok(dom.window.ETLabEngine, 'engine should attach itself to the page');
  return dom;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error('      ' + String(error.message).split('\n').join('\n      '));
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */

console.log('\nTeacher evaluation survey (radio grid)');

test('fills every question and submits', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  let submitted = false;
  doc.getElementById('surveyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitted = true;
  });

  const report = dom.window.ETLabEngine.run(doc, { strategy: 'best', comment: 'Good' });

  assert.equal(report.total, 4, 'four questions found');
  assert.equal(report.answered, 4, 'all four answered');
  assert.deepEqual(Array.from(report.unanswered), []);
  assert.equal(report.submitLabel, 'Submit Answers');
  assert.equal(report.submitted, true, 'submit button was clicked');
  assert.equal(submitted, true, 'form submit event fired');
});

test('picks the most positive label for normal questions', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { preview: true });

  assert.equal(doc.querySelector('input[name="q1"]:checked').value, '5', 'q1 = Excellent');
  assert.equal(doc.querySelector('input[name="q2"]:checked').value, '5', 'q2 = Excellent');
  assert.equal(doc.querySelector('input[name="q3"]:checked').value, '5', 'q3 = Excellent');
});

test('picks the lowest number for "not engaged" style questions', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { preview: true });

  const checked = doc.querySelector('input[name="q4"]:checked');
  assert.equal(checked.value, '1', 'q4 should be "< 10%"');
  assert.match(checked.parentElement.textContent, /<\s*10%/);
});

test('fills the empty comment box', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  const report = dom.window.ETLabEngine.run(doc, { preview: true, comment: 'Good' });

  assert.equal(report.textFilled, 1);
  assert.equal(doc.getElementById('suggestion').value, 'Good');
});

test('never overwrites a comment the student already typed', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  doc.getElementById('suggestion').value = 'needs more lab sessions';
  dom.window.ETLabEngine.run(doc, { preview: true, comment: 'Good' });
  assert.equal(doc.getElementById('suggestion').value, 'needs more lab sessions');
});

test('preview mode fills but does not submit', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  let submitted = false;
  doc.getElementById('surveyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitted = true;
  });

  const report = dom.window.ETLabEngine.run(doc, { preview: true });
  assert.equal(report.preview, true);
  assert.equal(report.submitted, false);
  assert.equal(submitted, false, 'no submit event in preview mode');
  assert.equal(report.answered, 4, 'questions were still filled');
});

test('honours an explicit option number', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { strategy: 'index', answerIndex: 4, preview: true });
  assert.equal(doc.querySelector('input[name="q1"]:checked').value, '1', 'option 5 of 5 = Poor');
});

test('average strategy picks the middle option', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { strategy: 'average', preview: true });

  assert.equal(doc.querySelector('input[name="q1"]:checked').value, '3', 'middle of 5 = Good');
  assert.equal(doc.querySelector('input[name="q2"]:checked').value, '3');
  assert.equal(doc.querySelector('input[name="q3"]:checked').value, '3');
});

test('average strategy works on dropdowns and 4-option lists', () => {
  const dom = load('feedback-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { strategy: 'average', preview: true });

  assert.equal(doc.querySelector('input[name="f1"]:checked').value, 'c', 'middle of 4 = Neutral');
  assert.equal(doc.querySelector('input[name="f2"]:checked').value, 'b', 'middle of 3');
  assert.equal(doc.getElementById('lab').value, '2', 'dropdown middle = Average');
});

test('is idempotent: already-answered questions are left alone', () => {
  const dom = load('teacher-survey.html');
  const doc = dom.window.document;
  dom.window.ETLabEngine.run(doc, { preview: true });
  const before = doc.querySelector('input[name="q1"]:checked').value;
  const report = dom.window.ETLabEngine.run(doc, { preview: true });
  assert.equal(report.answered, 4);
  assert.equal(doc.querySelector('input[name="q1"]:checked').value, before);
});

/* ------------------------------------------------------------------ */

console.log('\nModern SPA rating rows (wizard adapter)');

function loadWizardRow() {
  const dom = new JSDOM(
    `<div class="sd-options-row">
       <button class="sd-option"><span>Excellent</span><strong>5</strong></button>
       <button class="sd-option"><span>Very Good</span><strong>4</strong></button>
       <button class="sd-option"><span>Good</span><strong>3</strong></button>
       <button class="sd-option"><span>Fair</span><strong>2</strong></button>
       <button class="sd-option"><span>Poor</span><strong>1</strong></button>
     </div>`,
    { runScripts: 'outside-only', url: 'https://students.etlab.app/s/eyJhbGciOi' }
  );
  dom.window.eval(engineSrc);
  dom.window.eval(wizardSrc);
  const row = dom.window.document.querySelector('.sd-options-row');
  const api = dom.window.ETLabEngine.wizardInternals;
  const pick = (strategy, answerIndex) => {
    const el = api.pickIn(row, strategy, answerIndex || 0);
    if (!el) return null;
    const word = el.querySelector('span').textContent.trim();
    const number = el.querySelector('strong').textContent.trim();
    return word + ' ' + number;
  };
  return { pick };
}

test('wizard: best / average / index ratings', () => {
  const { pick } = loadWizardRow();
  assert.equal(pick('best'), 'Excellent 5');
  assert.equal(pick('average'), 'Good 3', 'middle of the five-point scale');
  assert.equal(pick('first'), 'Excellent 5');
  assert.equal(pick('index', 4), 'Poor 1');
});

/* ------------------------------------------------------------------ */

console.log('\nCurriculum feedback survey (fieldsets, dropdown, required fields)');

test('fills fieldsets, dropdown, textarea and required checkbox', () => {
  const dom = load('feedback-survey.html');
  const doc = dom.window.document;
  let submitted = false;
  doc.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitted = true;
  });

  const report = dom.window.ETLabEngine.run(doc, { strategy: 'best' });

  assert.equal(doc.querySelector('input[name="f1"]:checked').value, 'a', 'Strongly Agree');
  assert.equal(doc.querySelector('input[name="f2"]:checked').value, 'a', 'fewest absent days');
  assert.equal(doc.getElementById('lab').value, '4', 'dropdown = Excellent');
  assert.equal(doc.getElementById('remarks').value, 'Good', 'required textarea filled');
  assert.equal(doc.querySelector('input[name="declare"]').checked, true, 'required checkbox ticked');
  assert.equal(report.submitted, true);
  assert.equal(submitted, true);
});

/* ------------------------------------------------------------------ */

console.log('\nEdge cases');

test('reports a missing submit button instead of pretending to submit', () => {
  const dom = load('no-submit.html');
  const doc = dom.window.document;
  const report = dom.window.ETLabEngine.run(doc, { strategy: 'best' });

  assert.equal(report.submitted, false);
  assert.match(report.error, /submit button/i);
  assert.equal(report.answered, 1, 'question was still filled');
});

test('inspect() tells survey pages and list pages apart', () => {
  const survey = load('teacher-survey.html');
  const list = load('survey-list.html', 'https://students.etlab.app/student/dashboard');

  const a = survey.window.ETLabEngine.inspect(survey.window.document);
  const b = list.window.ETLabEngine.inspect(list.window.document);

  assert.equal(a.looksLikeSurvey, true);
  assert.equal(a.questions, 4);
  assert.equal(a.submitLabel, 'Submit Answers');
  assert.equal(b.looksLikeSurvey, false);
});

test('collectSurveyLinks() finds only survey links', () => {
  const dom = load('survey-list.html', 'https://students.etlab.app/student/dashboard');
  const links = dom.window.ETLabEngine.collectSurveyLinks(dom.window.document);

  assert.equal(links.length, 2, 'two pending surveys');
  assert.deepEqual(Array.from(links, (l) => l.url), [
    'https://students.etlab.app/student/survey/answer/101',
    'https://students.etlab.app/student/survey/answer/102'
  ]);
  assert.ok(!links.some((l) => /attendance|results/.test(l.url)), 'navigation links excluded');
});

/* ------------------------------------------------------------------ */

if (process.exitCode) {
  console.error('\nSome tests failed.\n');
} else {
  console.log(`\nAll ${passed} tests passed.\n`);
}
