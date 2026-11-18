import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_PRESENCE_WINDOW_MS, Presence, isUserActivity } from '../src/presence.js'

/** A clock the test moves by hand. */
function clock(start = 1_000_000) {
  let time = start
  return { now: () => time, advance: (ms) => { time += ms } }
}

test('an action keeps the notifier quiet for the window, and no longer', () => {
  const time = clock()
  const presence = new Presence(DEFAULT_PRESENCE_WINDOW_MS, time.now)
  presence.touch()

  time.advance(59_999)
  assert.equal(presence.atComputer(), true, 'just inside the window')

  time.advance(1)
  assert.equal(presence.atComputer(), false, 'exactly at the window is already away')
})

test('nothing seen yet means nobody is at the computer', () => {
  const presence = new Presence(DEFAULT_PRESENCE_WINDOW_MS, clock().now)
  assert.equal(presence.atComputer(), false)
  assert.equal(presence.idleFor(), undefined)
})

test('a later action starts the window again', () => {
  const time = clock()
  const presence = new Presence(60_000, time.now)
  presence.touch()
  time.advance(50_000)
  assert.equal(presence.atComputer(), true)

  presence.touch()
  time.advance(50_000)
  assert.equal(presence.atComputer(), true, 'the second action restarted the window')

  time.advance(10_000)
  assert.equal(presence.atComputer(), false)
})

test('a window of 0 turns the feature off', () => {
  const time = clock()
  const presence = new Presence(0, time.now)
  presence.touch()
  assert.equal(presence.atComputer(), false, 'never quiet, not even right after an action')
})

test('idleFor reports how long ago the action was', () => {
  const time = clock()
  const presence = new Presence(60_000, time.now)
  presence.touch()
  time.advance(42_000)
  assert.equal(presence.idleFor(), 42_000)
})

// The signals the Host can actually see.
const typed = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })

test('a line the user typed is an action', () => {
  assert.equal(isUserActivity(typed()), true)
})

test('an answer to a question card is an action', () => {
  assert.equal(isUserActivity({ type: 'user/message', data: { source: { kind: 'user-question-reply' } } }), true)
})

test('an answered approval is an action', () => {
  assert.equal(isUserActivity({ type: 'approval/decided', data: { id: 'a', outcome: 'allowed-once' } }), true)
})

test('a line another Bot sent or the Host injected is not an action', () => {
  for (const kind of ['bot', 'system-prompt', 'tool', 'model']) {
    assert.equal(isUserActivity({ type: 'user/message', data: { source: { kind } } }), false, kind)
  }
})

test('events that only say what the Bot did are not actions', () => {
  for (const event of [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'turn/end', data: { turn: 1 } },
    { type: 'assistant/message', data: {} },
    { type: 'approval/asked', data: {} },
    null,
    undefined,
    { type: 'user/message' },
    { type: 'user/message', data: {} },
  ]) {
    assert.equal(isUserActivity(event), false, JSON.stringify(event))
  }
})
