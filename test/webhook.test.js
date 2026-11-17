import assert from 'node:assert/strict'
import { test } from 'node:test'
import { send, webhookOf } from '../src/webhook.js'

const ok = () => ({ ok: true, json: async () => ({ errcode: 0, errmsg: 'ok' }) })

test('the webhook comes from the credential store and is trimmed', async () => {
  const ctx = { credentials: { resolve: async ref => (ref === 'WECOM_WEBHOOK' ? { value: '  https://example.test/hook  ' } : undefined) } }
  assert.equal(await webhookOf(ctx, 'WECOM_WEBHOOK'), 'https://example.test/hook')
})

test('no stored webhook, an empty one, or a store that fails all mean nothing to send', async () => {
  assert.equal(await webhookOf({ credentials: { resolve: async () => undefined } }, 'WECOM_WEBHOOK'), undefined)
  assert.equal(await webhookOf({ credentials: { resolve: async () => ({ value: '   ' }) } }, 'WECOM_WEBHOOK'), undefined)
  assert.equal(await webhookOf({ credentials: { resolve: async () => { throw new Error('no store') } } }, 'WECOM_WEBHOOK'), undefined)
  assert.equal(await webhookOf({}, 'WECOM_WEBHOOK'), undefined)
})

test('a message is posted as WeCom markdown', async () => {
  const seen = []
  const delivered = await send({
    url: 'https://example.test/hook',
    content: '# hi',
    timeoutMs: 1000,
    fetch: async (url, options) => { seen.push({ url, body: JSON.parse(options.body), signal: options.signal }); return ok() },
  })
  assert.equal(delivered, true)
  assert.equal(seen[0].url, 'https://example.test/hook')
  assert.deepEqual(seen[0].body, { msgtype: 'markdown', markdown: { content: '# hi' } })
  assert.ok(seen[0].signal instanceof AbortSignal)
})

test('a refused message is not retried, and is reported', async () => {
  const warnings = []
  let calls = 0
  const delivered = await send({
    url: 'https://example.test/hook',
    content: 'x',
    timeoutMs: 1000,
    warn: message => warnings.push(message),
    fetch: async () => { calls += 1; return { ok: true, json: async () => ({ errcode: 93001, errmsg: 'invalid webhook url' }) } },
  })
  assert.equal(delivered, false)
  assert.equal(calls, 1)
  assert.match(warnings[0], /93001/)
})

test('a failed request is retried once, then given up', async () => {
  const warnings = []
  let calls = 0
  const delivered = await send({
    url: 'https://example.test/hook',
    content: 'x',
    timeoutMs: 1000,
    warn: message => warnings.push(message),
    fetch: async () => { calls += 1; throw new Error('timed out') },
  })
  assert.equal(delivered, false)
  assert.equal(calls, 2)
  assert.equal(warnings.length, 2)
})

test('the second attempt is enough after the first one fails', async () => {
  let calls = 0
  const delivered = await send({
    url: 'https://example.test/hook',
    content: 'x',
    timeoutMs: 1000,
    fetch: async () => { calls += 1; if (calls === 1) throw new Error('timed out'); return ok() },
  })
  assert.equal(delivered, true)
  assert.equal(calls, 2)
})
