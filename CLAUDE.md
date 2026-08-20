# gitgram

Telegram bot: react 👀 to a message, get a GitHub issue. `bun run ci` before
you call anything done.

## Non-negotiable facts

These are Telegram/GitHub constraints, not choices. Do not design around them
without re-reading `docs/DESIGN.md`.

- `MessageReactionUpdated` has **no message text and no `message_thread_id`**,
  and the Bot API cannot fetch a message by id. Content comes from the
  `forwardMessage` response. Forum topic is unknowable at reaction time.
- Reaction emoji are limited to Telegram's fixed set of 73 (`src/reactions.ts`).
  🎫 and ✅ are not among them.
- The bot must be a group admin, or no reaction updates arrive at all.
- GitHub has no API for attaching files to an issue.

## Shape

No database. State is one in-memory TTL set (`src/dedup.ts`); everything else
lives in GitHub (the marker in the issue body) or the config file.

```
src/config.ts     YAML + Zod, fails at boot
src/env.ts        secrets, fails at boot
src/marker.ts     the issue↔message link
src/issue.ts      message → title/body (pure)
src/github.ts     App auth, create, search
src/ticket.ts     the reaction flow, ports injected
src/webhook.ts    issues.closed → chat
```

`src/ticket.ts` and `src/webhook.ts` take ports (`TelegramPort`, `GitHubPort`),
never the concrete clients. That is what makes the end-to-end tests hermetic —
keep it that way when adding behaviour.

## Rules

- Keep comments short, and only where the code cannot say it itself — a
  non-obvious constraint, or why an obvious approach was rejected.
- Import the narrowest named binding; Biome's `performance/noNamespaceImport`
  fails CI on namespace imports.
- Anything parsed out of an issue body is attacker-controlled. `chat_id` from a
  marker is only usable after `settingsFor` confirms it is configured.
- Errors reply in the originating chat regardless of the announce toggles.
- Config or env that fails validation must abort startup, never warn and continue.
