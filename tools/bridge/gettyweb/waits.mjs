// waits.mjs — what the Getty web run is waiting for right now (2026-11-12).
// The retry loops of contribute.mjs (a stalled page, cards that never turn
// "Ready to submit", re-uploaded files that do not come back) used to wait
// silently. Each now says what it waits for, what it will do next (reload the
// page, press Save metadata again, re-upload), which attempt that is and when
// the wait ends — and the user may skip a retry timer ("Retry now").
//
// One control is shared by every loop of a session. Nothing but counts and our
// own wording is ever put in it: no file name, no page text, no credentials.

/**
 * @typedef {object} WaitInfo
 * @property {string} kind      which loop waits ("files", "pictures", "ready", …)
 * @property {string} reason    why, in counts only
 * @property {string} next      what happens when the wait ends
 * @property {number} endsAt    epoch ms when it ends
 * @property {number} [attempt] this attempt (1-based) …
 * @property {number} [of]      … of this many
 * @property {boolean} skippable true for a retry timer, false for a deadline
 */

/** The wait as the app reads it: the time left is worked out now, never stored. */
function publicWait(wait) {
  const { endsAt, ...rest } = wait;
  return { ...rest, remainingMs: Math.max(0, Math.round(endsAt - Date.now())) };
}

export function createWaitControl() {
  /** @type {WaitInfo | null} */
  let wait = null;
  let activity = null;
  let skipped = false;
  return {
    /** The run waits: replaces any earlier wait and any activity. */
    begin(info) {
      wait = { ...info };
      activity = null;
    },
    /** The wait is over and the run does something: say what. */
    act(text) {
      wait = null;
      skipped = false;
      activity = String(text);
    },
    /** Nothing is waited for any more. */
    end() {
      wait = null;
      activity = null;
      skipped = false;
    },
    /** What to tell the app now, or null. */
    current() {
      if (wait === null && activity === null) return null;
      return { ...(wait === null ? {} : { wait: publicWait(wait) }), ...(activity === null ? {} : { activity }) };
    },
    /** The user pressed "Retry now": true when a retry timer was running. */
    skip() {
      if (wait === null || wait.skippable !== true) return false;
      skipped = true;
      return true;
    },
    /** Looked at once per loop turn: true once after a skip. */
    takeSkip() {
      const was = skipped;
      skipped = false;
      return was;
    },
  };
}
