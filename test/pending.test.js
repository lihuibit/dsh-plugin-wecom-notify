import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cardsOf, newCards } from '../src/pending.js'

test('a card is identified by its kind and the Session it waits in', () => {
  const cards = cardsOf([
    { event: 'approval/request', agentId: 'session-a' },
    { event: 'user-questions/request', agentId: 'session-b' },
    { event: 'api-session/added', agentId: 'session-c' },
    { event: 'approval/request', agentId: 'session-a' },
  ])
  assert.deepEqual([...cards], [['approval:session-a', 'approval'], ['question:session-b', 'question']])
})

test('nothing waiting is an empty reading, not a failure', () => {
  assert.equal(cardsOf(undefined).size, 0)
  assert.equal(cardsOf([]).size, 0)
  assert.equal(cardsOf([{ event: 'approval/request' }]).size, 0)
})

test('the first reading is a baseline, so a card already waiting is not news', () => {
  const first = cardsOf([{ event: 'approval/request', agentId: 'session-a' }])
  assert.deepEqual(newCards(undefined, first), [])
})

test('a card that starts waiting after the baseline is news, once', () => {
  const before = cardsOf([])
  const after = cardsOf([{ event: 'approval/request', agentId: 'session-a' }])
  assert.deepEqual(newCards(before, after), [{ card: 'approval:session-a', kind: 'approval' }])
  assert.deepEqual(newCards(after, after), [])
})

test('a card that is answered and asked again is news again', () => {
  const waiting = cardsOf([{ event: 'approval/request', agentId: 'session-a' }])
  const settled = cardsOf([])
  assert.deepEqual(newCards(settled, waiting), [{ card: 'approval:session-a', kind: 'approval' }])
})
