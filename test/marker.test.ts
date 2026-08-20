import { describe, expect, test } from "bun:test";
import { markerSearchPhrase, parseMarker, renderMarker } from "../src/marker";

describe("marker", () => {
	test("round-trips through a rendered issue body", () => {
		const marker = { chatId: -1001234567890, messageId: 8842 };
		const body = `some issue text\n\n${renderMarker(marker)}\n`;
		expect(parseMarker(body)).toEqual(marker);
	});

	test("handles positive chat ids", () => {
		expect(parseMarker(renderMarker({ chatId: 42, messageId: 1 }))).toEqual({
			chatId: 42,
			messageId: 1,
		});
	});

	test("returns null for bodies without a marker", () => {
		expect(parseMarker("just a normal issue")).toBeNull();
		expect(parseMarker(null)).toBeNull();
		expect(parseMarker(undefined)).toBeNull();
	});

	test("ignores a malformed marker rather than half-parsing it", () => {
		expect(parseMarker("<!-- gitgram: chat=abc; msg=1 -->")).toBeNull();
		expect(parseMarker("<!-- gitgram: chat=-100; -->")).toBeNull();
	});

	test("search phrase drops the comment delimiters", () => {
		const phrase = markerSearchPhrase({ chatId: -100123, messageId: 7 });
		expect(phrase).toBe('"gitgram: chat=-100123; msg=7"');
		expect(phrase).not.toContain("<!--");
	});
});
