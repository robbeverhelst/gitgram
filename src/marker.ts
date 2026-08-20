/**
 * The issue↔message link, embedded in the issue body. GitHub is the only
 * durable store in this system; see docs/DESIGN.md.
 */

export type Marker = { chatId: number; messageId: number };

const PATTERN = /<!--\s*gitgram:\s*chat=(-?\d+);\s*msg=(\d+)\s*-->/;

export function renderMarker({ chatId, messageId }: Marker): string {
	return `<!-- gitgram: chat=${chatId}; msg=${messageId} -->`;
}

export function parseMarker(body: string | null | undefined): Marker | null {
	const match = body?.match(PATTERN);
	if (!match) return null;
	return { chatId: Number(match[1]), messageId: Number(match[2]) };
}

/**
 * Phrase for GitHub issue search. The `<!--` delimiters are dropped because
 * GitHub's tokenizer handles them poorly; the inner text is distinctive enough.
 */
export function markerSearchPhrase({ chatId, messageId }: Marker): string {
	return `"gitgram: chat=${chatId}; msg=${messageId}"`;
}
