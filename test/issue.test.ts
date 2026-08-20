import { describe, expect, test } from "bun:test";
import { deriveTitle, messageLink, renderIssue } from "../src/issue";
import { parseMarker } from "../src/marker";
import { ALICE, ARCHIVE_CHAT_ID, BOB, forwarded, GROUP } from "./fixtures";

const render = (text: string | undefined) =>
	renderIssue({
		forwarded: forwarded(text),
		originChat: GROUP,
		originMessageId: 8842,
		reactedBy: BOB,
		archiveChatId: ARCHIVE_CHAT_ID,
		labels: ["triage"],
	});

describe("title", () => {
	test("uses the first non-empty line", () => {
		expect(deriveTitle(forwarded("\n\nexport button is broken\nmore detail"))).toBe(
			"export button is broken",
		);
	});

	test("truncates long text with an ellipsis", () => {
		const title = deriveTitle(forwarded("x".repeat(200)));
		expect(title).toHaveLength(80);
		expect(title.endsWith("…")).toBe(true);
	});

	test("falls back to the media kind when there is no text", () => {
		const photo = { ...forwarded(undefined), photo: [] } as never;
		expect(deriveTitle(photo, "Alice")).toBe("photo from Alice");
	});
});

describe("message links", () => {
	test("private supergroups link by -100-stripped id", () => {
		expect(messageLink(GROUP, 8842)).toBe("https://t.me/c/1234567890/8842");
	});

	test("public supergroups link by username", () => {
		expect(messageLink({ ...GROUP, username: "team" }, 8842)).toBe("https://t.me/team/8842");
	});

	test("basic groups have no linkable messages", () => {
		expect(messageLink({ id: -42, type: "group", title: "old" }, 1)).toBeNull();
	});
});

describe("issue body", () => {
	test("quotes the message and carries a parseable marker", () => {
		const issue = render("the export button is broken\non mobile");
		expect(issue.body).toContain("> the export button is broken");
		expect(issue.body).toContain("> on mobile");
		expect(parseMarker(issue.body)).toEqual({ chatId: GROUP.id, messageId: 8842 });
	});

	test("attributes the original author and the reactor separately", () => {
		const issue = render("something broke");
		expect(issue.body).toContain(`**From:** ${ALICE.first_name} (@${ALICE.username})`);
		expect(issue.body).toContain(`**Ticketed by:** ${BOB.first_name} (@${BOB.username})`);
	});

	test("links both the original message and the archived copy", () => {
		const issue = render("something broke");
		expect(issue.body).toContain("https://t.me/c/1234567890/8842");
		expect(issue.body).toContain("https://t.me/c/9999999999/501");
	});

	test("passes labels through", () => {
		expect(render("x").labels).toEqual(["triage"]);
	});
});
