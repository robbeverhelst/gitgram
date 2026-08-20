import type { ChatMember, Message, ReactionType } from "grammy/types";
import type { TelegramPort } from "../src/ticket";

export type Sent = { chatId: number; text: string; replyTo?: number };
export type Reacted = { chatId: number; messageId: number; reaction: ReactionType[] };

export function fakeTelegram(options: {
	forward?: Message;
	forwardError?: Error;
	memberStatus?: ChatMember["status"];
	sendFails?: boolean;
}) {
	const sent: Sent[] = [];
	const reacted: Reacted[] = [];
	const forwards: number[] = [];

	const port: TelegramPort = {
		async forwardMessage(_to, _from, messageId) {
			forwards.push(messageId);
			if (options.forwardError) throw options.forwardError;
			if (!options.forward) throw new Error("no forward configured");
			return options.forward;
		},
		async sendMessage(chatId, text, other) {
			if (options.sendFails) throw new Error("Forbidden: bot was blocked");
			sent.push({ chatId, text, replyTo: other?.reply_parameters?.message_id });
			return { message_id: 1 } as Message;
		},
		async setMessageReaction(chatId, messageId, reaction) {
			reacted.push({ chatId, messageId, reaction });
			return true;
		},
		async getChatMember() {
			return { status: options.memberStatus ?? "member" } as ChatMember;
		},
	};

	return { port, sent, reacted, forwards };
}
