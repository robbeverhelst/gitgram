import { describe, expect, test } from "bun:test";
import { parseConfig } from "../src/config";
import { renderMarker } from "../src/marker";
import { announceClosed, createWebhookApp } from "../src/webhook";
import { GROUP } from "./fixtures";
import { fakeTelegram } from "./telegram-fake";

const SECRET = "shhh";

const config = (extra = "") =>
	parseConfig(`
chats:
  ${GROUP.id}:
    repo: robbeverhelst/gitgram
${extra}
`);

const closedPayload = (marker: string, number = 42) => ({
	action: "closed",
	issue: {
		number,
		html_url: `https://github.com/robbeverhelst/gitgram/issues/${number}`,
		body: `the export button is broken\n\n${marker}\n`,
	},
	sender: { login: "robbeverhelst" },
});

async function sign(body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
	const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `sha256=${hex}`;
}

describe("issue closed → chat", () => {
	test("replies to the original message in the mapped chat", async () => {
		const telegram = fakeTelegram({});
		const marker = renderMarker({ chatId: GROUP.id, messageId: 8842 });

		const result = await announceClosed(
			{ config: config(), telegram: telegram.port, secret: SECRET },
			closedPayload(marker),
		);

		expect(result).toBe("announced");
		expect(telegram.sent).toEqual([
			{
				chatId: GROUP.id,
				text: "Ticket #42 closed by robbeverhelst: https://github.com/robbeverhelst/gitgram/issues/42",
				replyTo: 8842,
			},
		]);
	});

	test("a marker edited to point at an unconfigured chat is dropped", async () => {
		const telegram = fakeTelegram({});
		const marker = renderMarker({ chatId: -1005555555555, messageId: 1 });

		const result = await announceClosed(
			{ config: config(), telegram: telegram.port, secret: SECRET },
			closedPayload(marker),
		);

		expect(result).toBe("unknown chat");
		expect(telegram.sent).toEqual([]);
	});

	test("stays quiet when announce_closed is off", async () => {
		const telegram = fakeTelegram({});
		const marker = renderMarker({ chatId: GROUP.id, messageId: 8842 });

		const result = await announceClosed(
			{ config: config("    announce_closed: false"), telegram: telegram.port, secret: SECRET },
			closedPayload(marker),
		);

		expect(result).toBe("silent");
		expect(telegram.sent).toEqual([]);
	});

	test("an issue gitgram did not create has no marker and is ignored", async () => {
		const telegram = fakeTelegram({});
		const result = await announceClosed(
			{ config: config(), telegram: telegram.port, secret: SECRET },
			{ action: "closed", issue: { number: 9, html_url: "u", body: "filed by hand" } },
		);

		expect(result).toBe("no marker");
		expect(telegram.sent).toEqual([]);
	});
});

describe("webhook endpoint", () => {
	const app = (telegram: ReturnType<typeof fakeTelegram>) =>
		createWebhookApp({ config: config(), telegram: telegram.port, secret: SECRET });

	test("accepts a correctly signed issues.closed delivery", async () => {
		const telegram = fakeTelegram({});
		const body = JSON.stringify(closedPayload(renderMarker({ chatId: GROUP.id, messageId: 8842 })));

		const res = await app(telegram).request("/gh/webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-github-event": "issues",
				"x-hub-signature-256": await sign(body),
			},
			body,
		});

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("announced");
		expect(telegram.sent).toHaveLength(1);
	});

	test("rejects a bad signature without touching Telegram", async () => {
		const telegram = fakeTelegram({});
		const body = JSON.stringify(closedPayload(renderMarker({ chatId: GROUP.id, messageId: 8842 })));

		const res = await app(telegram).request("/gh/webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-github-event": "issues",
				"x-hub-signature-256": "sha256=deadbeef",
			},
			body,
		});

		expect(res.status).toBe(401);
		expect(telegram.sent).toEqual([]);
	});

	test("healthz responds", async () => {
		const res = await app(fakeTelegram({})).request("/healthz");
		expect(await res.text()).toBe("ok");
	});
});
