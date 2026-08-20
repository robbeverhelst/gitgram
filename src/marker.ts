/**
 * The issue↔message link, embedded in the issue body. GitHub is the only
 * durable store in this system; see docs/DESIGN.md.
 */

export type Marker = { chatId: number; messageId: number };

const PATTERN = /<!--\s*gitgram:\s*chat=(-?\d+);\s*msg=(\d+)\s*-->/g;

export function renderMarker({ chatId, messageId }: Marker): string {
	return `<!-- gitgram: chat=${chatId}; msg=${messageId} -->`;
}

/**
 * Reads the *last* marker. The quoted message sits above ours in the body, so
 * a marker typed into a Telegram message would otherwise win.
 */
export function parseMarker(body: string | null | undefined): Marker | null {
	if (!body) return null;
	const matches = [...body.matchAll(PATTERN)];
	const last = matches.at(-1);
	if (!last) return null;
	return { chatId: Number(last[1]), messageId: Number(last[2]) };
}

/** Defuses marker-shaped text so quoted content cannot forge one. */
export function stripMarkers(text: string): string {
	return text.replace(PATTERN, "<!-- gitgram: redacted -->");
}

/**
 * Phrase for GitHub issue search. The `<!--` delimiters are dropped because
 * GitHub's tokenizer handles them poorly; the inner text is distinctive enough.
 */
export function markerSearchPhrase({ chatId, messageId }: Marker): string {
	return `"gitgram: chat=${chatId}; msg=${messageId}"`;
}
