import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { install } from '../src/install.js'
import { resolveConfig } from '../src/config.js'

const text = value => ({ type: 'text', text: value })

/**
 * A Host stub: one team file under its own DSH_HOME, a forwarded-event queue, and the
 * credentials the webhook is read from.
 * @param {object} options
 * @param {object} options.state the team file to write
 * @param {string} [options.webhook] the stored webhook URL, if any
 */
async function bench({ state, webhook, events, waiting }) {
  const root = await mkdtemp(join(tmpdir(), 'wecom-notify-bench-'))
  await mkdir(join(root, 'bot'), { recursive: true })
  await writeFile(join(root, 'bot', 'state.json'), JSON.stringify(state), 'utf8')
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root

  const sent = []
  const warnings = []
  const listeners = []
  let pending = waiting ?? []
  const ctx = {
    credentials: { resolve: async () => (webhook === undefined ? undefined : { value: webhook }) },
    typertGateway: { getPendingRemoteEvents: () => pending },
    on: (event, listener) => { listeners.push({ event, listener }); return () => {} },
    effect: () => {},
  }
  const notifier = install({
    ctx,
    config: resolveConfig({ pollMs: 60000, ...(events === undefined ? {} : { events }) }),
    home: join(root, 'state', 'wecom-notify'),
    warn: message => warnings.push(message),
    fetch: async (_url, options) => {
      sent.push(JSON.parse(options.body).markdown.content)
      return { ok: true, json: async () => ({ errcode: 0 }) }
    },
  })
  // Let the first reading, which only establishes the baseline, finish.
  await notifier.poll()

  return {
    sent,
    warnings,
    notifier,
    setPending: (next) => { pending = next },
    turnEnded: (session, turn) => {
      for (const { event, listener } of listeners) {
        if (event === 'session/event') listener(session, { type: 'turn/end', data: { turn, reason: 'completed' } })
      }
    },
    async close() {
      await notifier.stop()
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      await rm(root, { recursive: true, force: true })
    },
  }
}

const bot = (name, sessionId) => ({ id: sessionId, name, sessionId })
const team = { bots: { 'session-a': bot('PM', 'session-a'), 'session-b': bot('Dev', 'session-b') }, rooms: {} }

