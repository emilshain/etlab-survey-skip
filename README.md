# ETLab Survey Skip

A browser extension that fills and submits your **ETLab student-portal surveys**
(teacher evaluations) in one click, using the session you are already logged in
with. No password is ever typed, stored or transmitted.

ETLab blocks the rest of the portal until those surveys are done — one click per
survey × 20 questions × 8 teachers = 160 ratings. This does them for you.

- Works on **any Chromium-based browser** (Edge, Chrome, Brave, Opera, Vivaldi…)
- Works on **Windows, macOS and Linux** — it's plain JavaScript, no build step
- Works on **any ETLab institute** hosted on `etlab.app` / `etlab.in`, not just one college
- Handles **both survey layouts** ETLab has shipped: the modern SPA and the older form

> Calendar instead of surveys? That's the companion project
> [`ETLab2ICS`](https://github.com/emilshain/etlab2ics) — it turns the portal
> calendar into an iCalendar feed. The two are independent: install either.

---

## Compatibility

### Browsers

| Browser | Status | Extensions page |
| --- | --- | --- |
| Microsoft Edge | ✅ tested | `edge://extensions` |
| Google Chrome | ✅ supported | `chrome://extensions` |
| Brave | ✅ supported | `brave://extensions` |
| Vivaldi | ✅ supported | `vivaldi://extensions` |
| Opera | ✅ supported | `opera://extensions` (enable Developer mode) |
| Chromium (any build ≥102) | ✅ supported | `chrome://extensions` |
| Mozilla Firefox 140+ | ✅ supported | Generated event-page build, see [Firefox](#firefox) |
| Safari | ❌ no | Requires an Xcode conversion and a signed app |

"Supported" means the extension uses only standard Manifest V3 APIs that every
Chromium browser implements; it is *tested* on Edge. Anything Chromium 102 or
newer should load it unchanged.

### Platforms

| OS | Status |
| --- | --- |
| Windows 10/11 | ✅ tested |
| macOS (Edge/Chrome/Brave) | ✅ should work — same engine |
| Linux (Chromium, Chrome, Brave) | ✅ should work — same engine |

### Portals

| Portal | Status |
| --- | --- |
| `students.etlab.app` (modern SPA) | ✅ tested live |
| Other institutes on `*.etlab.app` / `*.etlab.in` | ✅ should work — no institute name is hard-coded |
| Older ETLab deployments (classic form) | ✅ supported by `src/engine.js` |

The extension never contains your college's name. It matches ETLab's markup, so
any institute running the same portal software is handled identically — only the
list of teachers and questions changes, and those come from the page itself.

---

## Requirements

- A Chromium-based browser, version 102 or newer.
- A logged-in ETLab account.
- Nothing else: no Node, no npm, no build step, no account with anyone.

---

## Install

1. Keep this folder somewhere permanent — the browser loads the extension from
   this path, so moving it later requires re-adding it.
2. Open your browser's extensions page (table above) and turn on
   **Developer mode**.
3. Click **Load unpacked** and pick the folder containing `manifest.json`.
4. Pin **ETLab Survey Skip** from the extensions menu.

There is no store listing, by design: automating mandatory institutional
evaluations is not something extension stores accept.

### Firefox

Firefox 140+ cannot load a service-worker extension, so it gets a generated build:

```bash
npm run build:firefox
```

Then `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick
`dist-firefox/manifest.json`. The build is the same code with an MV3 **event
page** instead of a service worker and a Gecko id (`etlab-survey-skip@emilshain`)
so settings survive restarts.

Two Firefox-specific notes:

- A temporary add-on disappears when Firefox closes — load it again, or package
  `dist-firefox/` as an `.xpi` for a permanent install.
- Firefox asks you to grant access to `etlab.app` / `etlab.in` on first use;
  the extension does nothing until it has it.

### Updating

Pull the new files, then **Remove** the extension and **Load unpacked** again.
A plain *Reload* can keep a stale service-worker cache — if the behaviour looks
old, check the version number on the card.

---

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
| Preview only | off | Report what each question would be answered without clicking anything |

Settings are remembered per browser profile.

> Preview means different things on the two layouts, because the layouts differ.
> On the modern SPA nothing is clicked at all: it walks every question and lists
> what it *would* pick, so nothing is recorded on the server. On the classic form
> it fills the inputs but stops before Submit, so a page reload discards it.

### Supported layouts

| Layout | Detected by | What it does |
| --- | --- | --- |
| Modern SPA (`/surveys` → `Q1…Q20`) | `.sd-options-row .sd-option` | Walks all questions, rates each teacher row, clicks **Finish Survey** |
| Classic form | `input[type=radio]` groups | Fills radio groups, dropdowns and comments, clicks **Submit** |

How the answers are chosen:

- Options are ranked by their trailing value, so `Excellent 5` beats `Fair 2`
  and "average" means the middle option regardless of order or language of the
  label.
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
| `test/manifest.test.mjs` | 8 packaging-contract tests |

Host access is limited to `https://*.etlab.app/*` and `https://*.etlab.in/*` —
the extension cannot read any other site, and it requests no localhost access.

---

## Development

```bash
npm install     # jsdom, tests only
npm test        # 36 tests (15 engine + 12 wizard + 9 manifest)
npm run icons   # regenerate icons/*.png (no dependencies)
```

Every push runs the same suite in GitHub Actions on a clean runner.

The live-testing helpers in `scripts/` drive a real browser over the DevTools
protocol (they need a Chromium started with `--remote-debugging-port=9222`; the
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
| `Error at property 'args': Value is unserializable` | The browser is running a cached copy of an old service worker | Remove the extension and **Load unpacked** again. A plain *Reload* can keep the stale worker — check the version on the card. |
| `No survey questions found on this page` | You're not on a survey | Open a survey, or use **Complete all pending** from `/surveys` |
| `No "Finish Survey"/Submit button here` | Not on the last question | Let the run finish, or open Q20 and press **Fill this page** |
| Nothing happens at all | The page isn't ETLab | The extension refuses to act on other sites by design |
| Popup closes mid-run | Normal — the worker keeps going | Reopen the popup to see the log |
| Options look wrong for one question | ETLab shipped a new statement style | Use **Preview only** and report the question text |

---

## What is verified

Against the live portal, signed in: the survey list reads correctly, a pending
survey opens, `20 questions × 8 faculty = 160` rating targets are detected, and
filling question 1 selected **8/8** ratings — the portal's own counter moved
`0/160 → 8/160`. Loading in a real Edge instance reports
`ETLab Survey Skip 1.2.0`, and all 23 tests pass (15 engine + 8 manifest).

**Not verified:** a complete 20-question run through the final **Finish Survey**
click on a real account, and behaviour on browsers/OSes other than Edge on
Windows (same Chromium engine, but untested there).

---

## Limitations & disclaimer

- If ETLab changes its markup the extension stops and reports instead of
  guessing. Use **Preview only** to inspect what it picked.
- Firefox and Safari are not supported yet.
- These are your own evaluations of your teachers. Submitting the same answer
  everywhere is your choice — the college can see the responses and their
  timestamps.
- Unofficial and unaffiliated with ETLab / Etuwa Concepts. Use it on your own
  account, at your own risk.

Licensed under the [MIT License](LICENSE).
