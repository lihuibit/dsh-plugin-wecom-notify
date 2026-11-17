// What the message says, in the markdown subset a WeCom group robot renders: a heading, bold
// text, inline `<font color>` and plain lines. Tables and lists do not render there, and the
// whole body may not exceed 4096 UTF-8 bytes.

/** A WeCom markdown body may not exceed this many UTF-8 bytes. */
export const MARKDOWN_LIMIT = 4096

/**
 * One message for one event.
 * @param {object} notice
 * @param {'reply' | 'question' | 'approval'} notice.kind
 * @param {import('./team.js').Owner} notice.owner the conversation the event belongs to
 * @param {string} [notice.reply] the Bot's own words, already clipped
 * @param {string} [notice.prompt] the line the user typed, already clipped
 * @param {string} [notice.tool] the tool an approval waits on
 * @returns {string} the markdown body
 */
export function compose({ kind, owner, reply, prompt, tool }) {
  const lines = [`# ${LEVEL[kind]} · ${escape(nameOf(owner))}`, '', `**${headline(kind, owner)}**`]
  if (owner.kind === 'group' && owner.botName !== undefined) {
    lines.push(`<font color="comment">in the group chat</font>`)
  }
  if (kind === 'reply') {
    if (prompt !== undefined && prompt !== '') lines.push('', `> ${escape(prompt)}`)
    lines.push('', escape(reply === undefined || reply === '' ? 'The reply has no text.' : reply))
  } else if (kind === 'approval') {
    const what = tool === undefined || tool === '' ? 'A tool call' : `A call to ${tool}`
    lines.push('', escape(`${what} is waiting for your approval.`))
  } else {
    lines.push('', escape(`${nameOf(owner)} asked you a question.`))
  }
  lines.push('', `<font color="comment">DS Bot</font>`)
  return fit(lines.join('\n'))
}

/** The heading's first half: what happened. */
const LEVEL = { reply: 'New reply', question: 'Question waiting', approval: 'Approval waiting' }

/**
 * Which Bot — and in a group, which member and which group — this is about.
 * @param {import('./team.js').Owner} owner
 * @returns {string}
 */
function nameOf(owner) {
  return owner.kind === 'group' && owner.botName !== undefined ? `${owner.botName} · ${owner.name}` : owner.name
}

/**
 * @param {'reply' | 'question' | 'approval'} kind
 * @param {import('./team.js').Owner} owner
 * @returns {string}
 */
function headline(kind, owner) {
  const name = escape(owner.name)
  if (kind === 'reply') return `${name} finished a turn`
  if (kind === 'approval') return `${name} needs your approval`
  return `${name} is waiting for your answer`
}

/**
 * Angle brackets would open markup; keep them literal inside the text.
 * @param {string} text
 * @returns {string}
 */
function escape(text) {
  return String(text).replace(/[<>]/g, character => (character === '<' ? '‹' : '›'))
}

/**
 * Cut a body to {@link MARKDOWN_LIMIT} bytes without splitting a character. Long text is
 * flattened to one line first, since half a message is worse than a short one.
 * @param {string} body
 * @returns {string}
 */
export function fit(body) {
  if (Buffer.byteLength(body, 'utf8') <= MARKDOWN_LIMIT) return body
  const room = MARKDOWN_LIMIT - 3
  let text = ''
  for (const character of body) {
    if (Buffer.byteLength(text + character, 'utf8') > room) break
    text += character
  }
  return `${text.trimEnd()}…`
}
