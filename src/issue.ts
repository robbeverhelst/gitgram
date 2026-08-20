import type { Chat, Message, User } from "grammy/types";
import { type Marker, renderMarker } from "./marker";

const TITLE_MAX = 80;

export type IssueInput = {
	/** The forwarded copy, which is where the text and sender come from. */
	forwarded: Message;
	originChat: Chat;
	originMessageId: number;
	threadId?: number;
	reactedBy?: User;
	/** Chat on whose behalf an anonymous admin reacted, when there is no user. */
	reactedByChat?: Chat;
	archiveChatId: number;
	labels: string[];
};

export type RenderedIssue = { title: string; body: string; labels: string[] };

export function displayName(who: User | Chat | undefined): string {
	if (!who) return "someone";
	if ("title" in who && who.title) return who.title;
	const named = who as User;
	const full = [named.first_name, named.last_name].filter(Boolean).join(" ");
	return full || named.username || `id:${who.id}`;
}

function handle(who: User | Chat | undefined): string {
	const name = displayName(who);
	return who && "username" in who && who.username ? `${name} (@${who.username})` : name;
}

export function messageText(message: Message): string | undefined {
	return message.text ?? message.caption ?? undefined;
}

/** Human label for a message that carries no text, e.g. a bare screenshot. */
export function mediaKind(message: Message): string {
	if (message.photo) return "photo";
	if (message.video) return "video";
	if (message.animation) return "animation";
	if (message.document) return "document";
	if (message.voice) return "voice message";
	if (message.audio) return "audio";
	if (message.video_note) return "video note";
	if (message.sticker) return "sticker";
	if (message.poll) return "poll";
	if (message.location) return "location";
	if (message.contact) return "contact";
	return "message";
}

export function deriveTitle(message: Message, authorName = "someone"): string {
	const text = messageText(message)
		?.split("\n")
		.find((line) => line.trim())
		?.trim();
	if (!text) return `${mediaKind(message)} from ${authorName}`;
	if (text.length <= TITLE_MAX) return text;
	return `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * Deep link to the original message. Only supergroups have one; public groups
 * link by username, private ones by the -100-stripped internal id. Members only.
 */
export function messageLink(chat: Chat, messageId: number, threadId?: number): string | null {
	if (chat.type !== "supergroup" && chat.type !== "channel") return null;
	const thread = threadId ? `${threadId}/` : "";
	if ("username" in chat && chat.username)
		return `https://t.me/${chat.username}/${thread}${messageId}`;
	const internal = String(chat.id).replace(/^-100/, "");
	if (internal === String(chat.id)) return null;
	return `https://t.me/c/${internal}/${thread}${messageId}`;
}

/** Link into a private supergroup or channel by its -100-stripped internal id. */
export function privateChatLink(chatId: number, messageId: number): string | null {
	const internal = String(chatId).replace(/^-100/, "");
	if (internal === String(chatId)) return null;
	return `https://t.me/c/${internal}/${messageId}`;
}

/** Original author, recovered from the forward header when the sender allows it. */
export function originalAuthor(forwarded: Message): User | Chat | undefined {
	const origin = forwarded.forward_origin;
	if (!origin) return forwarded.from;
	if (origin.type === "user") return origin.sender_user;
	if (origin.type === "chat") return origin.sender_chat;
	if (origin.type === "channel") return origin.chat;
	return undefined;
}

export function renderIssue(input: IssueInput): RenderedIssue {
	const { forwarded, originChat, originMessageId, threadId, archiveChatId } = input;
	const author = originalAuthor(forwarded);
	const origin = forwarded.forward_origin;
	const sentAt = new Date((origin?.date ?? forwarded.date) * 1000).toISOString();
	const text = messageText(forwarded);

	const quoted = text
		? text
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n")
		: `_(${mediaKind(forwarded)}, no text)_`;

	const link = messageLink(originChat, originMessageId, threadId);
	const archiveLink = privateChatLink(archiveChatId, forwarded.message_id);

	const facts = [
		`**From:** ${handle(author)}${origin?.type === "hidden_user" ? " _(forward-restricted)_" : ""}`,
		`**Where:** ${displayName(originChat)}`,
		`**When:** ${sentAt}`,
		`**Ticketed by:** ${handle(input.reactedBy ?? input.reactedByChat)}`,
		link ? `**Message:** ${link}` : null,
		archiveLink ? `**Archived:** ${archiveLink}` : null,
	].filter(Boolean);

	const marker: Marker = { chatId: originChat.id, messageId: originMessageId };

	return {
		title: deriveTitle(forwarded, displayName(author)),
		body: `${quoted}\n\n---\n\n${facts.join("  \n")}\n\n${renderMarker(marker)}\n`,
		labels: input.labels,
	};
}
