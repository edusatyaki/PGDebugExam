# PostgreSQL Debugging Test

A static MCQ test on **debugging PostgreSQL code: 50 questions per attempt (drawn at random from a bank of 75), 4 options each, 90 seconds per question**, no going back.
Built on the same engine and design as [DBMSExam](https://github.com/edusatyaki/DBMSExam). Runs entirely on GitHub Pages;
results are written to a Google Sheet through a Google Apps Script web app.

Two kinds of question, mixed through every topic:

- **Find the bug (50)** — a SQL snippet with a bug; pick the cause, the fix, or what the server actually does.
- **Error → fix (25)** — the snippet *and* the exact error PostgreSQL printed when it ran, shown in a red
  psql-style panel (`ERROR:` / `DETAIL:` / `HINT:`); pick the change that fixes it.

| Topic | Qs | of which Error → fix |
|---|---|---|
| Syntax & Quoting | 11 | 5 |
| Filtering & NULLs | 9 | 2 |
| GROUP BY & Aggregates | 7 | 0 |
| Joins | 8 | 1 |
| Subqueries, CTEs & UNION | 7 | 2 |
| Window Functions | 6 | 1 |
| DDL, Constraints & Transactions | 15 | 9 |
| Types & Functions | 12 | 5 |

The error panels show DETAIL lines as PostgreSQL prints them, but leave out HINT lines that would give the
answer away (e.g. `Use OVERRIDING SYSTEM VALUE`). The one HINT kept, on the date question, points the wrong way
on purpose — changing `datestyle` does not fix a year-first date.

Every error message and behaviour the questions rely on was checked by running the snippets on
PostgreSQL 16 (see [`verify/`](verify/)).

```
index.html            the whole UI (start → quiz → result)
css/style.css
js/config.js          ← the only file you normally edit
js/questions.js       the 75-question bank
js/app.js             timer, scoring, SQL highlighting, submission
apps-script/Code.gs   paste this into the Google Sheet's Apps Script editor
verify/*.sql          run every snippet against a real server
```

> **Use a new Google Sheet for this test.** `APPS_SCRIPT_URL` ships empty on purpose, so results
> never land in the DBMS Rapid Fire sheet. Until you fill it in, the test runs in offline mode.

---

## 1. Set up the Google Sheet

1. Create a Google Sheet (any name — this is where results land).
2. **Extensions → Apps Script.** Delete the placeholder `myFunction`, paste the whole of
   [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. In the toolbar, select the `setup` function and press **Run**. Approve the permission prompt
   (choose your account → *Advanced* → *Go to … (unsafe)* → *Allow*). This creates the
   `Responses` and `Answers` tabs with headers.
4. **Deploy → New deployment → ⚙ → Web app**
   - *Description:* `pg debug v1`
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

> Use the `/exec` URL, never the `/dev` one — `/dev` only works while you are signed in.

## 2. Point the site at it

Open `js/config.js` and paste the URL:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy…/exec",
```

Open the URL in a browser tab to sanity-check it — you should see
`{"ok":true,"message":"PostgreSQL Debugging Test endpoint is live", …}`.

## 3. Publish on GitHub Pages

Push the **contents of this folder** to the repo root so that `index.html` sits at the top level:

```bash
git init && git add . && git commit -m "PostgreSQL debugging test" && git branch -M main
```

Then create the repo and push:

```bash
gh repo create PGDebugExam --public --source=. --push
```

The included workflow (`.github/workflows/static.yml`) deploys on every push to `main`. On a new repo
the first run fails at *Setup Pages* until you set **Settings → Pages → Source: GitHub Actions** once, then
re-run it. The site goes live at `https://<username>.github.io/PGDebugExam/`.

If you would rather keep the quiz inside a larger repo, put these files in a `docs/` folder and
choose **`main` / `/docs`** as the Pages source instead.

---

## What lands in the sheet

`setup()` creates three tabs.

**`Responses`** — one row per completed attempt, the gradebook:

| Timestamp | Attempt ID | Name | Section | Enrolment No | IP Address | Score | Total Questions | Answered | Correct | Wrong | Timed Out | Accuracy % | Best Streak | Left Page | Time Taken (s) | Avg per Q (s) | Topic Breakdown | Client Time | User Agent |

**`Live`** — one row per attempt, **overwritten in place** as the student works, so a round that
was never finished still shows how far they got:

| Attempt ID | Last Update | Name | Section | Enrolment No | IP Address | Status | Answered | Total | Progress % | Correct | Wrong | Timed Out | Score | Left Page | Elapsed (s) |

`Status` moves through `started → in-progress → completed`. Two other values can appear:

- **`left-page`** — the student switched tabs or minimised the browser mid-round. It flips back to
  `in-progress` the moment they return, and `Left Page` counts how many times it happened.
- **`abandoned`** — the tab was closed or navigated away from before the round ended. A late
  `abandoned` can never overwrite a row already marked `completed`.

A student who vanished is therefore the row whose `Status` is not `completed` and whose
`Last Update` has gone stale. `Attempt ID` joins a `Live` row to its `Responses` row.

**`Answers`** — one row per question per attempt (attempt id, name, section, enrolment, Q #, topic,
answer given, correct?, seconds taken). Set `DETAIL_NAME = ''` at the top of `Code.gs` to skip it.

### About the IP address

Google Apps Script **cannot see the caller's IP** — it is not in the request object — and a static
page cannot see its own visitor's address either. So the address is looked up in the browser from a
public service (`api.ipify.org`, with two fallbacks) and sent along with the result.

Three consequences worth knowing before you rely on it:

1. **It is client-supplied, so it is spoofable.** Treat it as a soft signal — useful for spotting
   several submissions from one connection — never as proof of who sat the quiz.
2. **A whole lab or campus usually shares one public address.** Identical IPs across a section are
   normal, not evidence of anything.
3. **It is personal data.** The start screen tells students plainly what is being recorded. Keep
   that notice there, and check what your institution requires before collecting it.

Set `CAPTURE_IP: false` in `js/config.js` to switch the lookup off; the notice on the start screen
updates itself, and the column simply stays empty.

### Live progress and Apps Script quotas

Each student sends a checkpoint every `PROGRESS_EVERY` questions (default 10), plus one at the
start, one at the end, and one whenever they leave or return to the page. For a 50-question round
that is roughly ten writes per student. Progress writes take a short lock and **give up quietly
if the sheet is busy** — the next checkpoint carries the newer state anyway, so nothing is lost.
Raise `PROGRESS_EVERY` if you are running a very large cohort, or set `PROGRESS_TRACKING: false`
to record only the final result.

## Tuning the round

Everything lives in `js/config.js`:

| Setting | Default | Meaning |
|---|---|---|
| `FULLSCREEN_ON_START` | `true` | The round only begins once the browser is in fullscreen |
| `PROCTORING` | `true` | Count violations and show a warning for each (see below) |
| `MALPRACTICE_LIMIT` | `10` | This many violations marks the attempt as malpractice |
| `END_AT_LIMIT` | `false` | `true` also stops the test at the limit |
| `RESIZE_TOLERANCE_PX` | `30` | Size change ignored as noise |
| `SECONDS_PER_QUESTION` | `90` | Countdown per question |
| `WARN_AT_SECONDS` / `DANGER_AT_SECONDS` | `15` / `5` | When the ring turns amber / red |
| `QUESTIONS_PER_ROUND` | `50` | Each student gets a random 50 of the 75; set `75` for all of them |
| `SHUFFLE_QUESTIONS` | `true` | Randomise the order per attempt |
| `SHUFFLE_OPTIONS` | `true` | Randomise A–D per question |
| `SECTIONS` | `["A","B","C","D","E"]` | Dropdown options; `[]` gives a free-text box instead |
| `ENROLMENT_PATTERN` | `""` | Optional regex the enrolment number must match, e.g. `"^[0-9]{10}$"` |
| `CAPTURE_IP` | `true` | Look the student's network address up and store it |
| `PROGRESS_TRACKING` | `true` | Write live checkpoints to the `Live` sheet |
| `PROGRESS_EVERY` | `10` | Send a checkpoint every N questions |
| `SHOW_LEADERBOARD` | `true` | Fetch top scores after the round |
| `ALLOW_REVIEW` | `true` | Show the "what you missed" panel |

**Scoring:** 10 points for a correct answer plus up to 5 more for speed; a wrong answer or a
timeout scores 0 and breaks the streak.

### Keeping browsers from serving a stale copy

`index.html` loads its assets with a `?v=5` suffix:

```html
<script src="js/questions.js?v=5"></script>
```

GitHub Pages caches aggressively, so **bump that number whenever you change the questions, the
timer or the styling** — otherwise returning students may keep running the old version.

### Adding or editing questions

`js/questions.js` is a plain array. Text wrapped in \`backticks\` renders as inline code; `c` is the
snippet, written as a template literal, and renders as a numbered, highlighted code block. The optional
`e` field is the error output, shown in the red panel under the code — that is what makes it an
"Error → fix" question.

```js
{ t: "Joins", a: 2,
  q: "Which error does this produce?",
  c: `SELECT id, name
FROM customers c
JOIN orders o ON c.id = o.customer_id;`,
  o: ["`missing FROM-clause entry`", "No error", "`column reference \"id\" is ambiguous`", "`syntax error`"] },

{ t: "Joins", a: 0,
  q: "Goal: names with order amounts above 500. How do you fix this error?",
  c: `SELECT c.name, o.amount
FROM customers c
WHERE o.amount > 500;`,
  e: `ERROR:  missing FROM-clause entry for table "o"`,
  o: ["Add `JOIN orders o ON o.customer_id = c.id`", "…", "…", "…"] },
```

`t` = topic (drives the breakdown chart), `a` = **index** of the correct option (0–3), `o` = exactly four options.
If you add a question that quotes an error message, add its snippet to `verify/verify.sql` (or `verify/errors.sql` for Error → fix) and run it:

```bash
psql -d scratch -X -f verify/verify.sql
```

---

## Notes and limits

- **The answers are in the page source.** This is a static site, so a determined student can open
  `js/questions.js` and read `a`. That is fine for a classroom test; if you need it to
  be exam-grade, the scoring has to move server-side (send only the picked index to Apps Script and
  grade it there against a private copy of the key).
- **Proctoring.** Pressing Start requests fullscreen, and the clock does not start until it is
  granted. The screen and viewport size are measured on that first entry. After that, each of these
  is a **violation**: the question is covered by a warning showing the running count and a
  breakdown, and the student carries on (the clock does not stop).

  | Violation | Sheet column | Caused by |
  |---|---|---|
  | Screen exit | `Screen Exits` | Esc out of fullscreen, switching tab or app, minimising the window |
  | Resize | `Resizes` | The window or screen size moving away from the one measured on entry (maximise/restore, a docked Inspect panel, split screen, another display) |
  | Inspect attempt | `Inspect Attempts` | F12, Ctrl+Shift+I/J/C/K, Cmd+Opt+I/J/C/U, Ctrl+U, right-click |
  | Automated click | `Automated Clicks` | An answer clicked by a script (`event.isTrusted` is false) — the click is ignored — or `navigator.webdriver` |

  At `MALPRACTICE_LIMIT` (10) violations the attempt is marked **malpractice**: the `Malpractice`
  column is `TRUE`, `Malpractice Reason` records the counts at that moment, and the attempt is kept
  off the leaderboard. The student may still finish unless `END_AT_LIMIT` is `true`. Students can
  sit the test any number of times; every attempt is its own row.
  - *Limits* — `Esc` cannot be blocked by any web page, only counted. Developer tools opened
    **undocked** from the browser menu don't change the page size, but they take focus, which counts
    as a screen exit. OS-level auto-clickers produce real input and can't be told apart. iPhone
    Safari has no Fullscreen API, so there the round runs windowed and only width changes count.
  - After updating `Code.gs`, run `setup()` once so the new header columns are written, then deploy
    a new version.
- **Name, section and enrolment number are self-reported.** Nothing stops a student typing someone
  else's. If that matters, run the round in a supervised session, or put a Google Form sign-in in
  front of it so the identity comes from a Google account instead.
- **Delivery confirmation.** The result POST is a "simple" `text/plain` request so the browser skips
  the CORS preflight that Apps Script cannot answer. If the reply still can't be read, the app falls
  back to a fire-and-forget send, keeps a copy in `localStorage`, and says so on screen rather than
  claiming a save it can't verify. Queued copies are retried the next time the page loads.
- **No pause.** Leaving fullscreen or switching tabs does not stop the clock — that is deliberate.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Offline mode — result not sent" | `APPS_SCRIPT_URL` is still empty in `js/config.js`. |
| The `Live` sheet fills but `Responses` stays empty | Students are starting rounds without finishing them — check the `Status` column. |
| Nothing appears in the sheet | Re-deploy with *Who has access:* **Anyone**, and confirm you pasted the `/exec` URL. |
| Changes to `Code.gs` have no effect | **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Editing alone does not update the live URL. |
| Leaderboard says "unavailable" | Usually the same redeploy issue; open `…/exec?action=leaderboard` directly to see the error. |
| GitHub Pages shows a 404 | `index.html` must be at the branch root (or in `/docs` if that is the configured source). |

Run it locally with any static server:

```bash
python3 -m http.server 8107
```
