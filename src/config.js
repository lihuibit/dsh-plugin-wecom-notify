// What the notifier may send and where. Everything has a default that keeps it quiet
// rather than failing: an empty webhook ref is the "loaded but not working" state.
import z from '@deepseek-ai/schemastery'

/**
 * The stored switches.
 * @typedef {object} Config
 * @property {string} webhookEnv credential reference holding the webhook URL
 * @property {boolean} enabled the master switch
 * @property {{ reply: boolean, question: boolean, approval: boolean }} events which events deserve a message
 * @property {number} pollMs how often the pending cards are read
 * @property {number} timeoutMs one webhook request may take this long
 * @property {number} textChars how much of the Bot's reply the message quotes
 * @property {number} promptChars how much of the user's own line it quotes
 * @property {number} keepPushed how many sent ids are remembered across restarts
 * @property {number} presenceWindowMs stay quiet this long after the user last acted; 0 never does
 */

/** The applied config: every field present, defaults filled in. */
export const DEFAULTS = Object.freeze({
  webhookEnv: 'WECOM_WEBHOOK',
  enabled: true,
  events: Object.freeze({ reply: true, question: true, approval: true }),
  pollMs: 3000,
  timeoutMs: 5000,
  textChars: 200,
  promptChars: 100,
  keepPushed: 2000,
  presenceWindowMs: 60000,
})

/** The config this plugin accepts; DSH fills in whatever the entry leaves out. */
export const Config = z.object({
  webhookEnv: z.string().min(1).default(DEFAULTS.webhookEnv),
  enabled: z.boolean().default(DEFAULTS.enabled),
  events: z.object({
    reply: z.boolean().default(DEFAULTS.events.reply),
    question: z.boolean().default(DEFAULTS.events.question),
    approval: z.boolean().default(DEFAULTS.events.approval),
  }).default(DEFAULTS.events),
  pollMs: z.natural().min(250).max(600000).default(DEFAULTS.pollMs),
  timeoutMs: z.natural().min(250).max(30000).default(DEFAULTS.timeoutMs),
  textChars: z.natural().min(20).max(2000).default(DEFAULTS.textChars),
  promptChars: z.natural().min(0).max(1000).default(DEFAULTS.promptChars),
  keepPushed: z.natural().min(10).max(100000).default(DEFAULTS.keepPushed),
  presenceWindowMs: z.natural().min(0).max(86400000).default(DEFAULTS.presenceWindowMs),
})

/**
 * Fill in every field of a config DSH has already validated, so the code below reads
 * plain values instead of guarding each one.
 * @param {Partial<Config>} [config] the entry's config
 * @returns {Config} the same config with defaults applied
 */
export function resolveConfig(config = {}) {
  const events = { ...DEFAULTS.events, ...config.events }
  return {
    webhookEnv: typeof config.webhookEnv === 'string' && config.webhookEnv !== '' ? config.webhookEnv : DEFAULTS.webhookEnv,
    enabled: config.enabled !== false,
    events: { reply: events.reply !== false, question: events.question !== false, approval: events.approval !== false },
    pollMs: positive(config.pollMs, DEFAULTS.pollMs),
    timeoutMs: positive(config.timeoutMs, DEFAULTS.timeoutMs),
    textChars: positive(config.textChars, DEFAULTS.textChars),
    promptChars: nonNegative(config.promptChars, DEFAULTS.promptChars),
    keepPushed: positive(config.keepPushed, DEFAULTS.keepPushed),
    presenceWindowMs: nonNegative(config.presenceWindowMs, DEFAULTS.presenceWindowMs),
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positive(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function nonNegative(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}
