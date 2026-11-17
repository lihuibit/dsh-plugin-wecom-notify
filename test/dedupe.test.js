import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Pushed } from '../src/dedupe.js'

const home = () => mkdtemp(join(tmpdir(), 'wecom-notify-'))

test('an id that was saved is remembered by the next run', async () => {
  const dir = await home()
  try {
    const path = join(dir, 'nested', 'pushed.txt')
    const first = await new Pushed(path, 100).load()
    first.add('reply:session-a:1')
    await first.settled()

    const second = await new Pushed(path, 100).load()
    assert.equal(second.has('reply:session-a:1'), true)
    assert.equal(second.has('reply:session-a:2'), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the file stops growing at the newest ids it was told to keep', async () => {
  const dir = await home()
  try {
    const path = join(dir, 'pushed.txt')
    const pushed = await new Pushed(path, 5).load()
    for (let turn = 1; turn <= 12; turn += 1) pushed.add(`reply:session-a:${turn}`)
    await pushed.settled()

    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    assert.equal(lines.length, 5)
    assert.deepEqual(lines, [8, 9, 10, 11, 12].map(turn => `reply:session-a:${turn}`))
    // The oldest ids are forgotten, which is the point: they are the ones no longer worth deduping.
    assert.equal(pushed.has('reply:session-a:7'), false)
    assert.equal(pushed.size, 5)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a missing or damaged file remembers nothing and never throws', async () => {
  const dir = await home()
  try {
    assert.equal((await new Pushed(join(dir, 'absent.txt'), 10).load()).size, 0)
    const damaged = join(dir, 'damaged.txt')
    await writeFile(damaged, '\n\n  reply:x:1 \n', 'utf8')
    const pushed = await new Pushed(damaged, 10).load()
    assert.equal(pushed.has('reply:x:1'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a save that cannot be written stays quiet', async () => {
  const dir = await home()
  try {
    // A directory where the file should be: every save fails, and adding still returns.
    const pushed = await new Pushed(dir, 10).load()
    pushed.add('reply:session-a:1')
    await pushed.settled()
    assert.equal(pushed.has('reply:session-a:1'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
