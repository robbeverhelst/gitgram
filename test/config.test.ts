import { describe, expect, test } from "bun:test";
import { isKnownChat, parseConfig, settingsFor } from "../src/config";

const yaml = `
chats:
  -1001234567890:
    repo: robbeverhelst/gitgram
  -1009876543210:
    repo: robbeverhelst/other
    announce_created: false
    announce_closed: false
    authorize: admins
    labels: [triage, from-telegram]
`;

describe("config", () => {
	test("applies defaults", () => {
		const settings = settingsFor(parseConfig(yaml), -1001234567890);
		expect(settings).toEqual({
			repo: "robbeverhelst/gitgram",
			authorize: "anyone",
			announce_created: true,
			announce_closed: true,
			ack_reaction: true,
			title_mode: "mechanical",
			labels: [],
		});
	});

	test("keeps explicit values", () => {
		const settings = settingsFor(parseConfig(yaml), -1009876543210);
		expect(settings?.announce_created).toBe(false);
		expect(settings?.authorize).toBe("admins");
		expect(settings?.labels).toEqual(["triage", "from-telegram"]);
	});

	test("unconfigured chats resolve to null", () => {
		const config = parseConfig(yaml);
		expect(settingsFor(config, -1)).toBeNull();
		expect(isKnownChat(config, -1)).toBe(false);
		expect(isKnownChat(config, -1001234567890)).toBe(true);
	});

	test("rejects a malformed repo slug at parse time", () => {
		expect(() => parseConfig("chats:\n  -100:\n    repo: notaslug\n")).toThrow();
	});

	test("rejects an unknown title_mode", () => {
		expect(() => parseConfig("chats:\n  -100:\n    repo: a/b\n    title_mode: vibes\n")).toThrow();
	});
});
