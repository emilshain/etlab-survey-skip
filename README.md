# ETLab Survey Skip

A browser extension that fills and submits your **ETLab student-portal surveys**
(teacher evaluations) in one click, using the session you are already logged in
with. No password is ever typed, stored or transmitted.

ETLab blocks the rest of the portal until those surveys are done — one click per
survey × 20 questions × 8 teachers = 160 ratings. This does them for you.

> Looking for the calendar half? That is a separate project:
> [`ETLab2ICS`](../ETLab2ICS) turns the portal calendar into a Thunderbird feed.
> Nothing here depends on it, and vice versa.

---

## Requirements

- **Microsoft Edge or Google Chrome 102+** (Manifest V3).
- A logged-in ETLab account. Nothing else — no Node, no npm, no build step.

---

## Install

1. Keep this folder somewhere permanent; the browser loads the extension from
   this path.
2. Open `edge://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode**.
4. **Load unpacked** → pick the folder that contains `manifest.json`.
5. Pin **ETLab Survey Skip** from the extensions menu.

## Use

1. Log in at `https://students.etlab.app/`.
2. Open the survey list (`/surveys`).
3. Click the extension icon → **Complete all pending**.

It reloads the list, opens each pending survey, answers every question, submits,
and repeats until nothing is pending. For a single survey, open it and press
**Fill this page**.

### Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Answers | Best option | `Best` (Excellent / Strongly Agree) · `Average / middle` (Good / Neutral) · `First option` · `Specific option number` · `Random` |
| Option # | 1 | Only for "Specific option number": 1 = first option in each question |
| Comment boxes | `Good` | Text for empty suggestion fields |
| Preview only | off | Fill without pressing Submit / Finish Survey |

Settings are remembered in `chrome.storage.local`.

> On the modern survey screen each rating **saves as it is clicked**, so
> "Preview only" still records ratings on the server — it only skips
> **Finish Survey**.

### Supported layouts

| Layout | Detected by | What it does |
| --- | --- | --- |
| Modern SPA (`/surveys` → `Q1…Q20`) | `.sd-options-row .sd-option` | Walks all questions, rates each teacher row, clicks **Finish Survey** |
| Classic form | `input[type=radio]` groups | Fills radio groups, dropdowns and comments, clicks **Submit** |

How the answers are chosen:

- Options are ranked by their trailing value, so `Excellent 5` beats `Fair 2`
  and "average" means the middle option regardless of order.
- Reversed questions are handled: *"Percentage of class not engaged"* → **< 10 %**,
  *"Number of days you were absent"* → **0 - 3 days**.
- Text you already typed is never overwritten, and nothing is submitted while a
  question is still unanswered.

---

## How it works

```
popup.js  ──RUN_ONE / RUN_ALL──▶  background.js (service worker)
                                      │
                                      │ chrome.scripting.executeScript
                                      ▼
                            engine.js / wizard.js  (page-side logic)
```

| File | Role |
| --- | --- |
| `manifest.json` | MV3 definition; permissions `scripting`, `tabs`, `storage` |
| `src/background.js` | Orchestrates one survey or all pending ones, reports progress |
| `src/wizard.js` | Modern SPA: question stepping, rating rows, Finish Survey |
| `src/engine.js` | Classic forms: radios, dropdowns, comments, Submit |
| `src/popup.html/.css/.js` | Toolbar UI and saved settings |
| `test/engine.test.mjs` | 15 unit tests against captured ETLab HTML |

Host access is limited to `*.etlab.app` / `*.etlab.in` — the extension cannot
read any other site.

---

## Development

```bash
npm install     # jsdom, tests only
npm test        # 15 tests
```

The live-testing helpers in `scripts/` drive a real browser over the DevTools
protocol (they need Edge started with `--remote-debugging-port=9222`; the
extension itself never uses them):

| Script | Purpose |
| --- | --- |
| `scripts/cdp.mjs` | list targets / open / navigate / evaluate / screenshot |
| `scripts/eval.mjs` | evaluate a snippet file in the page |
| `scripts/probe.mjs` | read a live ETLab page through the engine |
| `scripts/watch-network.mjs` | record the API calls a portal page makes |
| `scripts/drive-popup.mjs` | drive the real popup end to end |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Error at property 'args': Value is unserializable` | Edge is running a cached copy of the old service worker | `edge://extensions` → **Remove** → **Load unpacked** again. A plain **Reload** can keep the stale worker — check the version on the card. |
| `No survey questions found on this page` | You're not on a survey | Open a survey, or use **Complete all pending** from `/surveys` |
| `No "Finish Survey"/Submit button here` | Not on the last question | Let the run finish, or open Q20 and press **Fill this page** |
| Nothing happens at all | The page isn't ETLab | The extension refuses to act on other sites by design |
| Popup closes mid-run | Normal — the worker keeps going | Reopen the popup to see the log |

---

## What is verified

Against the live portal, signed in: the survey list reads correctly, a pending
survey opens, `20 questions × 8 faculty = 160` rating targets are detected, and
filling question 1 selected **8/8** ratings — the portal's own counter moved
`0/160 → 8/160`. All 15 unit tests pass.

**Not verified:** a complete 20-question run through the final **Finish Survey**
click, on a real account (stopped early to avoid a long live run; the
per-question path is the same one proven above).

---

## Limitations & disclaimer

- If ETLab changes its markup the extension stops and reports instead of
  guessing. Use **Preview only** to inspect what it picked.
- These are your own evaluations of your teachers. Submitting the same answer
  everywhere is your choice — the college can see the responses and their
  timestamps.
- Unofficial and unaffiliated with ETLab / Etuwa Concepts. Use it on your own
  account, at your own risk.
