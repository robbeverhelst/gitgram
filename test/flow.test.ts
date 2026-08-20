import { describe, expect, test } from "bun:test";
import { type Config, parseConfig } from "../src/config";
import { RecentSet } from "../src/dedup";
import { parseMarker } from "../src/marker";
import { type GitHubPort, handleTicketReaction } from "../src/ticket";
import { ARCHIVE_CHAT_ID, forwarded, GROUP, reaction } from "./fixtures";
import { fakeTelegram } from "./telegram-fake";

const config = (extra = "") =>
	parseConfig(`
chats:
  ${GROUP.id}:
    repo: robbeverhelst/gitgram
${extra}
`);

function fakeGitHub(existing: { number: number; url: string } | null = null) {
	const created: Array<{ title: string; body: string; labels: string[] }> = [];
	const port: GitHubPort = {
		async findExisting() {
			return existing ? { ...existing, existing: true } : null;
		},
		async createIssue(_ref, issue) {
			created.push(issue);
			return {
				number: 42,
				url: "https://github.com/robbeverhelst/gitgram/issues/42",
				existing: false,
			};
		},
	};
	return { port, created };
}

const deps = (cfg: Config, telegram: ReturnType<typeof fakeTelegram>, github: GitHubPort) => ({
	config: cfg,
	github,
	telegram: telegram.port,
	recent: new RecentSet(),
	archiveChatId: ARCHIVE_CHAT_ID,
	ackEmoji: "👌" as const,
});

describe("👀 → issue", () => {
	test("creates an issue, acks, and announces", async () => {
		const telegram = fakeTelegram({ forward: forwarded("the export button is broken") });
		const github = fakeGitHub();

		const outcome = await handleTicketReaction(deps(config(), telegram, github.port), reaction());

		expect(outcome).toEqual({
			status: "created",
			issue: 42,
			url: "https://github.com/robbeverhelst/gitgram/issues/42",
		});
		expect(github.created).toHaveLength(1);
		expect(github.created[0]?.title).toBe("the export button is broken");
		expect(parseMarker(github.created[0]?.body)).toEqual({ chatId: GROUP.id, messageId: 8842 });
		expect(telegram.reacted).toEqual([
			{ chatId: GROUP.id, messageId: 8842, reaction: [{ type: "emoji", emoji: "👌" }] },
		]);
		expect(telegram.sent[0]?.text).toBe("Ticket #42 filed by Bob");
		expect(telegram.sent[0]?.replyTo).toBe(8842);
	});

	test("the issue link is opt-in, so the repo is not named in the chat", async () => {
		const telegram = fakeTelegram({ forward: forwarded("broken") });
		const github = fakeGitHub();

		await handleTicketReaction(deps(config(), telegram, github.port), reaction());
		expect(telegram.sent[0]?.text).not.toContain("github.com");

		const loud = fakeTelegram({ forward: forwarded("broken") });
		await handleTicketReaction(
			deps(config("    include_link: true"), loud, fakeGitHub().port),
			reaction(),
		);
		expect(loud.sent[0]?.text).toBe(
			"Ticket #42 filed by Bob: https://github.com/robbeverhelst/gitgram/issues/42",
		);
	});

	test("silent mode still acks but says nothing", async () => {
		const telegram = fakeTelegram({ forward: forwarded("quiet please") });
		const github = fakeGitHub();
		const cfg = config("    announce_created: false\n    announce_closed: false");

		const outcome = await handleTicketReaction(deps(cfg, telegram, github.port), reaction());

		expect(outcome.status).toBe("created");
		expect(telegram.sent).toEqual([]);
		expect(telegram.reacted).toHaveLength(1);
	});

	test("ignores chats that are not configured", async () => {
		const telegram = fakeTelegram({ forward: forwarded("hello") });
		const github = fakeGitHub();
		const update = { ...reaction(), chat: { ...GROUP, id: -1 } };

		const outcome = await handleTicketReaction(deps(config(), telegram, github.port), update);

		expect(outcome).toEqual({ status: "ignored", reason: "unconfigured" });
		expect(github.created).toEqual([]);
	});

	test("a second reaction on the same message does not file twice", async () => {
		const telegram = fakeTelegram({ forward: forwarded("double tap") });
		const github = fakeGitHub();
		const shared = deps(config(), telegram, github.port);

		await handleTicketReaction(shared, reaction());
		const second = await handleTicketReaction(shared, reaction());

		expect(second).toEqual({ status: "ignored", reason: "duplicate" });
		expect(github.created).toHaveLength(1);
	});

	test("an already-tracked message links the existing issue instead", async () => {
		const telegram = fakeTelegram({ forward: forwarded("old news") });
		const github = fakeGitHub({ number: 7, url: "https://github.com/x/y/issues/7" });

		const outcome = await handleTicketReaction(deps(config(), telegram, github.port), reaction());

		expect(outcome).toEqual({
			status: "existing",
			issue: 7,
			url: "https://github.com/x/y/issues/7",
		});
		expect(github.created).toEqual([]);
		expect(telegram.sent[0]?.text).toBe("Already tracked as #7");
	});

	test("admins-only rejects a plain member", async () => {
		const telegram = fakeTelegram({ forward: forwarded("nope"), memberStatus: "member" });
		const github = fakeGitHub();
		const cfg = config("    authorize: admins");

		const outcome = await handleTicketReaction(deps(cfg, telegram, github.port), reaction());

		expect(outcome).toEqual({ status: "ignored", reason: "unauthorized" });
		expect(github.created).toEqual([]);
	});

	test("a user_id allowlist admits only listed users", async () => {
		const telegram = fakeTelegram({ forward: forwarded("allowed") });
		const github = fakeGitHub();
		const cfg = config("    authorize: [222]");

		expect((await handleTicketReaction(deps(cfg, telegram, github.port), reaction())).status).toBe(
			"created",
		);

		const other = { ...reaction(), user: { id: 999, is_bot: false, first_name: "Eve" } };
		const outcome = await handleTicketReaction(deps(cfg, telegram, github.port), other);
		expect(outcome).toEqual({ status: "ignored", reason: "unauthorized" });
	});
});

describe("failures", () => {
	test("a forward-restricted group gets a plain-language error, even when silent", async () => {
		const telegram = fakeTelegram({
			forwardError: new Error("Bad Request: CHAT_FORWARDS_RESTRICTED"),
		});
		const github = fakeGitHub();
		const cfg = config("    announce_created: false");

		const outcome = await handleTicketReaction(deps(cfg, telegram, github.port), reaction());

		expect(outcome.status).toBe("failed");
		expect(telegram.sent[0]?.text).toContain("forwarding restricted");
		expect(telegram.sent[0]?.replyTo).toBe(8842);
	});

	test("a failed attempt releases the dedup claim so a retry gets through", async () => {
		const telegram = fakeTelegram({ forwardError: new Error("network") });
		const github = fakeGitHub();
		const shared = deps(config(), telegram, github.port);

		await handleTicketReaction(shared, reaction());
		const second = await handleTicketReaction(shared, reaction());

		// Without the release, the retry would return "duplicate" and never forward again.
		expect(second.status).toBe("failed");
		expect(telegram.forwards).toEqual([8842, 8842]);
	});
});
