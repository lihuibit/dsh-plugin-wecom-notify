import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clip, endedTurn, summarise, textOf } from '../src/events.js'

const text = value => ({ type: 'text', text: value })

/** A Session stub whose surface holds the given events, in order. */
function sessionOf(events) {
  return { surface: { nodes: events.map((_, index) => index) }, eventAt: seq => events[seq] }
}

const userSaid = (value, kind = 'user') => ({ type: 'user/message', data: { role: 'user', content: [text(value)], source: { kind } } })
const botSaid = value => ({ type: 'assistant/message', data: { message: { role: 'assistant', content: [text(value)] } } })

test('the last reply and the last line the user typed are the summary', () => {
  const session = sessionOf([
    { type: 'turn/start', data: { turn: 1 } },
    userSaid('first question'),
    botSaid('first answer'),
    userSaid('are we green?'),
    { type: 'turn/end', data: { turn: 1, reason: 'completed' } },
    { type: 'turn/start', data: { turn: 2 } },
    botSaid('The tests pass.'),
    { type: 'turn/end', data: { turn: 2, reason: 'completed' } },
  ])
  assert.deepEqual(summarise(session), { reply: 'The tests pass.', prompt: 'are we green?' })
})

test('a line another Bot relayed, or injected context, is never quoted as the user', () => {
  for (const kind of ['bot', 'system-prompt', 'tool', 'model']) {
    const session = sessionOf([userSaid('Bot to Bot words', kind), botSaid('Noted.')])
    assert.deepEqual(summarise(session), { reply: 'Noted.', prompt: '' }, kind)
  }
})

test('a session with nothing on its surface summarises to nothing', () => {
  assert.deepEqual(summarise(sessionOf([])), { reply: '', prompt: '' })
  assert.deepEqual(summarise(undefined), { reply: '', prompt: '' })
})

test('only the text blocks of a message are read', () => {
  const message = { content: [text('one'), { type: 'image' }, text('two')] }
  assert.equal(textOf(message), 'one\ntwo')
  assert.equal(textOf(null), '')
  assert.equal(textOf({ content: 'nope' }), '')
})

test('a clip keeps one line and marks what it cut', () => {
  assert.equal(clip('  spaced\n\nout  ', 40), 'spaced out')
  assert.equal(clip('a'.repeat(50), 10), `${'a'.repeat(9)}…`)
  assert.equal(clip('exact', 5), 'exact')
  assert.equal(clip('anything', 0), '')
  assert.equal(clip(undefined, 10), '')
})

test('a turn ends only on turn/end', () => {
  assert.equal(endedTurn({ type: 'turn/end', data: { turn: 3 } }), 3)
  assert.equal(endedTurn({ type: 'turn/start', data: { turn: 3 } }), undefined)
  assert.equal(endedTurn({ type: 'turn/end', data: {} }), undefined)
  assert.equal(endedTurn(undefined), undefined)
})
