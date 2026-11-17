// Sending one message. A webhook that cannot be read, does not answer in time, or refuses the
// message is logged and forgotten: a notification is never worth a failed Bot turn.
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/**
 * The configured webhook URL, or undefined when it is not set.
 * @param {any} ctx
 * @param {string} name the credential reference to read
 * @returns {Promise<string | undefined>}
 */
export async function webhookOf(ctx, name) {
  try {
    const hit = await ctx.credentials.resolve(credentialRef(name))
    const value = typeof hit?.value === 'string' ? hit.value.trim() : ''
    return value === '' ? undefined : value
  } catch {
    return undefined
  }
}

/**
 * Post one markdown body. One retry, then give up: WeCom occasionally drops a request, and a
 * second send is cheap, while waiting on more would hold the notification back.
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.content the markdown body
 * @param {number} options.timeoutMs
 * @param {(message: string) => void} [options.warn]
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<boolean>} whether WeCom accepted it
 */
export async function send({ url, content, timeoutMs, warn = () => {}, fetch = globalThis.fetch }) {
  const body = JSON.stringify({ msgtype: 'markdown', markdown: { content } })
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        warn(`wecom-notify: the webhook answered HTTP ${response.status}`)
        continue
      }
      const answer = await response.json().catch(() => undefined)
      if (answer !== undefined && typeof answer.errcode === 'number' && answer.errcode !== 0) {
        warn(`wecom-notify: the webhook refused the message (errcode ${answer.errcode}: ${String(answer.errmsg ?? '')})`)
        return false
      }
      return true
    } catch (error) {
      warn(`wecom-notify: the webhook did not answer: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return false
}
