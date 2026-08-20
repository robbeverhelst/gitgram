import type { Chat, Message, MessageReactionUpdated, User } from "grammy/types";

export const ALICE: User = { id: 111, is_bot: false, first_name: "Alice", username: "alice" };
export const BOB: User = { id: 222, is_bot: false, first_name: "Bob", username: "bob" };

export const GROUP: Chat.SupergroupChat = {
	id: -1001234567890,
	type: "supergroup",
	title: "Team",
};

export const ARCHIVE_CHAT_ID = -1009999999999;

/** What forwardMessage returns: a copy in the archive channel with a forward header. */
export function forwarded(
	text: string | undefined,
	from: User = ALICE,
	at = 1_700_000_000,
): Message {
	return {
		message_id: 501,
		date: at + 60,
		chat: { id: ARCHIVE_CHAT_ID, type: "channel", title: "gitgram archive" },
		forward_origin: { type: "user", date: at, sender_user: from },
		...(text === undefined ? {} : { text }),
	} as Message;
}

export function reaction(messageId = 8842, user: User | undefined = BOB): MessageReactionUpdated {
	return {
		chat: GROUP,
		message_id: messageId,
		date: 1_700_000_100,
		old_reaction: [],
		new_reaction: [{ type: "emoji", emoji: "👀" }],
		...(user ? { user } : {}),
	} as MessageReactionUpdated;
}
