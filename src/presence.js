// Whether someone is at the computer. The Host cannot see a browser's focus or which
// conversation is on screen, so it responds to the strongest signal it does get: a human
// acting in a Session. A message the user typed, an answered card and an answered question
// all arrive here; a conversation switch does not, so someone who only browses is treated as
// away once the window has passed. Sending a message the user did not need is cheaper than
// missing the one they did, so the window errs towards telling them.

/**
 * How long one human action keeps the notifier quiet, when `presenceWindowMs` is left at
 * its default.
 */
export const DEFAULT_PRESENCE_WINDOW_MS = 60_000

/**
 * The last time the user did something a Session can see, and whether that still counts.
 */
export class Presence {
  /** @type {number} */
  #lastActivityAt = 0
  /** @type {number} */
  #windowMs
  /** @type {() => number} */
  #now

  /**
   * @param {number} windowMs how long an action keeps the notifier quiet; 0 disables this
   * @param {() => number} [now] the clock, for tests
   */
  constructor(windowMs, now = Date.now) {
    this.#windowMs = windowMs
    this.#now = now
  }

  /**
   * Record one action by the user.
   * @returns {void}
   */
  touch() {
    this.#lastActivityAt = this.#now()
  }

  /**
   * Whether the user acted recently enough that the screen already shows the answer.
   * @returns {boolean} true when a notice should be skipped
   */
  atComputer() {
    if (this.#windowMs <= 0) return false
    return this.#now() - this.#lastActivityAt < this.#windowMs
  }

  /**
   * How long ago the last action was, for a log line.
   * @returns {number | undefined} milliseconds, or undefined when nothing was seen yet
   */
  idleFor() {
    return this.#lastActivityAt === 0 ? undefined : this.#now() - this.#lastActivityAt
  }

  /** @returns {number} the configured window in milliseconds */
  get windowMs() {
    return this.#windowMs
  }
}

/**
 * Read one Session event as an action by the user, if it is one.
 * - A prompt the user typed: `user/message` whose source is a human, never one another Bot
 *   relayed or the Host injected.
 * - An answer to a question card: the late reply DSH steers in when the user picks.
 * - An answer to an approval card: `approval/decided`, whose outcome only ever comes from a
 *   decision, a cancellation or the fail-closed path.
 * @param {any} event a Session event
 * @returns {boolean} whether the user acted
 */
export function isUserActivity(event) {
  if (event === null || typeof event !== 'object') return false
  if (event.type === 'approval/decided') return true
  if (event.type !== 'user/message') return false
  const kind = event.data?.source?.kind
  return kind === 'user' || kind === 'user-question-reply'
}
