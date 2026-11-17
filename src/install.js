// The wiring: a finished turn and a newly waiting card each become at most one message.
// Nothing here may throw into a Bot's session: every path that talks to the outside world is
// caught and logged.
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { compose } from './compose.js'
import { Pushed } from './dedupe.js'
import { clip, endedTurn, summarise } from './events.js'
import { cardsOf, newCards } from './pending.js'
import { readTeam } from './team.js'
import { send, webhookOf } from './webhook.js'

/**
 * Register the listeners and the poll this notifier needs, all owned by the plugin's effect
 * scope so unloading it stops everything.
 * @param {object} options
 * @param {any} options.ctx the plugin context
 * @param {import('./config.js').Config} options.config
 * @param {string} options.home where the sent ids are kept
 * @param {(message: string) => void} options.warn
 * @param {typeof fetch} [options.fetch] the webhook transport, for tests
 * @returns {{ stop: () => Promise<void>, poll: () => Promise<void>, pushed: Pushed }}
 */
export function install({ ctx, config, home, warn, fetch }) {
  const pushed = new Pushed(join(home, 'pushed.txt'), config.keepPushed)
  const loaded = pushed.load()
  const dshHome = resolveDshHome()
  /** @type {Map<string, import('./team.js').Owner> | undefined} */
  let team
  /** @type {Map<string, 'approval' | 'question'> | undefined} */
  let cards

  const teamNow = async () => {
    // The team file changes whenever the user edits the team; a turn boundary is a free
    // moment to re-read it. A stale map costs a missing name, never a crash.
    team = await readTeam(dshHome)
    return team
  }

  const tell = async (notice) => {
    const url = await webhookOf(ctx, config.webhookEnv)
    if (url === undefined) {
      warn('wecom-notify: no webhook is configured, nothing was sent')
      return false
    }
    await loaded
    return send({ url, content: compose(notice), timeoutMs: config.timeoutMs, warn, ...(fetch === undefined ? {} : { fetch }) })
  }

  /**
   * A finished turn in a conversation the Bot team owns.
   * @param {any} session
   * @param {number} turn
   */
  const onTurnEnd = async (session, turn) => {
    if (config.events.reply !== true) return
    await loaded
    const id = `reply:${session.id}:${turn}`
    if (pushed.has(id)) return
    const owner = (await teamNow()).get(session.id)
    // Not a Bot team conversation: another plugin's Session, or one the team file does not know.
    if (owner === undefined) return
    // A group's ordinary reply is not worth a system notification; only a card there is.
    if (owner.kind === 'group') return
    const { reply, prompt } = summarise(session)
    pushed.add(id)
    void tell({
      kind: 'reply',
      owner,
      reply: clip(reply, config.textChars),
      prompt: clip(prompt, config.promptChars),
    })
  }

  /**
   * Cards that started waiting since the previous reading.
   * @param {{ card: string, kind: 'approval' | 'question' }[]} fresh
   */
  const onCards = async (fresh) => {
    if (fresh.length === 0) return
    await loaded
    const known = await teamNow()
    for (const { card, kind } of fresh) {
      if (config.events[kind] !== true) continue
      if (pushed.has(card)) continue
      const owner = known.get(card.slice(card.indexOf(':') + 1))
      if (owner === undefined) continue
      pushed.add(card)
      void tell({ kind, owner })
    }
  }

  const poll = async () => {
    try {
      const next = cardsOf(ctx.typertGateway?.getPendingRemoteEvents?.() ?? [])
      const fresh = newCards(cards, next)
      cards = next
      await onCards(fresh)
    } catch (error) {
      warn(`wecom-notify: reading the waiting cards failed: ${messageOf(error)}`)
    }
  }

  const disposeSession = ctx.on('session/event', (session, event) => {
    const turn = endedTurn(event)
    if (turn === undefined) return
    void onTurnEnd(session, turn).catch(error => warn(`wecom-notify: a reply notice failed: ${messageOf(error)}`))
  })

  const timer = setInterval(() => { void poll() }, config.pollMs)
  timer.unref?.()
  // The first reading only records what is already waiting; from then on a new card is news.
  const start = setTimeout(() => { void poll() }, 0)
  start.unref?.()
  const stop = () => {
    clearInterval(timer)
    clearTimeout(start)
    disposeSession()
    return pushed.settled()
  }
  ctx.effect(() => stop, 'wecom-notify: listeners')

  return {
    pushed,
    poll,
    // The effect above owns the real teardown; this is for a caller that never ran in DSH.
    stop: () => Promise.resolve(stop()).then(() => undefined),
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
