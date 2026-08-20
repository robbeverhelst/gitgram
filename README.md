# gitgram

React to a Telegram message, get a GitHub issue.

React 👀 to any message in a configured group and gitgram files an issue in the
mapped repo, quoting the message and crediting its author. When the issue is
closed, it replies in the chat. Both announcements are per-chat toggles, so the
bot can run silently.

## How it works

A `message_reaction` update carries no message text, and the Bot API cannot
fetch a message by id. So gitgram forwards the reacted-to message into a private
archive channel — `forwardMessage` returns the full `Message` — and reads it
from the response. The issue↔message link lives in an HTML comment in the issue
body, so GitHub is the only durable store. There is no database.

See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning and the trade-offs.

## Prerequisites

- The group must be a **supergroup**. Basic groups have no per-message links.
- The bot must be a **group administrator**. Telegram sends no reaction updates
  otherwise, and there is no way around it.
- The group must **not** have "restrict saving content" enabled — forwarding
  fails outright, and gitgram cannot read the message.
- Telegram privacy mode can stay **on** (the default). gitgram never needs to
  read ordinary group messages.

## Setup

**1. Bot.** Create one with [@BotFather](https://t.me/BotFather), add it to the
group, and promote it to administrator.

**2. Archive channel.** Create a private channel, add the bot as an
administrator, and note its id (starts with `-100`).

**3. GitHub App.** Create an App under your account with:

| | |
|---|---|
| Repository permissions | Issues: **Read and write**, Metadata: Read-only |
| Subscribe to events | **Issues** |
| Webhook URL | `https://<your-host>/gh/webhook` |
| Webhook secret | any random string |

Generate a private key, then install the App on the repos you want to file into.

**4. Configure.**

```bash
cp .env.example .env            # secrets
cp gitgram.example.yaml gitgram.yaml
bun install
bun run start
```

**5. Find your chat ids.** Send `/gitgram` in each group. It replies with the
`chat_id` and the currently resolved settings. Put those ids in `gitgram.yaml`
and restart.

## Configuration

Secrets live in the environment (see `.env.example`); routing lives in
`gitgram.yaml` (see `gitgram.example.yaml`). Invalid config fails at boot rather
than producing a bot that silently ignores you.

| Key | Default | |
|---|---|---|
| `repo` | required | `owner/name` |
| `authorize` | `anyone` | `anyone`, `admins`, or a list of Telegram user ids |
| `announce_created` | `true` | post in the chat when a ticket is filed |
| `announce_closed` | `true` | post in the chat when it is closed |
| `ack_reaction` | `true` | bot adds `ACK_EMOJI` to the message |
| `include_link` | `false` | put the issue URL in announcements — off by default because the URL names the repo to everyone in the chat |
| `title_mode` | `mechanical` | `llm` is reserved, not implemented |
| `labels` | `[]` | labels applied to created issues |

`TRIGGER_EMOJI` and `ACK_EMOJI` must be from Telegram's standard reaction set —
🎫 and ✅ are **not** in it. The full list is in `src/reactions.ts`, and an
invalid value fails at boot.

## Silent mode

`announce_created: false` + `announce_closed: false` stops gitgram talking in
the chat. The 👌 ack reaction still fires, so the reactor can tell the difference
between "filed quietly" and "bot is down".

**Errors always speak**, at any setting. The person who needs to know a ticket
was not filed is the one who just reacted.

## Development

```bash
bun run dev        # watch mode
bun test           # unit + fake-transport end-to-end
bun run ci         # lint, typecheck, test
```

For a live smoke test, point `.env` at a throwaway group and repo, run
`bun run start`, and use a tunnel (`cloudflared tunnel --url http://localhost:3000`)
as the App's webhook URL.

## Deployment

`docker build -t gitgram .` — mount `gitgram.yaml` at `CONFIG_PATH` and supply
the environment. The container needs inbound HTTPS on `PORT` for the GitHub
webhook; Telegram uses long polling and needs no inbound access.

## Known limits

- **Media cannot be attached to issues** — GitHub has no public API for it. The
  issue carries the caption and a link to the archived forward.
- **A close announcement is lost if the bot is down.** GitHub does not retry
  failed webhook deliveries; redeliver by hand from the App's Advanced tab.
- **Removing the reaction does nothing.** Reactions are removed by accident too
  easily to let one close real work.
- **Dedup across restarts is best-effort.** GitHub's issue search index lags,
  so a re-reaction within that window can file twice.
