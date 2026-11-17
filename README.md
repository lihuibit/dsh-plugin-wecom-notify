# dsh-plugin-wecom-notify

Tell me in a WeCom group when a [DS Bot](https://github.com/Fei2411/DS-Bot) has replied or a
card is waiting on me — even when I am not looking at the browser.

DS Bot's own notifications run in the page: they need the tab open and the system's
permission, so a `dsh web` session viewed from a browser often raises nothing. This plugin
lives on the Host instead and pushes over a WeCom (企业微信) group-robot webhook, where the
message waits for you.

It is a DS Bot companion: it reads the Bot team's own state file to know which conversation a
Session is, and DSH's forwarded-event queue to know which cards are waiting. It never writes
to either.

## What it sends

A message names the Bot, quotes the line you typed and the start of the Bot's reply, in the
markdown subset a WeCom group robot renders — a heading, bold text, `<font color>` and plain
lines, no tables, no lists, at most 4096 UTF-8 bytes:

```
# New reply · PM

**PM finished a turn**

> Are we green?

All green: 43 tests, lint and the client check.

DS Bot
```

Three kinds of event, each with its own switch:

| Kind | When | The message |
|---|---|---|
| `reply` | a turn ended in a Bot's own chat | the Bot's name, your line, the reply's opening |
| `question` | a question card started waiting | the Bot's name, "asked you a question" |
| `approval` | an approval card started waiting | the Bot's name, the tool waiting on you |

**A group chat's ordinary reply is never sent.** A card in a group is: that is the one waiting
on you. When a member speaks in a group, the message names both (`Dev · Launch`).

There is no quiet-hours schedule and no per-conversation mute. The switches above are all.

## Install

```sh
dsh plugin --profile web add dsh-plugin-wecom-notify
```

Then save the webhook URL in the credential store, under the name the plugin reads:

```sh
dsh --profile web   # open Settings → Credentials, or write the key where your store keeps it
```

The URL looks like `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…` and comes from
the group robot's own page in WeCom. **It is never written in a config file**: the plugin
reads it through DSH's credential store by the reference name below.

## Configuration

Put the switches in the profile's `cordis.patch.yml`:

```yaml
- id: wecom-notify
  config:
    webhookEnv: WECOM_WEBHOOK   # the credential reference holding the webhook URL
    enabled: true               # the master switch
    events:
      reply: true
      question: true
      approval: true
    pollMs: 3000                # how often the waiting cards are read
    timeoutMs: 5000             # one webhook request may take this long
    textChars: 200              # how much of the Bot's reply is quoted
    promptChars: 100            # how much of your line is quoted
    keepPushed: 2000            # how many sent ids survive a restart
```

**With no webhook stored, the plugin loads and sends nothing.** It never fails a Bot's turn:
a missing credential, a store that throws, a webhook that times out (retried once, then given
up) or one that refuses the message is logged and forgotten. Set `WECOM_NOTIFY_DEBUG=1` to see
those lines on stderr.

## How it decides

- **Which conversation** — from DS Bot's `bot/state.json` under the harness home. A Bot's id
  is the Session id of its first chat; when a chat grows into a new Session the id moves to
  `bot.sessionId` and the older ones to `bot.segments`. A group keeps one identity the same
  way (`room.sessionId`, `room.parts`), and each member speaks in the group from a hidden
  Session of its own (`room.sessions[botId]`, earlier ones in `room.segments[botId]`). Every
  one of those ids resolves, so a long conversation is still recognized.
- **Your line, not a relayed one** — a user message counts as yours only when its
  `source.kind` is `user`. A line another Bot sent, or context the Host injected, is never
  quoted as you.
- **A finished turn** — `session/event` with `turn/end`.
- **A waiting card** — DSH's forwarded-event queue, entries of `approval/request` or
  `user-questions/request`. A Host listener cannot use those two events directly, because an
  open browser answers the waterfall first and the Host never sees it. The first reading is a
  baseline: a card already waiting when the plugin starts is not news.

## Messages are sent at most once

A sent event is remembered in `state/wecom-notify/pushed.txt` under the harness home — one id
per line, trimmed to the newest `keepPushed` on every write — so a restart does not repeat a
card. A reply is keyed `reply:<session>:<turn>`; a card is keyed `<kind>:<session>`.

## Bounds you should know about

- **It does not know whether you are looking at the conversation.** That is browser state, and
  a pushed message is asynchronous: one extra message costs less than a missed approval.
- **A card is told apart by kind and Session**, not by a per-request identity, so two cards of
  the same kind waiting at once in one Session are one message.
- **It reads the team file at each turn boundary**, so a Bot created since the last turn is
  recognized on the next one.

## Development

The package installs the DeepSeek Harness packages its tests need, so `npm install` is enough:

```sh
npm install     # the @deepseek-ai packages the tests run against, and oxlint
npm test        # unit tests
npm run lint    # oxlint
```

`DSH_HARNESS` points the tests and the linter at another DeepSeek Harness install or a
checkout, for testing against a different DSH version.

Nothing here writes to your harness home outside the plugin's own `state/wecom-notify/`
directory, and no test touches a real profile.

## Layout

```
plugin.js            the entry DSH loads: name, inject, Config, apply
src/config.js        the switches and their defaults
src/team.js          bot/state.json → which conversation a Session is
src/events.js        a finished turn's two lines, from the model-visible surface
src/pending.js       the cards waiting, from the forwarded-event queue
src/dedupe.js        the ids already sent, kept across restarts
src/compose.js       the WeCom markdown body
src/webhook.js       one POST, one retry, silence on failure
src/install.js       the wiring the entry applies
test/                unit tests, one file per module
```

## License

Apache-2.0. See [LICENSE](LICENSE).
