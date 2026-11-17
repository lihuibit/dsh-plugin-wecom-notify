// Lint with the oxlint this package installs, or the one a DeepSeek Harness checkout carries.
// Places, in order: this package's own node_modules, then `DSH_HARNESS`. `npm install` is enough.
// Usage: npm run lint [-- <oxlint options>]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const plugin = resolve(import.meta.dirname, '..')
const candidates = [
  join(plugin, 'node_modules'),
  process.env.DSH_HARNESS,
]
// Node runs oxlint's own script: on Windows it cannot spawn the .cmd shim in node_modules/.bin
// without a shell.
const bin = candidates.filter(Boolean).map(dir => join(dir, 'oxlint', 'bin', 'oxlint')).find(existsSync)
if (!bin) {
  console.error('lint: no oxlint found; run npm install, or set DSH_HARNESS to a checkout that has it')
  process.exit(2)
}
const result = spawnSync(process.execPath, [bin, '-c', '.oxlintrc.json', ...process.argv.slice(2), 'plugin.js', 'src', 'test'], { cwd: plugin, stdio: 'inherit' })
if (result.error) console.error(`lint: ${result.error.message}`)
process.exit(result.status ?? 1)
