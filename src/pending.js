// The cards that wait on the user, read from the Host's forwarded-event queue. A Browser that
// is open answers these waterfalls, so a Host listener never sees `approval/request` or
// `user-questions/request` (see gateway.ts `deliverRemoteEvent`: only `client.answers` gets
// them). The queue is the one place both kinds appear together, the same source DSH's own
// api-session-controller reads for a Session's pending input.

/** The two kinds of card this notifier tells apart. */
const KINDS = { 'approval/request': 'approval', 'user-questions/request': 'question' }

/**
 * The cards waiting right now, as a stable id per card.
 * @param {readonly { event: string, agentId: string }[]} pending forwarded events
 * @returns {Map<string, 'approval' | 'question'>} card id → kind
 */
export function cardsOf(pending) {
  const cards = new Map()
  for (const entry of pending ?? []) {
    const kind = KINDS[entry?.event]
    if (kind === undefined) continue
    const agent = typeof entry.agentId === 'string' ? entry.agentId : ''
    if (agent === '') continue
    cards.set(`${kind}:${agent}`, kind)
  }
  return cards
}

/**
 * The cards that started waiting since the last look. A card seen for the first time is new
 * only when something was already known: the first reading of a running Host is the one the
 * sidebar shows, not news. Nothing is missed either, since a card that was not there when
 * that reading happened arrives on a later one.
 * @param {Map<string, 'approval' | 'question'> | undefined} before the previous reading
 * @param {Map<string, 'approval' | 'question'>} after the current one
 * @returns {{ card: string, kind: 'approval' | 'question' }[]}
 */
export function newCards(before, after) {
  if (before === undefined) return []
  const fresh = []
  for (const [card, kind] of after) {
    if (!before.has(card)) fresh.push({ card, kind })
  }
  return fresh
}
