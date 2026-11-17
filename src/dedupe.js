// Which ids were already told, kept across restarts. One line per id, oldest first; the file
// is rewritten with the newest `keep` ids, so it cannot grow without bound.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * An append-then-trim set of sent ids, held in memory and mirrored to one file.
 */
export class Pushed {
  /** @type {Set<string>} */
  #ids = new Set()
  /** @type {string} */
  #path
  /** @type {number} */
  #keep
  /** @type {Promise<void>} */
  #writing = Promise.resolve()

  /**
   * @param {string} path the file that holds the ids
   * @param {number} keep how many ids to remember
   */
  constructor(path, keep) {
    this.#path = path
    this.#keep = Math.max(1, keep)
  }

  /**
   * Read the ids a previous run saved. A missing or damaged file simply remembers nothing.
   * @returns {Promise<Pushed>} this set, ready
   */
  async load() {
    try {
      const text = await readFile(this.#path, 'utf8')
      for (const line of text.split('\n')) {
        const id = line.trim()
        if (id !== '') this.#ids.add(id)
      }
    } catch { /* nothing saved yet, or unreadable: start empty */ }
    return this
  }

  /**
   * @param {string} id
   * @returns {boolean} whether this id was already told
   */
  has(id) {
    return this.#ids.has(id)
  }

  /**
   * Remember one id and save, without waiting for the file.
   * @param {string} id
   */
  add(id) {
    this.#ids.add(id)
    this.#write()
  }

  /** @returns {number} how many ids are remembered */
  get size() {
    return this.#ids.size
  }

  /**
   * Resolve after the pending save has finished, for tests and for a tidy unload.
   * @returns {Promise<void>}
   */
  async settled() {
    await this.#writing
  }

  #write() {
    const ids = [...this.#ids].slice(-this.#keep)
    this.#ids = new Set(ids)
    this.#writing = this.#writing
      .then(async () => {
        await mkdir(dirname(this.#path), { recursive: true })
        const temporary = `${this.#path}.tmp`
        await writeFile(temporary, ids.length === 0 ? '' : `${ids.join('\n')}\n`, 'utf8')
        await rename(temporary, this.#path)
      })
      .catch(() => { /* a full disk or a locked file must not stop a Bot's turn */ })
  }
}
