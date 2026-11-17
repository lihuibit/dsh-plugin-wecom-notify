// A WeCom group-robot notifier for DS Bot: tell me in the group when a Bot has replied or a
// card is waiting, even though `dsh web` cannot raise a system notification of its own.
// Reads the Bot team's state file and DSH's forwarded-event queue; never writes to either.
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { Config, resolveConfig } from './src/config.js'
import { install } from './src/install.js'

export { Config }

export const name = 'wecom-notify'

// The services it reads: the event queue that holds the waiting cards, and the credential
// store the webhook lives in. Cordis refuses a property read on a service it was not told
// about, so both are named here; each is still handled when absent at the moment of use.
export const inject = ['typertGateway', 'credentials']

/**
 * @param {any} ctx
 * @param {Partial<import('./src/config.js').Config>} [config] the entry's config
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  const warn = (message) => {
    if (process.env.WECOM_NOTIFY_DEBUG === '1') console.warn(message)
  }
  if (resolved.enabled !== true) return
  // The sent ids live in this Host's own state directory, never in the Bot team's files.
  install({ ctx, config: resolved, home: dshHomePath('state', 'wecom-notify'), warn })
}