/** A Bot Session whose last turn ended with this reply to this user line. */
const sessionOf = (id, { reply, prompt, promptKind = 'user' }) => {
  const events = [
    { type: 'user/message', data: { role: 'user', content: [text(prompt)], source: { kind: promptKind } } },
    { type: 'assistant/message', data: { message: { role: 'assistant', content: [text(reply)] } } },
  ]
  return { id, surface: { nodes: events.map((_, index) => index) }, eventAt: seq => events[seq] }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('a finished turn in a Bot chat is sent once, naming the Bot and quoting both lines', async () => {
  const run = await bench({ state: team, webhook: 'https://example.test/hook' })
  try {
    const session = sessionOf('session-a', { reply: 'The tests pass.', prompt: 'Are we green?' })
    run.turnEnded(session, 1)
    await settle()
    run.turnEnded(session, 1)
    await settle()

    assert.equal(run.sent.length, 1)
    assert.match(run.sent[0], /PM/)
    assert.match(run.sent[0], /> Are we green\?/)
    assert.match(run.sent[0], /The tests pass\./)
  } finally {
    await run.close()
  }
})

test('a group chat ordinary reply is not sent, but a card there is', async () => {
  const state = {
    bots: { 'session-b': bot('Dev', 'session-b') },
    rooms: { 'session-r': { id: 'session-r', name: 'Launch', sessionId: 'session-r', sessions: { 'session-b': 'session-h' } } },
  }
  const run = await bench({ state, webhook: 'https://example.test/hook' })
  try {
    const inGroup = sessionOf('session-h', { reply: 'Noted.', prompt: 'Ship it' })
    run.turnEnded(inGroup, 1)
    await settle()
    assert.equal(run.sent.length, 0)

    run.setPending([{ event: 'approval/request', agentId: 'session-h' }])
    await run.notifier.poll()
    await settle()
    assert.equal(run.sent.length, 1)
    assert.match(run.sent[0], /Approval waiting/)
    assert.match(run.sent[0], /Dev/)
    assert.match(run.sent[0], /Launch/)
  } finally {
    await run.close()
  }
})

test('a Session the team does not own is never sent', async () => {
  const run = await bench({ state: team, webhook: 'https://example.test/hook' })
  try {
    run.turnEnded(sessionOf('session-elsewhere', { reply: 'hi', prompt: 'hey' }), 1)
    run.setPending([{ event: 'approval/request', agentId: 'session-elsewhere' }])
    await run.notifier.poll()
    await settle()
    assert.deepEqual(run.sent, [])
  } finally {
    await run.close()
  }
})

test('with no webhook stored nothing is sent and nothing fails', async () => {
  const run = await bench({ state: team })
  try {
    run.turnEnded(sessionOf('session-a', { reply: 'hi', prompt: 'hey' }), 1)
    run.setPending([{ event: 'approval/request', agentId: 'session-a' }])
    await run.notifier.poll()
    await settle()
    assert.deepEqual(run.sent, [])
    assert.ok(run.warnings.some(message => /no webhook/.test(message)))
  } finally {
    await run.close()
  }
})

test('a card already waiting when the Host starts is not news', async () => {
  // The card is in the queue before the notifier ever looks: the first reading is the baseline.
  const run = await bench({ state: team, webhook: 'https://example.test/hook', waiting: [{ event: 'approval/request', agentId: 'session-a' }] })
  try {
    await run.notifier.poll()
    await settle()
    assert.deepEqual(run.sent, [])
  } finally {
    await run.close()
  }
})

test('one card is sent once even though the queue reports it on every poll', async () => {
  const run = await bench({ state: team, webhook: 'https://example.test/hook' })
  try {
    run.setPending([{ event: 'user-questions/request', agentId: 'session-b' }])
    await run.notifier.poll()
    await run.notifier.poll()
    await run.notifier.poll()
    await settle()
    assert.equal(run.sent.length, 1)
    assert.match(run.sent[0], /Question waiting/)
  } finally {
    await run.close()
  }
})

test('the switches turn each kind of message off on their own', async () => {
  const run = await bench({ state: team, webhook: 'https://example.test/hook', events: { reply: false } })
  try {
    run.turnEnded(sessionOf('session-a', { reply: 'hi', prompt: 'hey' }), 1)
    run.setPending([{ event: 'approval/request', agentId: 'session-a' }])
    await run.notifier.poll()
    await settle()
    // Replies are off; the card is not.
    assert.equal(run.sent.length, 1)
    assert.match(run.sent[0], /Approval waiting/)
  } finally {
    await run.close()
  }
})

test('a group chat reply is never sent, whatever the panel says', async () => {
  const state = {
    bots: { 'session-a': bot('PM', 'session-a') },
    rooms: { 'session-r': { id: 'session-r', name: 'Launch', sessionId: 'session-r', sessions: { 'session-a': 'session-h' } } },
  }
  const run = await bench({ state, webhook: 'https://example.test/hook' })
  try {
    // Both the group's own Session and the member's hidden one are a group conversation.
    run.turnEnded(sessionOf('session-r', { reply: 'the group answered', prompt: 'anyone?' }), 1)
    run.turnEnded(sessionOf('session-h', { reply: 'the member answered', prompt: 'anyone?' }), 1)
    await settle()
    assert.deepEqual(run.sent, [])
  } finally {
    await run.close()
  }
})

test('an approval in a group member hidden Session is still sent', async () => {
  const state = {
    bots: { 'session-a': bot('PM', 'session-a') },
    rooms: { 'session-r': { id: 'session-r', name: 'Launch', sessionId: 'session-r', sessions: { 'session-a': 'session-h' } } },
  }
  const run = await bench({ state, webhook: 'https://example.test/hook' })
  try {
    run.setPending([{ event: 'approval/request', agentId: 'session-h' }])
    await run.notifier.poll()
    await settle()
    assert.equal(run.sent.length, 1)
    assert.match(run.sent[0], /PM · Launch/)
  } finally {
    await run.close()
  }
})
