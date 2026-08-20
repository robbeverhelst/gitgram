/**
 * Covers the burst case: two people reacting seconds apart, or Telegram
 * redelivering an update after a restart. The durable case is covered by
 * searching GitHub, which is too slow to index for this window.
 */
export class RecentSet {
	readonly #seen = new Map<string, number>();

	constructor(
		private readonly ttlMs = 15 * 60 * 1000,
		private readonly now = () => Date.now(),
	) {}

	/** True if this key was already claimed within the TTL. Claims it otherwise. */
	claim(key: string): boolean {
		this.#sweep();
		if (this.#seen.has(key)) return true;
		this.#seen.set(key, this.now() + this.ttlMs);
		return false;
	}

	release(key: string): void {
		this.#seen.delete(key);
	}

	get size(): number {
		this.#sweep();
		return this.#seen.size;
	}

	#sweep(): void {
		const now = this.now();
		for (const [key, expiry] of this.#seen) if (expiry <= now) this.#seen.delete(key);
	}
}

export const messageKey = (chatId: number, messageId: number) => `${chatId}:${messageId}`;
