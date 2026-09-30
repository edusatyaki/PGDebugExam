/* =====================================================================
   CONFIG — the only file you normally need to edit.
   ===================================================================== */

const CONFIG = {

  /* Paste the Apps Script Web App URL here after deploying (see README).
     It must end in /exec — NOT /dev.
     Leave it as "" to run the quiz offline (results stay in the browser). */
  APPS_SCRIPT_URL: "",

  /* Branding shown on the start screen */
  QUIZ_TITLE:    "PostgreSQL <i>Debugging</i> Test",
  QUIZ_SUBTITLE: "75 buggy snippets · 90 seconds each · find what breaks",
  FOOTER_NOTE:   "· verified on PostgreSQL 16",

  /* The round only begins once the browser is in fullscreen. Esc or F11
     can still leave it (no page can prevent that), so every exit is
     counted, the question is covered by a warning, and the count is sent
     to the sheet. Browsers without the Fullscreen API (iPhone Safari) run
     windowed. */
  FULLSCREEN_ON_START: true,

  /* --------------------------- Proctoring ----------------------------- */

  /* Each of these is a violation. The student sees a warning with the
     running count and carries on with the test:
       - leaving fullscreen, switching tab/app, minimising the window,
       - the window or screen size changing (maximise/restore, a docked
         Inspect panel, split screen),
       - trying to open Inspect (F12, Ctrl+Shift+I, Cmd+Opt+I, right-click…),
       - an answer clicked by a script instead of a real mouse or keyboard.
     Every count is saved to the sheet, with Malpractice TRUE/FALSE. */
  PROCTORING: true,
  MALPRACTICE_LIMIT: 10,     // this many violations = malpractice
  END_AT_LIMIT: false,       // true = also stop the test at the limit
  RESIZE_TOLERANCE_PX: 30,   // size change (CSS px) ignored as noise

  /* Timing & round settings */
  SECONDS_PER_QUESTION: 90,   // countdown per question
  QUESTIONS_PER_ROUND:  75,   // how many of the bank to serve (set 50 for a random 50)
  WARN_AT_SECONDS:      15,   // ring turns amber at this many seconds left
  DANGER_AT_SECONDS:    5,    // ring turns red and pulses
  FEEDBACK_MS:          550,  // how long the green/red flash lasts
  TIMEOUT_FEEDBACK_MS:  900,  // longer pause when the clock runs out

  /* ---------------- Student details collected before the round -------- */

  /* Sections offered in the dropdown. Set to [] for a free-text box instead. */
  SECTIONS: ["A", "B", "C", "D", "E"],

  /* Optional format check for the enrolment number, as a regex string.
     Example: "^[0-9]{10}$" for exactly ten digits. "" disables the check. */
  ENROLMENT_PATTERN: "",
  ENROLMENT_HINT:    "",   // message shown when the pattern does not match

  /* ------------------------- IP address capture ----------------------- */

  /* A static site cannot see its own visitor's IP, and Apps Script does not
     expose it either — so it is looked up in the browser from a public
     service. That makes it client-supplied, and therefore spoofable: treat
     it as a soft signal, never as proof of who sat the quiz.
     Set to false to stop collecting it entirely. */
  CAPTURE_IP: true,
  IP_LOOKUP_URLS: [
    "https://api.ipify.org?format=json",              // -> { "ip": "..." }
    "https://api64.ipify.org?format=json",
    "https://ipapi.co/json/"                          // -> { "ip": "...", ... }
  ],

  /* ---------------------- Live progress tracking ---------------------- */

  /* Sends a checkpoint to the sheet as the student works, so you still see
     how far someone got if they close the tab mid-round. */
  PROGRESS_TRACKING: true,
  PROGRESS_EVERY:    10,   // send a checkpoint every N questions

  /* ------------------------- Celebration ------------------------------ */

  /* Confetti fires at the end when accuracy is ABOVE this percentage.
     Set to 0 to celebrate every round, or 101 to switch it off entirely.
     It is skipped automatically for anyone who prefers reduced motion. */
  CONFETTI_MIN_ACCURACY: 70,

  /* Behaviour */
  SHUFFLE_QUESTIONS: true,
  SHUFFLE_OPTIONS:   true,
  SHOW_LEADERBOARD:  true,    // fetch top scores from the sheet after a round
  ALLOW_REVIEW:      true     // show the answer review on the result screen
};
