/**
 * Replays a signed issues.closed delivery at a locally running gitgram, so the
 * close path can be tested without waiting on a real GitHub webhook.
 *
 *   bun run scripts/fake-close.ts <chat_id> <message_id> [issue_number]
 */
import { renderMarker } from "../src/marker";

const [chatId, messageId, issueNumber = "1"] = Bun.argv.slice(2);
if (!chatId || !messageId) {
	throw new Error("usage: bun run scripts/fake-close.ts <chat_id> <message_id> [issue_number]");
}

const secret = Bun.env.GITHUB_WEBHOOK_SECRET;
if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is not set");
const url = Bun.env.GITGRAM_URL ?? `http://localhost:${Bun.env.PORT ?? 3000}/gh/webhook`;

const body = JSON.stringify({
	action: "closed",
	issue: {
		number: Number(issueNumber),
		html_url: `https://github.com/example/example/issues/${issueNumber}`,
		body: `replayed locally\n\n${renderMarker({ chatId: Number(chatId), messageId: Number(messageId) })}\n`,
	},
	sender: { login: "local-replay" },
});

const key = await crypto.subtle.importKey(
	"raw",
	new TextEncoder().encode(secret),
	{ name: "HMAC", hash: "SHA-256" },
	false,
	["sign"],
);
const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
const signature = `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

const res = await fetch(url, {
	method: "POST",
	headers: {
		"content-type": "application/json",
		"x-github-event": "issues",
		"x-hub-signature-256": signature,
	},
	body,
});
console.log(res.status, await res.text());
