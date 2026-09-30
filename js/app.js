/* =====================================================================
   PostgreSQL Debugging Test — quiz engine
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------ helpers ------------------------------ */
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const escapeHTML = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Renders `code` spans inside question / option text.
  const fmt = (s) => escapeHTML(s).replace(/`([^`]+)`/g, "<code>$1</code>");

  /* A small SQL highlighter for the question snippets. It tokenises the raw
     text first and escapes each token, so nothing in a snippet is ever
     interpreted as HTML. An unbalanced quote (a deliberate bug in some
     questions) simply colours the rest of the line, as a real editor would. */
  const SQL_KEYWORDS = new Set((
    "select from where and or not in is null as on join left right full inner outer cross " +
    "using group by having order asc desc limit offset distinct insert into values update set " +
    "delete create table alter add column drop primary key foreign references unique check " +
    "default constraint with recursive union all exists between like ilike case when then else " +
    "end over partition rows range unbounded preceding following current row begin commit " +
    "rollback serial int integer text varchar numeric float timestamp date cast true false nulls " +
    "if returning"
  ).split(" "));

  function highlightSQL(src) {
    const re = /(--[^\n]*)|('(?:[^'\n]|'')*'?)|("[^"\n]*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_'"-]+|-)/g;
    let html = "", m;
    while ((m = re.exec(src)) !== null) {
      const tok = escapeHTML(m[0]);
      if (m[1])      html += '<span class="t-com">' + tok + "</span>";
      else if (m[2]) html += '<span class="t-str">' + tok + "</span>";
      else if (m[3]) html += '<span class="t-id">' + tok + "</span>";
      else if (m[4]) html += '<span class="t-num">' + tok + "</span>";
      else if (m[5]) {
        const w = m[5].toLowerCase();
        const isFn = src.charAt(re.lastIndex) === "(";
        html += SQL_KEYWORDS.has(w) ? '<span class="t-kw">' + tok + "</span>"
              : isFn ? '<span class="t-fn">' + tok + "</span>" : tok;
      } else html += tok;
    }
    // One element per line so CSS can number them.
    return html.split("\n").map((line) => '<span class="ln">' + (line || " ") + "</span>").join("");
  }

  /* psql-style error output: the ERROR / DETAIL / HINT label is picked out
     so students learn to read the first word of each line. */
  function formatError(src) {
    return src.split("\n").map((line) => {
      const m = /^(ERROR|DETAIL|HINT):(\s*)(.*)$/.exec(line);
      if (!m) return '<span class="err-line">' + escapeHTML(line) + "</span>";
      return '<span class="err-line"><span class="err-' + m[1].toLowerCase() + '">' + m[1] +
        ":</span>" + m[2] + escapeHTML(m[3]) + "</span>";
    }).join("");
  }

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pad = (n) => String(n).padStart(2, "0");
  const mmss = (secs) => pad(Math.floor(secs / 60)) + ":" + pad(Math.floor(secs % 60));

  /* Esc and F11 always leave fullscreen and no page can prevent that, so the
     proctoring below counts exits rather than trying to block them. Requests
     must come from a user gesture: the Start button or the warning's
     "Return to fullscreen" button. */
  const fsSupported = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  // Resolves when the request is accepted; rejects when it is refused.
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req) return Promise.reject(new Error("unsupported"));
    try {
      return Promise.resolve(req.call(el, { navigationUI: "hide" }));
    } catch (e) {
      return Promise.reject(e);             // older Safari throws instead of rejecting
    }
  }

  function exitFullscreen() {
    if (!isFullscreen()) return;
    const done = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!done) return;
    try {
      const p = done.call(document);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  const uuid = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "att-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  };

  /* ------------------------------- state ------------------------------- */
  const S = {
    player: { name: "", section: "", enrolment: "" },
    attemptId: "",
    ip: "",            // filled in the background; "" until the lookup returns
    deck: [],          // [{ q, o[], a, t, origIndex }]
    i: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    log: [],           // per-question record
    locked: false,
    finished: false,
    startedAt: 0,
    qStartedAt: 0,
    raf: null,
    hidden: false,        // is the tab currently backgrounded?
    leftPageCount: 0,     // how many times they navigated away mid-round
    abandonSent: false,

    // proctoring
    awaitingFs: false,    // Start pressed, waiting for fullscreen to take effect
    baseline: null,       // screen + viewport measured on first fullscreen entry
    v: { exits: 0, resizes: 0, inspect: 0, automation: 0 },   // violation counts
    lastExitAt: 0,
    lastSizeKey: "",
    settlingUntil: 0,     // ignore resizes while a fullscreen transition animates
    resizeTimer: null,
    terminated: false,
    malReason: ""
  };

  const RING_LEN = 2 * Math.PI * 52; // r=52 in the SVG

  /* ---------------------------- IP lookup ------------------------------ */
  // Apps Script cannot see the caller's IP, so it has to be looked up here
  // and sent along. Best-effort and non-blocking: the quiz never waits on it.
  function lookupIP() {
    if (!CONFIG.CAPTURE_IP || !CONFIG.IP_LOOKUP_URLS.length) return;

    const tryNext = (idx) => {
      if (idx >= CONFIG.IP_LOOKUP_URLS.length) return;
      fetch(CONFIG.IP_LOOKUP_URLS[idx], { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          if (data && data.ip) S.ip = String(data.ip);
          else tryNext(idx + 1);
        })
        .catch(() => tryNext(idx + 1));
    };
    tryNext(0);
  }

  /* ---------------------------- deck building --------------------------- */
  function buildDeck() {
    let bank = QUESTIONS.map((item, idx) => Object.assign({}, item, { origIndex: idx }));
    if (CONFIG.SHUFFLE_QUESTIONS) bank = shuffle(bank);
    bank = bank.slice(0, Math.min(CONFIG.QUESTIONS_PER_ROUND, bank.length));

    return bank.map((item) => {
      if (!CONFIG.SHUFFLE_OPTIONS) return Object.assign({}, item, { correctText: item.o[item.a] });
      const correctText = item.o[item.a];
      const opts = shuffle(item.o);
      return Object.assign({}, item, { o: opts, a: opts.indexOf(correctText), correctText: correctText });
    });
  }

  /* ------------------------------ screens ------------------------------- */
  function show(id) {
    $$(".screen").forEach((el) => el.classList.remove("is-active"));
    $(id).classList.add("is-active");
    window.scrollTo(0, 0);
  }

  /* ------------------------------- timer -------------------------------- */
  function startTimer() {
    const total = CONFIG.SECONDS_PER_QUESTION * 1000;
    S.qStartedAt = performance.now();
    const ring  = $("#ring-progress");
    const label = $("#timer-value");
    const wrap  = $("#timer");

    function frame(now) {
      const elapsed = now - S.qStartedAt;
      const left = Math.max(0, total - elapsed);
      const frac = left / total;

      ring.style.strokeDashoffset = String(RING_LEN * (1 - frac));
      const secs = Math.ceil(left / 1000);
      if (label.textContent !== String(secs)) label.textContent = String(secs);

      wrap.classList.toggle("is-warn", secs <= CONFIG.WARN_AT_SECONDS && secs > CONFIG.DANGER_AT_SECONDS);
      wrap.classList.toggle("is-danger", secs <= CONFIG.DANGER_AT_SECONDS);

      if (left <= 0) { S.raf = null; onTimeout(); return; }
      S.raf = requestAnimationFrame(frame);
    }
    ring.style.strokeDasharray = String(RING_LEN);
    ring.style.strokeDashoffset = "0";
    wrap.classList.remove("is-warn", "is-danger");
    S.raf = requestAnimationFrame(frame);
  }

  function stopTimer() {
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
  }

  /* ---------------------------- render a card ---------------------------- */
  function renderQuestion() {
    const item = S.deck[S.i];

    $("#q-counter").textContent = (S.i + 1) + " / " + S.deck.length;
    $("#q-topic").textContent   = item.t;
    $("#stat-score").textContent  = S.score;
    $("#stat-streak").textContent = S.streak;
    $("#progress-fill").style.width = ((S.i / S.deck.length) * 100).toFixed(2) + "%";

    const card = $("#q-card");
    card.classList.remove("card-in");
    void card.offsetWidth;          // restart the entry animation
    card.classList.add("card-in");

    $("#q-text").innerHTML = fmt(item.q);
    const code = $("#q-code");
    if (item.c) {
      code.innerHTML = highlightSQL(item.c);
      code.style.display = "";
      const lines = item.c.split("\n").length;
      $("#q-lines").textContent = "SQL · " + lines + (lines === 1 ? " line" : " lines");
    } else {
      code.innerHTML = "";
      code.style.display = "none";
      $("#q-lines").textContent = "SQL";
    }
    const err = $("#q-error");
    err.innerHTML = item.e ? formatError(item.e) : "";
    err.style.display = item.e ? "" : "none";

    const box = $("#options");
    box.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    item.o.forEach((text, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.index = String(idx);
      btn.innerHTML =
        '<span class="option-key">' + letters[idx] + "</span>" +
        '<span class="option-text">' + fmt(text) + "</span>";
      btn.addEventListener("click", (e) => answer(idx, e));
      box.appendChild(btn);
    });

    S.locked = false;
    startTimer();
  }

  /* ------------------------------ answering ------------------------------ */
  function answer(chosen, ev) {
    if (S.locked) return;
    // A real mouse, touch or key press is always trusted. el.click() or
    // dispatchEvent() from the console, a bookmarklet or an extension is not.
    // The scripted click is ignored and counted; the student can still answer.
    if (CONFIG.PROCTORING && ev && !ev.isTrusted) {
      violation("automation", "An answer was clicked automatically by a script. It was not accepted.");
      return;
    }
    S.locked = true;
    stopTimer();

    const item = S.deck[S.i];
    const taken = (performance.now() - S.qStartedAt) / 1000;
    const isRight = chosen === item.a;

    const buttons = $$("#options .option");
    buttons.forEach((b) => b.classList.add("is-disabled"));
    buttons[item.a].classList.add("is-correct");
    if (!isRight) buttons[chosen].classList.add("is-wrong");

    if (isRight) {
      S.correct++;
      S.streak++;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      // 10 points, plus a speed bonus of up to 5 more for answering fast
      const speedBonus = Math.max(0, 1 - taken / CONFIG.SECONDS_PER_QUESTION);
      S.score += 10 + Math.round(speedBonus * 5);
      flash("ok");
    } else {
      S.wrong++;
      S.streak = 0;
      flash("no");
    }

    S.log.push({
      n: S.i + 1, topic: item.t, q: item.q, c: item.c || "", e: item.e || "",
      picked: item.o[chosen], answer: item.correctText,
      right: isRight, secs: +taken.toFixed(2)
    });

    setTimeout(next, CONFIG.FEEDBACK_MS);
  }

  function onTimeout() {
    if (S.locked) return;
    S.locked = true;

    const item = S.deck[S.i];
    const buttons = $$("#options .option");
    buttons.forEach((b) => b.classList.add("is-disabled"));
    buttons[item.a].classList.add("is-correct");

    S.skipped++;
    S.streak = 0;
    flash("out");

    S.log.push({
      n: S.i + 1, topic: item.t, q: item.q, c: item.c || "", e: item.e || "",
      picked: "— timed out —", answer: item.correctText,
      right: false, secs: CONFIG.SECONDS_PER_QUESTION
    });

    setTimeout(next, CONFIG.TIMEOUT_FEEDBACK_MS);
  }

  function flash(kind) {
    const el = $("#flash");
    el.textContent = kind === "ok" ? "Correct" : kind === "no" ? "Wrong" : "Time up";
    el.className = "flash is-" + kind;
    setTimeout(() => { el.className = "flash"; }, CONFIG.FEEDBACK_MS + 150);
  }

  function next() {
    if (S.terminated) return;
    S.i++;
    if (S.i >= S.deck.length) return finish();
    if (CONFIG.PROGRESS_TRACKING && S.i % CONFIG.PROGRESS_EVERY === 0) sendProgress("in-progress");
    renderQuestion();
  }

  /* ------------------------------- results ------------------------------- */
  function finish() {
    if (S.terminated) return;
    stopTimer();
    hideGuard();
    S.finished = true;
    const totalSecs = (Date.now() - S.startedAt) / 1000;
    const total = S.deck.length;
    const accuracy = total ? Math.round((S.correct / total) * 100) : 0;

    $("#progress-fill").style.width = "100%";
    $("#res-accuracy").textContent = accuracy + "%";
    $("#res-score").textContent    = S.score;
    $("#res-correct").textContent  = S.correct;
    $("#res-wrong").textContent    = S.wrong;
    $("#res-skipped").textContent  = S.skipped;
    $("#res-streak").textContent   = S.bestStreak;
    $("#res-time").textContent     = mmss(totalSecs);
    $("#res-avg").textContent      = (totalSecs / total).toFixed(1) + "s";
    $("#res-name").textContent     = S.player.name || "Anonymous";
    $("#res-ident").textContent    =
      "Section " + S.player.section + " · " + S.player.enrolment;

    // score ring
    const ring = $("#res-ring-fill");
    const len = 2 * Math.PI * 68;
    ring.style.strokeDasharray = String(len);
    ring.style.strokeDashoffset = String(len * (1 - accuracy / 100));

    $("#res-verdict").textContent =
      accuracy >= 90 ? "Outstanding — you read SQL like the planner does." :
      accuracy >= 75 ? "Strong debugger. Review the misses below and you are set." :
      accuracy >= 60 ? "Decent eye for bugs. Tighten the weak topics below." :
      accuracy >= 40 ? "Shaky — run these snippets in psql and read the errors." :
                       "Start again: write, run and break each query yourself.";
    if (isMalpractice()) {
      $("#res-verdict").textContent = "Recorded as malpractice: " + violationSummary() + ".";
    }

    renderTopics();
    renderReview();
    show("#screen-result");

    if (accuracy > CONFIG.CONFETTI_MIN_ACCURACY) setTimeout(confettiBurst, 220);

    if (CONFIG.PROGRESS_TRACKING) sendProgress("completed");
    submitResult(buildPayload(accuracy, totalSecs));
    if (CONFIG.SHOW_LEADERBOARD) loadLeaderboard();
  }

  function topicStats() {
    const map = {};
    S.log.forEach((r) => {
      map[r.topic] = map[r.topic] || { total: 0, right: 0 };
      map[r.topic].total++;
      if (r.right) map[r.topic].right++;
    });
    return map;
  }

  function renderTopics() {
    const map = topicStats();
    const box = $("#topic-bars");
    box.innerHTML = "";
    Object.keys(map).sort().forEach((topic) => {
      const t = map[topic];
      const pct = Math.round((t.right / t.total) * 100);
      const row = document.createElement("div");
      row.className = "topic-row";
      row.innerHTML =
        '<div class="topic-head"><span>' + escapeHTML(topic) + "</span>" +
        "<span>" + t.right + "/" + t.total + " · " + pct + "%</span></div>" +
        '<div class="topic-track"><div class="topic-fill" style="width:' + pct + '%"></div></div>';
      box.appendChild(row);
    });
  }

  function renderReview() {
    if (!CONFIG.ALLOW_REVIEW) { $("#review-toggle").style.display = "none"; return; }
    const misses = S.log.filter((r) => !r.right);
    $("#review-count").textContent = misses.length;
    const box = $("#review-list");
    box.innerHTML = "";
    if (!misses.length) {
      box.innerHTML = '<p class="muted">Nothing to review — a clean sweep.</p>';
      return;
    }
    misses.forEach((r) => {
      const el = document.createElement("div");
      el.className = "review-item";
      el.innerHTML =
        '<div class="review-q"><span class="review-n">Q' + r.n + "</span>" + fmt(r.q) + "</div>" +
        (r.c ? '<pre class="q-code q-code-sm">' + highlightSQL(r.c) + "</pre>" : "") +
        (r.e ? '<pre class="q-error q-error-sm">' + formatError(r.e) + "</pre>" : "") +
        '<div class="review-line review-bad">Your answer: ' + fmt(r.picked) + "</div>" +
        '<div class="review-line review-good">Correct: ' + fmt(r.answer) + "</div>" +
        '<div class="review-topic">' + escapeHTML(r.topic) + "</div>";
      box.appendChild(el);
    });
  }

  /* ------------------------------ confetti ------------------------------ */
  /* Self-contained canvas burst - no library, so nothing extra to load and
     nothing to break if a CDN is blocked on the college network. */
  function confettiBurst() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Browsers pause rAF in a hidden tab, so a burst started there would just
    // sit frozen until the student came back. Skip it instead.
    if (document.hidden) return;

    const old = document.querySelector(".confetti");
    if (old) old.remove();                       // a replayed round starts clean

    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      canvas.width  = innerWidth  * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener("resize", size);

    const COLORS = ["#16a34a", "#2563eb", "#d97706", "#dc2626", "#0ea5e9", "#a855f7", "#facc15"];
    const parts = [];
    const narrow = innerWidth < 700;

    // Two cannons firing inwards from the bottom corners.
    function cannon(x, y, angle, count) {
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 0.7;
        const speed  = 680 + Math.random() * 520;
        parts.push({
          x: x, y: y,
          vx: Math.cos(angle + spread) * speed,
          vy: Math.sin(angle + spread) * speed,
          w: 6 + Math.random() * 6,
          h: 9 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 14,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 0,
          ttl: 2.9 + Math.random() * 1.5
        });
      }
    }
    const n = narrow ? 55 : 90;
    cannon(0, innerHeight, -Math.PI / 3.1, n);              // bottom-left
    cannon(innerWidth, innerHeight, -Math.PI + Math.PI / 3.1, n);  // bottom-right

    // Tuned so the arc just reaches the top of the screen and clears in ~3s.
    const GRAVITY = 850, DRAG = 0.995;
    let last = performance.now();
    let done = false;

    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(failsafe);
      removeEventListener("resize", size);
      canvas.remove();
    }
    // Wall-clock backstop: if the tab is hidden mid-flight the frame loop
    // stalls, so this clears the canvas even when no frames ever arrive.
    const failsafe = setTimeout(cleanup, 9000);

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);   // clamp after a tab switch
      last = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);

      let alive = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life += dt;
        if (p.life > p.ttl) continue;

        p.vy += GRAVITY * dt;
        p.vx *= DRAG;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
        p.rot += p.vrot * dt;

        if (p.y - 40 > innerHeight) continue;           // fallen past the bottom
        alive++;

        const fade = p.life > p.ttl - 0.6 ? (p.ttl - p.life) / 0.6 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // squashing the width as it spins reads as a flat strip tumbling
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.rot * 1.6)), p.h);
        ctx.restore();
      }

      if (done) return;
      if (alive > 0) requestAnimationFrame(frame);
      else cleanup();
    }
    requestAnimationFrame(frame);
  }

  /* --------------------------- sheet submission --------------------------- */
  function identity() {
    return {
      attemptId: S.attemptId,
      name:      S.player.name,
      section:   S.player.section,
      enrolment: S.player.enrolment,
      ip:        S.ip
    };
  }

  function buildPayload(accuracy, totalSecs) {
    const map = topicStats();
    const topicSummary = Object.keys(map).sort()
      .map((k) => k + ": " + map[k].right + "/" + map[k].total).join(" | ");

    return Object.assign(identity(), {
      score: S.score,
      total: S.deck.length,
      answered: S.log.length,
      correct: S.correct,
      wrong: S.wrong,
      skipped: S.skipped,
      accuracy: accuracy,
      bestStreak: S.bestStreak,
      leftPageCount: S.leftPageCount,
      malpractice: isMalpractice(),
      violations: totalViolations(),
      screenExits: S.v.exits,
      resizes: S.v.resizes,
      inspectAttempts: S.v.inspect,
      automatedClicks: S.v.automation,
      malpracticeReason: S.malReason,
      screenBaseline: describeBaseline(),
      timeTakenSec: +totalSecs.toFixed(1),
      avgSecPerQ: +(totalSecs / S.deck.length).toFixed(2),
      topicBreakdown: topicSummary,
      answers: S.log.map((r) => ({ n: r.n, t: r.topic, picked: r.picked, ok: r.right, s: r.secs })),
      clientTime: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
  }

  /* Live checkpoint — one upserted row per attempt, so an abandoned round
     still shows how far the student got. */
  function progressPayload(status) {
    return Object.assign(identity(), {
      action: "progress",
      status: status,
      answered: S.log.length,
      total: S.deck.length,
      correct: S.correct,
      wrong: S.wrong,
      skipped: S.skipped,
      score: S.score,
      leftPageCount: S.leftPageCount,
      malpractice: isMalpractice(),
      violations: totalViolations(),
      screenExits: S.v.exits,
      resizes: S.v.resizes,
      inspectAttempts: S.v.inspect,
      automatedClicks: S.v.automation,
      progressPct: S.deck.length ? Math.round((S.log.length / S.deck.length) * 100) : 0,
      elapsedSec: S.startedAt ? +((Date.now() - S.startedAt) / 1000).toFixed(1) : 0,
      clientTime: new Date().toISOString()
    });
  }

  function sendProgress(status) {
    if (!CONFIG.APPS_SCRIPT_URL || !CONFIG.PROGRESS_TRACKING || !S.attemptId) return;
    const body = JSON.stringify(progressPayload(status));

    // keepalive lets an in-flight checkpoint survive the page going away.
    fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      keepalive: true
    }).catch(() => {});
  }

  const roundIsLive = () => Boolean(S.attemptId) && Boolean(S.startedAt) && !S.finished;

  // The tab was closed or navigated away from. Beacons survive unload, where
  // a normal fetch may not. Sent at most once per attempt.
  function sendAbandon() {
    if (!CONFIG.APPS_SCRIPT_URL || !CONFIG.PROGRESS_TRACKING) return;
    if (!roundIsLive() || S.abandonSent) return;
    S.abandonSent = true;

    const body = JSON.stringify(progressPayload("abandoned"));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CONFIG.APPS_SCRIPT_URL,
        new Blob([body], { type: "text/plain;charset=UTF-8" }));
    } else {
      fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body, keepalive: true
      }).catch(() => {});
    }
  }

  /* Backgrounding the tab is not the same as quitting — a student may well
     come back. Each round-trip is counted once and the row is corrected on
     return, so nobody is left wrongly marked as having walked away. */
  function onHidden() {
    if (!roundIsLive() || S.hidden) return;
    S.hidden = true;
    S.leftPageCount++;
    sendProgress("left-page");
  }

  function onVisible() {
    if (!S.hidden) return;
    S.hidden = false;
    if (roundIsLive()) sendProgress("in-progress");
  }

  function setSaveStatus(cls, text) {
    const el = $(S.terminated ? "#term-save" : "#save-status");
    el.className = "save-status " + cls;
    el.textContent = text;
  }

  function queueLocally(payload) {
    try {
      const q = JSON.parse(localStorage.getItem("pgdbg_pending") || "[]");
      q.push(payload);
      localStorage.setItem("pgdbg_pending", JSON.stringify(q.slice(-25)));
    } catch (e) { /* storage full or blocked — nothing more we can do */ }
  }

  function postToSheet(payload) {
    // text/plain keeps this a "simple request", so the browser sends no
    // CORS preflight — Apps Script cannot answer an OPTIONS request.
    return fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "save" }, payload)),
      redirect: "follow"
    }).then((r) => r.json());
  }

  function submitResult(payload) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      setSaveStatus("is-idle", "Offline mode — result not sent (no Apps Script URL configured).");
      return;
    }
    setSaveStatus("is-pending", "Saving your result…");

    postToSheet(payload)
      .then((res) => {
        if (res && res.ok) { setSaveStatus("is-ok", "Result saved to the sheet ✓"); flushPending(); }
        else { throw new Error((res && res.error) || "Unexpected response"); }
      })
      .catch(() => {
        // Last resort: fire-and-forget. The row usually still lands, but the
        // browser will not let us read the reply, so we say so honestly.
        fetch(CONFIG.APPS_SCRIPT_URL, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ action: "save" }, payload))
        }).catch(() => {});
        queueLocally(payload);
        setSaveStatus("is-warn", "Sent, but delivery could not be confirmed. A copy is kept in this browser and retried next time.");
      });
  }

  function flushPending() {
    let q;
    try { q = JSON.parse(localStorage.getItem("pgdbg_pending") || "[]"); } catch (e) { return; }
    if (!q.length || !CONFIG.APPS_SCRIPT_URL) return;
    localStorage.removeItem("pgdbg_pending");
    q.forEach((p) => { postToSheet(p).catch(() => queueLocally(p)); });
  }

  function loadLeaderboard() {
    if (!CONFIG.APPS_SCRIPT_URL) return;
    const box = $("#leaderboard");
    box.innerHTML = '<p class="muted">Loading leaderboard…</p>';
    fetch(CONFIG.APPS_SCRIPT_URL + "?action=leaderboard&limit=10")
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.ok || !res.rows || !res.rows.length) {
          box.innerHTML = '<p class="muted">No leaderboard data yet.</p>'; return;
        }
        box.innerHTML =
          '<table class="lb"><thead><tr><th>#</th><th>Name</th><th>Sec</th><th>Score</th><th>Acc.</th></tr></thead><tbody>' +
          res.rows.map((r, i) =>
            "<tr" + (r.enrolment === S.player.enrolment ? ' class="lb-me"' : "") + "><td>" + (i + 1) +
            "</td><td>" + escapeHTML(r.name || "—") + "</td><td>" + escapeHTML(r.section || "—") +
            "</td><td>" + r.score + "</td><td>" + r.accuracy + "%</td></tr>").join("") +
          "</tbody></table>";
      })
      .catch(() => { box.innerHTML = '<p class="muted">Leaderboard unavailable.</p>'; });
  }

  /* ------------------------------ proctoring ------------------------------ */
  /* Measured in device pixels (CSS px x devicePixelRatio) so that browser
     zoom, which changes CSS px but not the physical screen, is not flagged. */
  function measure() {
    const dpr = window.devicePixelRatio || 1;
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      pw: Math.round(window.innerWidth * dpr), ph: Math.round(window.innerHeight * dpr),
      sw: screen.width, sh: screen.height, dpr: dpr
    };
  }

  function describeBaseline() {
    const b = S.baseline;
    if (!b) return "";
    return "screen " + b.sw + "x" + b.sh + " · viewport " + b.vw + "x" + b.vh + " @" + b.dpr + "x";
  }

  // Wait until the fullscreen animation has stopped resizing the window.
  function afterSettle(fn) {
    S.settlingUntil = Date.now() + 2500;
    let quiet = null;
    const cap = setTimeout(done, 2500);
    function done() {
      clearTimeout(quiet); clearTimeout(cap);
      removeEventListener("resize", kick);
      S.settlingUntil = 0;
      fn();
    }
    function kick() { clearTimeout(quiet); quiet = setTimeout(done, 450); }
    addEventListener("resize", kick);
    kick();
  }

  /* Compares the current size with the one measured on entry. A docked
     Inspect panel, split screen or moving to another display all change it.
     Rotating a phone swaps width and height, which is allowed. */
  function sizeChanged() {
    const b = S.baseline, c = measure();
    const tol = CONFIG.RESIZE_TOLERANCE_PX * b.dpr;
    const off = (w, h) => Math.abs(c.pw - w) > tol || (enforceFs() && Math.abs(c.ph - h) > tol);
    const screenOff = !((c.sw === b.sw && c.sh === b.sh) || (c.sw === b.sh && c.sh === b.sw));
    if (screenOff) return "the screen changed from " + b.sw + "x" + b.sh + " to " + c.sw + "x" + c.sh;
    if (off(b.pw, b.ph) && off(b.ph, b.pw)) {
      return "the exam window changed from " + b.vw + "x" + b.vh + " to " + c.vw + "x" + c.vh +
             " (developer tools or another window opened beside it)";
    }
    return "";
  }

  // Without the Fullscreen API (iPhone) the round runs windowed, and the
  // collapsing address bar changes the height, so only the width is checked.
  const enforceFs = () => CONFIG.FULLSCREEN_ON_START && fsSupported();

  const sizeKey = () => { const c = measure(); return c.pw + "x" + c.ph + "/" + c.sw + "x" + c.sh; };

  /* Counts each settled size change once. Entering and leaving fullscreen
     resize the window too, but those go through afterSettle(), which only
     records the new size — they are counted as exits, not resizes. */
  function checkSize() {
    if (!CONFIG.PROCTORING || !roundIsLive() || !S.baseline) return;
    const wait = S.settlingUntil - Date.now();
    if (wait > 0) { clearTimeout(S.resizeTimer); S.resizeTimer = setTimeout(checkSize, wait + 50); return; }
    const key = sizeKey();
    if (key === S.lastSizeKey) return;
    S.lastSizeKey = key;
    if (isFullscreen() || !enforceFs()) {
      const why = sizeChanged();
      if (why) violation("resizes", "The screen size changed: " + why + ". Close anything opened beside the exam.");
    } else {
      violation("resizes", "The exam window was resized, minimised or maximised.");
    }
  }

  function onResize() {
    clearTimeout(S.resizeTimer);
    S.resizeTimer = setTimeout(checkSize, 600);
  }

  /* The alarm is synthesised with Web Audio, so there is no sound file to
     load. Browsers only allow audio after a user gesture, so the context is
     created on the Start click and simply reused when the alarm fires. */
  let audioCtx = null;
  let alarmUntil = 0;

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* no audio on this device — the red warning still shows */ }
  }

  /* A rising-and-falling siren, one sweep per second, at full scale — the
     loudest a page can play. The laptop's own volume and mute are outside
     any website's control, which is what the sound check before Start is for. */
  function playSiren(secs) {
    if (!audioCtx) return;
    try {
      audioCtx.resume();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      for (let t = 0; t < secs; t++) {
        osc.frequency.setValueAtTime(650, t0 + t);
        osc.frequency.linearRampToValueAtTime(1300, t0 + t + 0.5);
        osc.frequency.linearRampToValueAtTime(650, t0 + t + 1);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.03);
      gain.gain.setValueAtTime(1, t0 + secs - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + secs);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + secs);
    } catch (e) { /* ignore */ }
  }

  function soundAlarm() {
    const secs = CONFIG.ALARM_SECONDS;
    if (!secs || !audioCtx || Date.now() < alarmUntil) return;   // don't stack sirens
    alarmUntil = Date.now() + secs * 1000;
    playSiren(secs);
  }

  // A soft two-note chime for the sound check — the siren is kept for
  // malpractice, so nobody hears it just for setting up.
  function playChime() {
    if (!audioCtx) return;
    try {
      audioCtx.resume();
      const t0 = audioCtx.currentTime;
      [[660, 0], [880, 0.28]].forEach(([freq, at]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.6);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + 0.65);
      });
    } catch (e) { /* ignore */ }
  }

  // Start-screen sound check: the student must hear the chime first.
  function testSound() {
    unlockAudio();
    playChime();
    $("#in-sound").disabled = false;
    $("#sound-hint").textContent = "Didn't hear it? Unmute, unplug headphones, turn the volume up, and play it again.";
  }

  const totalViolations = () => S.v.exits + S.v.resizes + S.v.inspect + S.v.automation;
  const isMalpractice = () => totalViolations() >= CONFIG.MALPRACTICE_LIMIT;

  /* Every violation is shown to the student, counted, and the round goes on.
     Reaching MALPRACTICE_LIMIT marks the attempt as malpractice. */
  function violation(kind, message) {
    if (!CONFIG.PROCTORING || !roundIsLive()) return;
    // One exit is one exit: Esc-to-switch-tabs fires fullscreenchange, blur
    // and visibilitychange together, so exits 1.5 s apart are merged.
    if (kind === "exits") {
      const now = Date.now(), dup = now - S.lastExitAt < 1500;
      S.lastExitAt = now;
      if (dup) { showGuard(message); return; }
    }
    S.v[kind]++;
    const reached = isMalpractice() && !S.malReason;
    if (reached) {
      S.malReason = "Reached " + totalViolations() + " violations — " + violationSummary() + ".";
    }
    renderViolations();
    sendProgress(reached ? "malpractice" : "violation");

    // From the limit on, every violation sets the alarm off again.
    if (isMalpractice()) soundAlarm();
    if (reached && CONFIG.END_AT_LIMIT) { endForMalpractice(); return; }
    showGuard(message);
  }

  function violationSummary() {
    return "screen exits " + S.v.exits + ", resizes " + S.v.resizes +
           ", inspect attempts " + S.v.inspect + ", automated clicks " + S.v.automation;
  }

  function renderViolations() {
    const n = totalViolations();
    $("#stat-exits").textContent = n + "/" + CONFIG.MALPRACTICE_LIMIT;
    $("#hstat-exits").classList.toggle("is-alert", n > 0);
  }

  function showGuard(message) {
    const n = totalViolations();
    $("#guard-title").textContent = isMalpractice() ? "Marked as malpractice" : "Warning " + n + " of " + CONFIG.MALPRACTICE_LIMIT;
    $("#guard-msg").textContent = message;
    $("#guard-count").textContent = n;
    $("#guard-limit").textContent = "of " + CONFIG.MALPRACTICE_LIMIT;
    $("#g-exits").textContent = S.v.exits;
    $("#g-resizes").textContent = S.v.resizes;
    $("#g-inspect").textContent = S.v.inspect;
    $("#g-auto").textContent = S.v.automation;
    $("#guard-note").textContent = isMalpractice()
      ? "This attempt is recorded as malpractice. You may finish the test, and your instructor will review it."
      : "At " + CONFIG.MALPRACTICE_LIMIT + " violations the attempt is recorded as malpractice. The clock is still running.";
    $("#guard-btn").textContent = enforceFs() && !isFullscreen() ? "Return to fullscreen" : "Back to the question";
    $("#guard").classList.toggle("is-alarm", isMalpractice());
    $("#guard-tag").textContent = isMalpractice() ? "MALPRACTICE" : "WARNING";
    $("#guard").hidden = false;
    $("#guard-btn").focus();
  }

  function hideGuard() { $("#guard").hidden = true; }

  function onGuardButton() {
    unlockAudio();
    if (!enforceFs() || isFullscreen()) { hideGuard(); return; }
    // The overlay stays up until fullscreen is back and the size re-checked.
    enterFullscreen().catch(() => {
      $("#guard-msg").textContent = "The browser refused fullscreen. Click the button again.";
    });
  }

  // Record the size a fullscreen transition lands on without counting it.
  function settleTransition(then) {
    afterSettle(() => {
      if (!roundIsLive()) return;
      if (then) then(); else S.lastSizeKey = sizeKey();
    });
  }

  function onFullscreenChange() {
    if (isFullscreen()) {
      if (S.awaitingFs) {                                 // first entry: measure, then begin
        S.awaitingFs = false;
        afterSettle(beginRound);
      } else if (roundIsLive()) {                         // back after an exit
        settleTransition(() => {
          checkSize();                                    // back, but smaller? that is a resize
          if (isFullscreen()) hideGuard();
        });
      }
      return;
    }
    if (!roundIsLive()) return;
    settleTransition();
    violation("exits", "You left fullscreen. The question is hidden until you return.");
  }

  function onBlur() {
    // The Esc-then-click case is already handled by fullscreenchange; this
    // catches Cmd/Alt+Tab and undocked developer tools taking focus.
    violation("exits", "The exam window lost focus — another app or window was opened.");
  }

  const DEVTOOLS_KEYS = (e) => {
    const k = e.key.toLowerCase();
    return e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["i", "j", "c", "k"].includes(k)) ||
      (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k)) ||
      (e.ctrlKey && !e.shiftKey && k === "u");               // view source
  };

  // Only used when END_AT_LIMIT is on: stops the round at the limit.
  function endForMalpractice() {
    if (S.terminated || !roundIsLive()) return;
    const totalSecs = (Date.now() - S.startedAt) / 1000;
    S.terminated = true;
    S.locked = true;
    S.finished = true;               // stops the abandon beacon and further counting
    stopTimer();
    clearTimeout(S.resizeTimer);
    hideGuard();

    $("#term-reason").textContent = S.malReason;
    $("#term-who").textContent = S.player.name + " · Section " + S.player.section + " · " + S.player.enrolment;
    $("#term-where").textContent = "Question " + Math.min(S.i + 1, S.deck.length) + " of " + S.deck.length +
      " · " + S.correct + " correct so far";
    $("#term-exits").textContent = violationSummary();
    $("#term-screen").textContent = describeBaseline() || "not measured";
    show("#screen-terminated");
    exitFullscreen();

    const accuracy = S.deck.length ? Math.round((S.correct / S.deck.length) * 100) : 0;
    if (CONFIG.PROGRESS_TRACKING) sendProgress("terminated");
    submitResult(buildPayload(accuracy, totalSecs));
  }

  /* -------------------------------- start -------------------------------- */
  function startQuiz() {
    unlockAudio();                  // inside the click, so the alarm can play later
    if (S.awaitingFs) return;
    const name      = $("#in-name").value.trim();
    const section   = $("#in-section").value.trim();
    const enrolment = $("#in-enrolment").value.trim();

    if (!name)      { showFormError("Please enter your full name."); return; }
    if (!section)   { showFormError("Please choose your section."); return; }
    if (!enrolment) { showFormError("Please enter your enrolment number."); return; }

    if (CONFIG.ENROLMENT_PATTERN) {
      let re = null;
      try { re = new RegExp(CONFIG.ENROLMENT_PATTERN); } catch (e) { re = null; }
      if (re && !re.test(enrolment)) {
        showFormError(CONFIG.ENROLMENT_HINT || "That enrolment number does not look right.");
        return;
      }
    }
    if (CONFIG.SOUND_CHECK && CONFIG.ALARM_SECONDS && !$("#in-sound").checked) {
      showFormError("Play the test sound with your volume at full, then tick the box.");
      return;
    }
    showFormError("");

    S.player = { name: name, section: section, enrolment: enrolment };

    if (!enforceFs()) { S.baseline = measure(); beginRound(); return; }

    // The round begins in onFullscreenChange, once the size has settled and
    // been measured — the clock never runs before the screen is locked in.
    S.awaitingFs = true;
    const btn = $("#btn-start");
    btn.disabled = true;
    btn.textContent = "Entering fullscreen…";
    const refused = () => {
      if (!S.awaitingFs) return;
      S.awaitingFs = false;
      btn.disabled = false;
      btn.innerHTML = "▶&nbsp; Start the round";
      showFormError("The test must run in fullscreen. Allow fullscreen and press Start again.");
    };
    enterFullscreen().catch(refused);
    setTimeout(() => { if (!isFullscreen()) refused(); }, 4000);
  }

  function beginRound() {
    const btn = $("#btn-start");
    btn.disabled = false;
    btn.innerHTML = "▶&nbsp; Start the round";
    if (enforceFs() && !isFullscreen()) {                 // left again before it began
      showFormError("The test must run in fullscreen. Press Start again and stay in fullscreen.");
      return;
    }

    // First fullscreen entry: this is the size every later check compares to.
    S.baseline = measure();
    S.attemptId = uuid();
    S.deck = buildDeck();
    S.i = 0; S.score = 0; S.streak = 0; S.bestStreak = 0;
    S.correct = 0; S.wrong = 0; S.skipped = 0; S.log = [];
    S.finished = false;
    S.hidden = false;
    S.leftPageCount = 0;
    S.abandonSent = false;
    S.v = { exits: 0, resizes: 0, inspect: 0, automation: 0 };
    S.lastExitAt = 0; S.lastSizeKey = sizeKey();
    S.terminated = false; S.malReason = "";
    S.startedAt = Date.now();
    renderViolations();
    hideGuard();

    $("#q-total").textContent = S.deck.length;
    show("#screen-quiz");
    if (CONFIG.PROGRESS_TRACKING) sendProgress("started");

    renderQuestion();
    if (navigator.webdriver) {
      violation("automation", "This browser is being controlled by automation software.");
    }
  }

  function showFormError(msg) {
    const el = $("#form-error");
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  function restart() {
    stopTimer();
    hideGuard();
    S.attemptId = "";
    S.startedAt = 0;
    S.baseline = null;
    if (CONFIG.FULLSCREEN_ON_START) exitFullscreen();
    show("#screen-start");
  }

  /* ------------------------------- wiring -------------------------------- */
  function buildSectionInput() {
    const wrap = $("#field-section");
    if (CONFIG.SECTIONS && CONFIG.SECTIONS.length) {
      const sel = $("#in-section");
      sel.innerHTML = '<option value="" disabled selected>Choose…</option>' +
        CONFIG.SECTIONS.map((s) =>
          '<option value="' + escapeHTML(s) + '">' + escapeHTML(s) + "</option>").join("");
    } else {
      // No fixed list configured — swap the dropdown for a free-text box.
      wrap.innerHTML = '<span>Section</span>' +
        '<input id="in-section" type="text" placeholder="e.g. A" maxlength="20" autocomplete="off">';
    }
  }

  function init() {
    $("#quiz-title").innerHTML      = CONFIG.QUIZ_TITLE;
    $("#quiz-subtitle").textContent = CONFIG.QUIZ_SUBTITLE;
    $("#footer-note").textContent   = CONFIG.FOOTER_NOTE;
    $("#meta-count").textContent    = Math.min(CONFIG.QUESTIONS_PER_ROUND, QUESTIONS.length);
    $("#meta-secs").textContent     = CONFIG.SECONDS_PER_QUESTION;
    $("#timer-value").textContent   = CONFIG.SECONDS_PER_QUESTION;
    if (!CONFIG.SHOW_LEADERBOARD) $("#leaderboard-card").style.display = "none";
    if (!CONFIG.CAPTURE_IP) {
      $("#privacy-note").textContent =
        "Recorded for this round: name, section, enrolment number, progress and score.";
    }

    buildSectionInput();
    lookupIP();

    $("#btn-start").addEventListener("click", startQuiz);
    if (CONFIG.SOUND_CHECK && CONFIG.ALARM_SECONDS) $("#btn-sound").addEventListener("click", testSound);
    else $("#sound-check").style.display = "none";
    $("#in-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#in-section").focus(); });
    $("#in-enrolment").addEventListener("keydown", (e) => { if (e.key === "Enter") startQuiz(); });
    $("#btn-retry").addEventListener("click", restart);
    $("#btn-review-again").addEventListener("click", restart);
    $("#guard-btn").addEventListener("click", onGuardButton);

    $("#review-toggle").addEventListener("click", () => {
      const panel = $("#review-list");
      const open = panel.classList.toggle("is-open");
      $("#review-toggle").setAttribute("aria-expanded", String(open));
      $("#review-caret").textContent = open ? "▲" : "▼";
    });

    // Keyboard: 1–4 or A–D pick an option.
    document.addEventListener("keydown", (e) => {
      if (CONFIG.PROCTORING && roundIsLive() && DEVTOOLS_KEYS(e)) {
        e.preventDefault();
        violation("inspect", "Opening Inspect / developer tools (" + [e.ctrlKey && "Ctrl", e.metaKey && "Cmd",
          e.altKey && "Alt", e.shiftKey && "Shift", e.key.length === 1 ? e.key.toUpperCase() : e.key]
          .filter(Boolean).join("+") + ") is not allowed during the exam.");
        return;
      }
      if (!$("#screen-quiz").classList.contains("is-active") || S.locked) return;
      if (!$("#guard").hidden) return;                      // no answering blind
      const k = e.key.toLowerCase();
      const map = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
      if (k in map && map[k] < S.deck[S.i].o.length) { e.preventDefault(); answer(map[k], e); }
    });

    // Proctoring: exits, size changes, devtools and scripted clicks are counted.
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onBlur);
    // No right-click menu mid-round, so "Inspect" is one step further away.
    document.addEventListener("contextmenu", (e) => {
      if (!roundIsLive()) return;
      e.preventDefault();
      violation("inspect", "Right-click is disabled during the exam (it opens Inspect).");
    });

    // Leaving mid-round records where the student got to. pagehide is the
    // reliable one on iOS Safari; visibilitychange covers tab switches.
    window.addEventListener("pagehide", sendAbandon);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        onHidden();
        violation("exits", "You switched tab, minimised the window, or opened another app.");
      } else onVisible();
    });

    flushPending();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
