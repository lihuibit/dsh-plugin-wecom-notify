import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MARKDOWN_LIMIT, compose, fit } from '../src/compose.js'

const bot = { kind: 'bot', id: 'session-a', name: 'PM' }
const room = { kind: 'group', id: 'session-r', name: 'Launch', botId: 'session-b', botName: 'Dev' }

test('a reply names the Bot, quotes the user line and the start of the reply', () => {
  const body = compose({ kind: 'reply', owner: bot, reply: 'The tests pass.', prompt: 'Are we green?' })
  assert.match(body, /^# New reply · PM/)
  assert.match(body, /\*\*PM finished a turn\*\*/)
  assert.match(body, /> Are we green\?/)
  assert.match(body, /The tests pass\./)
})

test('a reply with no user line behind it still says who and what', () => {
  const body = compose({ kind: 'reply', owner: bot, reply: 'Done.', prompt: '' })
  assert.match(body, /PM finished a turn/)
  assert.match(body, /Done\./)
  assert.equal(body.includes('> '), false)
})

test('an approval names the tool, and a question its asker', () => {
  const approval = compose({ kind: 'approval', owner: bot, tool: 'Bash' })
  assert.match(approval, /^# Approval waiting · PM/)
  assert.match(approval, /A call to Bash is waiting for your approval\./)
  const question = compose({ kind: 'question', owner: bot })
  assert.match(question, /^# Question waiting · PM/)
  assert.match(question, /PM asked you a question\./)
})

test('a group message says both the member and the group', () => {
  const body = compose({ kind: 'approval', owner: room, tool: 'Write' })
  assert.match(body, /^# Approval waiting · Dev · Launch/)
  assert.match(body, /in the group chat/)
})

test('the body stays inside the WeCom markdown byte limit', () => {
  const body = compose({ kind: 'reply', owner: bot, reply: '好'.repeat(5000), prompt: '嗯'.repeat(2000) })
  assert.ok(Buffer.byteLength(body, 'utf8') <= MARKDOWN_LIMIT, `${Buffer.byteLength(body, 'utf8')} bytes`)
})

test('angle brackets in the text cannot open markup', () => {
  const body = compose({ kind: 'reply', owner: { ...bot, name: '<script>' }, reply: 'look: <font color="red">x</font>' })
  assert.equal(body.includes('<script>'), false)
  assert.equal(body.includes('<font color="red">'), false)
  assert.match(body, /‹font color="red"›/)
})

test('fit cuts on a character boundary, never mid-character', () => {
  const cut = fit(`x${'好'.repeat(MARKDOWN_LIMIT)}`)
  assert.ok(Buffer.byteLength(cut, 'utf8') <= MARKDOWN_LIMIT)
  assert.equal(cut.endsWith('…'), true)
  assert.equal(cut.includes('\uFFFD'), false)
})

test('a short body is left exactly as it is', () => {
  assert.equal(fit('short'), 'short')
})
