// Which conversation a Session is, read from the Bot team's own state file. A Bot's id is
// the Session id of its first chat segment; when a chat moves to a fresh Session the new id
// lives in `bot.sessionId` and the old ones in `bot.segments`. A group keeps one identity the
// same way (`room.sessionId`, `room.parts`), and each member speaks in the group from a
// hidden Session of its own (`room.sessions`, earlier ones in `room.segments[botId]`).
// Every one of those ids must resolve, or a long conversation stops being recognized.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * One resolved conversation.
 * @typedef {object} Owner
 * @property {'bot' | 'group'} kind
 * @property {string} id the Bot's or the group's stable id
 * @property {string} name the Bot's name, or the group's name
 * @property {string} [botId] the group member whose hidden Session this is
 * @property {string} [botName] that member's name
 */

/**
 * Read the Bot team's state file, without writing to it. A team that does not exist yet, a
 * file that is unreadable, or a file caught mid-write all mean "nothing to resolve": the
 * next idle read picks the team up.
 * @param {string} dshHome the harness home that holds `bot/state.json`
 * @returns {Promise<Map<string, Owner>>} every known Session id → its conversation
 */
export async function readTeam(dshHome) {
  let text
  try {
    text = await readFile(join(dshHome, 'bot', 'state.json'), 'utf8')
  } catch {
    return new Map()
  }
  try {
    return teamOf(JSON.parse(text))
  } catch {
    return new Map()
  }
}

/**
 * The Session id → conversation map of one parsed state file.
 * @param {unknown} state the parsed `bot/state.json`
 * @returns {Map<string, Owner>}
 */
export function teamOf(state) {
  const owners = new Map()
  if (state === null || typeof state !== 'object') return owners
  const bots = recordList(state.bots)
  for (const bot of bots) {
    add(owners, { kind: 'bot', id: idOf(bot), name: nameOf(bot, 'A Bot') }, ownSessions(bot))
  }
  for (const room of recordList(state.rooms)) {
    const name = nameOf(room, 'A group')
    const roomId = idOf(room)
    add(owners, { kind: 'group', id: roomId, name }, roomSessions(room))
    for (const [botId, sessionId] of Object.entries(tableOf(room.sessions))) {
      const member = bots.find(candidate => idOf(candidate) === botId)
      add(owners, {
        kind: 'group',
        id: roomId,
        name,
        botId,
        botName: member === undefined ? 'A Bot' : nameOf(member, 'A Bot'),
      }, [sessionId, ...ownSessions({ id: '', segments: room.segments?.[botId] })])
    }
  }
  return owners
}

/**
 * @param {Map<string, Owner>} owners
 * @param {Owner} owner
 * @param {unknown[]} ids
 */
function add(owners, owner, ids) {
  for (const id of ids) {
    if (typeof id !== 'string' || id === '' || owners.has(id)) continue
    owners.set(id, owner)
  }
}

/**
 * The record's id, its current Session, and every earlier one: a Bot's own chat, or a
 * group's own Session when given the room.
 * @param {Record<string, any>} record
 * @returns {unknown[]}
 */
function ownSessions(record) {
  return [record.id, record.sessionId, ...recordList(record.segments).map(segment => segment.sessionId)]
}

/**
 * A group's own Sessions, the parts it moved away from, and each member's hidden Session.
 * @param {Record<string, any>} room
 * @returns {unknown[]}
 */
function roomSessions(room) {
  return [...ownSessions(room), ...recordList(room.parts).map(part => part.sessionId)]
}

/**
 * The records of a table or a list; anything else has none.
 * @param {unknown} value
 * @returns {Record<string, any>[]}
 */
function recordList(value) {
  if (value === null || typeof value !== 'object') return []
  const entries = Array.isArray(value) ? value : Object.values(value)
  return entries.filter(entry => entry !== null && typeof entry === 'object')
}

/**
 * A plain lookup table (`{ botId: sessionId }`), or nothing.
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function tableOf(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * @param {Record<string, any>} record
 * @returns {string}
 */
function idOf(record) {
  return typeof record.id === 'string' ? record.id : ''
}

/**
 * @param {Record<string, any>} record
 * @param {string} fallback
 * @returns {string}
 */
function nameOf(record, fallback) {
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  return name === '' ? fallback : name
}
