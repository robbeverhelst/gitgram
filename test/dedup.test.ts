import { describe, expect, test } from "bun:test";
import { messageKey, RecentSet } from "../src/dedup";

describe("RecentSet", () => {
	test("claims a key once", () => {
		const set = new RecentSet();
		expect(set.claim("a")).toBe(false);
		expect(set.claim("a")).toBe(true);
	});

	test("expires claims after the TTL", () => {
		let now = 0;
		const set = new RecentSet(1000, () => now);
		expect(set.claim("a")).toBe(false);
		now = 999;
		expect(set.claim("a")).toBe(true);
		now = 1001;
		expect(set.claim("a")).toBe(false);
	});

	test("release lets a failed attempt retry immediately", () => {
		const set = new RecentSet();
		set.claim("a");
		set.release("a");
		expect(set.claim("a")).toBe(false);
	});

	test("keys are scoped per chat", () => {
		expect(messageKey(-100, 5)).not.toBe(messageKey(-101, 5));
	});
});
