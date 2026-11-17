// What a finished turn said. The Bot's reply is on the Session's model-visible surface; the
// line the user typed is a `user/message` whose source is the human, never one DS Bot relayed
// from another Bot or injected as context (`source.kind === 'bot'`, see
// ds-bot/src/host/delivery.js). The surface is the only reliable record: a replaced or
// cancelled step leaves a message that was never said in it.
import { deriveEventMessage } from '@deepseek-ai/dsh-session'

/**
 * The text of a surface message, its text blocks joined.
 * @param {unknown} message a projected Message, or null
 * @returns {string}
 */
export function textOf(message) {
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block === null || typeof block !== 'object' || block.type !== 'text') continue
    if (typeof block.text !== 'string' || block.text === '') continue
    parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/**
 * The last reply and the last line the user typed, as the surface holds them.
 * @param {any} session a live Session
 * @returns {{ reply: string, prompt: string }} both may be empty
 */
export function summarise(session) {
  const surface = session?.surface
  const nodes = Array.isArray(surface?.nodes) ? surface.nodes : []
  let reply = ''
  let prompt = ''
  // Read backwards: both are the nearest of their kind before this turn's end.
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    // oxlint-disable-next-line typescript/no-deprecated -- surface nodes are seqs; reading one event by it is the only path.
    const event = session.eventAt(nodes[index])
    if (event === undefined) continue
    const message = deriveEventMessage(event)
    if (message === null) continue
    if (reply === '' && message.role === 'assistant') {
      reply = textOf(message)
      continue
    }
    if (prompt === '' && message.role === 'user' && message.source?.kind === 'user') {
      prompt = textOf(message)
      continue
    }
    if (reply !== '' && prompt !== '') break
  }
  return { reply, prompt }
}

/**
 * One line of text of at most `limit` characters, with the line breaks and runs of spaces
 * a chat bubble would show flattened.
 * @param {string} text
 * @param {number} limit
 * @returns {string}
 */
export function clip(text, limit) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (limit <= 0 || flat === '') return ''
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
}

/**
 * The turn a `turn/end` event closes.
 * @param {any} event
 * @returns {number | undefined}
 */
export function endedTurn(event) {
  if (event?.type !== 'turn/end') return undefined
  const turn = event.data?.turn
  return typeof turn === 'number' && Number.isSafeInteger(turn) ? turn : undefined
}
