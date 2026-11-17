import assert from 'node:assert/strict'
import { test } from 'node:test'
import { teamOf } from '../src/team.js'

// A Bot whose chat moved to a fresh Session twice, and a group whose own Session moved
// once, with two members talking in it.
const state = {
  bots: {
    'session-a1': { id: 'session-a1', name: 'PM', sessionId: 'session-a3', segments: [{ sessionId: 'session-a2' }] },
    'session-b1': { id: 'session-b1', name: 'Dev' },
  },
  rooms: {
    'session-r1': {
      id: 'session-r1',
      name: 'Launch',
      sessionId: 'session-r2',
      parts: [{ sessionId: 'session-r3' }],
      sessions: { 'session-b1': 'session-h1' },
      segments: { 'session-b1': [{ sessionId: 'session-h0' }] },
    },
  },
}

test('every id of a Bot chat resolves to that Bot, including earlier segments', () => {
  const team = teamOf(state)
  for (const id of ['session-a1', 'session-a2', 'session-a3']) {
    assert.deepEqual(team.get(id), { kind: 'bot', id: 'session-a1', name: 'PM' }, id)
  }
  assert.deepEqual(team.get('session-b1'), { kind: 'bot', id: 'session-b1', name: 'Dev' })
})

test('a group resolves through its own Session, its parts and a member hidden Session', () => {
  const team = teamOf(state)
  for (const id of ['session-r1', 'session-r2', 'session-r3']) {
    assert.deepEqual(team.get(id), { kind: 'group', id: 'session-r1', name: 'Launch' }, id)
  }
  // The member's hidden Session is the group's, and still says whose words they are.
  for (const id of ['session-h1', 'session-h0']) {
    assert.deepEqual(team.get(id), { kind: 'group', id: 'session-r1', name: 'Launch', botId: 'session-b1', botName: 'Dev' }, id)
  }
})

test('a Session the team does not own resolves to nothing', () => {
  const team = teamOf(state)
  assert.equal(team.get('session-elsewhere'), undefined)
  assert.equal(team.get(''), undefined)
})

test('a team that is not there yet, or damaged, resolves to nothing instead of throwing', () => {
  for (const value of [undefined, null, {}, { bots: null }, { bots: [], rooms: [] }, { bots: { a: null } }]) {
    assert.equal(teamOf(value).size, 0, JSON.stringify(value))
  }
})

test('a nameless record still resolves, under a placeholder name', () => {
  const team = teamOf({ bots: { x: { id: 'x' } }, rooms: { y: { id: 'y', name: '   ' } } })
  assert.equal(team.get('x')?.name, 'A Bot')
  assert.equal(team.get('y')?.name, 'A group')
})
