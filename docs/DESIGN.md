# gitgram — design

React 👀 to a Telegram message, get a GitHub issue.

## Flow

1. Someone reacts 👀 to a message in a configured group.
2. Bot receives a `message_reaction` update over long polling.
3. Bot forwards that message to a private archive channel. The `forwardMessage`
   response is a full `Message` — that is how the bot learns the text and author.
4. Bot creates an issue in the repo mapped to the chat, embedding a marker:
   `<!-- gitgram: chat=-1001234567890; msg=8842 -->`
5. Bot reacts 👌 to the original message; if `announce_created`, it also replies
   in-chat with the issue link.
6. On `issues.closed`, the GitHub webhook parses the marker, validates the chat
   against config, and if `announce_closed`, replies to the original message.

## Why not 🎫

Telegram's standard reaction set is a fixed list of 73 emoji (`src/reactions.ts`).
🎫 is not on it, and neither is ✅ — a group set to "all reactions" still means
all of *those*. Arbitrary glyphs exist only as custom emoji reactions, which
require Premium for every person who wants to file a ticket.

So the trigger is 👀 and the ack is 👌, both configurable via `TRIGGER_EMOJI`
and `ACK_EMOJI`, both validated against the list at boot. An unvalidated trigger
would produce a bot that starts cleanly and then never fires — the worst
possible failure for something that is meant to run silently.

## Why forward-on-demand

`MessageReactionUpdated` carries `chat`, `message_id`, `user`, `date`,
`old_reaction`, `new_reaction` — **not the message text**. The Bot API has no
"fetch message by id". There are two ways out: log every message to a database,
or forward the message at reaction time and read the response.

Forwarding wins on three counts. There is no message database, so the bot holds
no chat content at rest. Telegram privacy mode can stay **on**, so the bot never
receives ordinary group messages at all. And it works on messages sent before
the bot joined, which matters because people react to old messages.

The cost is a private archive channel and a hard failure on chats with
"restrict saving content" enabled.

## Why the marker lives in the issue body

Announcing a close means turning `issue #42` back into `(chat_id, message_id)`.
Storing that mapping in the issue body keeps GitHub as the only durable store —
no database, no volume, no backups, and the mapping survives a total redeploy.

The marker is attacker-controlled input twice over. Anyone with write access to
the repo can edit it, and — less obviously — the quoted message sits *above* it
in the body, so anyone who can post in a configured group can type a
marker-shaped line and have it copied in ahead of the real one. Being an HTML
comment, neither version renders, so a forged marker is invisible in the issue.

The two threats need different answers.

Against the Telegram side it is closed. Quoted content always lands *above*
gitgram's marker, so `parseMarker` reads the **last** one, and `stripMarkers`
redacts marker-shaped text out of the quote before it reaches the body.

Against a repository writer it is not, and deliberately so. Appending a marker
*below* gitgram's beats last-match, and only signing the marker would fix that.
It is not worth it: anyone with write access can already edit or close the issue
outright, so the marker is not the weak link. What does hold in both cases is
the allowlist — a parsed `chat_id` is only used after `settingsFor` confirms it
is configured, so a forged marker can never address a chat this instance does
not already serve, and the announcement text itself is fixed.

## State

The bot is stateless apart from one in-memory TTL set used for deduplication.

Two people reacting seconds apart produce two updates. GitHub issue search
would catch that, except its index lags by seconds to minutes — precisely the
window that matters. So dedup is two layers: the TTL set covers the burst and
restart-redelivery cases, GitHub search covers the durable case (someone
re-reacts a week later, after the set has expired or the process restarted).
Neither layer is sufficient alone.

## Failure

Errors always reply in the originating chat, even in silent mode. The person who
needs to know a ticket was not filed is the one who just reacted and is looking
at that chat; routing failures to an ops channel they do not read leaves them
believing the issue exists. The announce toggles suppress routine success, not
failure.

Long polling was chosen for Telegram so updates queue for up to 24h and survive
a restart. GitHub webhooks have no such property: a delivery that fails while
the bot is down is not retried automatically. A lost close-announcement is
recoverable only by manual redelivery from the GitHub App's Advanced tab.
Reconciling it automatically would require tracking what was already announced,
which is the database this design exists to avoid.

## Topics are not addressable

`MessageReactionUpdated` carries no `message_thread_id`, and the forwarded copy
carries the archive channel's thread, not the origin's. There is no way to learn
which forum topic a reacted-to message came from, so per-topic repo routing is
not implementable. Replies still land in the right topic because Telegram
threads a reply into the same topic as the message it replies to.

## Known limits

- The bot **must be a group administrator**. Telegram sends no reaction updates
  otherwise. This is not configurable.
- Groups with "restrict saving content" cannot work at all.
- Use a supergroup. Basic groups have no per-message deep links.
- Media cannot be attached to issues — GitHub has no public API for it. The
  issue carries the caption and a link to the archived forward.
- Reactions set by bots never generate updates, so the 👌 ack cannot loop.

## Deliberate non-features

- **Removing the trigger reaction does nothing.** Reactions are casual and a double-tap removes
  one by accident. Letting that close real work reaches out of a chat app to
  destroy state in the issue tracker.
- **Reopen is not announced.** Core lifecycle only.
- **No LLM titles yet.** `title_mode` is reserved; mechanical titles never
  invent a repro step that nobody wrote.
