import { Webhooks } from "@octokit/webhooks";
import { Hono } from "hono";
import type { Config } from "./config";
import { settingsFor } from "./config";
import { parseMarker } from "./marker";
import type { TelegramPort } from "./ticket";

export type WebhookDeps = {
	config: Config;
	telegram: TelegramPort;
	secret: string;
	log?: (event: Record<string, unknown>) => void;
};

type IssuePayload = {
	action?: string;
	issue?: { number: number; html_url: string; body?: string | null };
	sender?: { login?: string };
};

export function createWebhookApp(deps: WebhookDeps) {
	const webhooks = new Webhooks({ secret: deps.secret });
	const app = new Hono();

	app.get("/healthz", (c) => c.text("ok"));

	app.post("/gh/webhook", async (c) => {
		const raw = await c.req.text();
		const signature = c.req.header("x-hub-signature-256") ?? "";
		if (!(await webhooks.verify(raw, signature))) return c.text("bad signature", 401);

		if (c.req.header("x-github-event") !== "issues") return c.text("ignored");
		const payload = JSON.parse(raw) as IssuePayload;
		if (payload.action !== "closed" || !payload.issue) return c.text("ignored");

		const result = await announceClosed(deps, payload);
		return c.text(result);
	});

	return app;
}

export async function announceClosed(deps: WebhookDeps, payload: IssuePayload): Promise<string> {
	const issue = payload.issue;
	if (!issue) return "ignored";

	const marker = parseMarker(issue.body);
	if (!marker) return "no marker";

	// The marker is repo-writable text. Only chats in the config are addressable.
	const settings = settingsFor(deps.config, marker.chatId);
	if (!settings) {
		deps.log?.({ event: "marker_rejected", chatId: marker.chatId, issue: issue.number });
		return "unknown chat";
	}
	if (!settings.announce_closed) return "silent";

	const by = payload.sender?.login ? ` by ${payload.sender.login}` : "";
	await deps.telegram.sendMessage(
		marker.chatId,
		`Ticket #${issue.number} closed${by}: ${issue.html_url}`,
		{
			reply_parameters: { message_id: marker.messageId, allow_sending_without_reply: true },
		},
	);
	deps.log?.({ event: "closed_announced", chatId: marker.chatId, issue: issue.number });
	return "announced";
}
