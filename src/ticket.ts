import type {
	Chat,
	ChatMember,
	Message,
	MessageReactionUpdated,
	ReactionType,
	User,
} from "grammy/types";
import type { Config } from "./config";
import { settingsFor } from "./config";
import { messageKey, type RecentSet } from "./dedup";
import type { GitHub } from "./github";
import { parseRepo } from "./github";
import { displayName, renderIssue } from "./issue";
import type { ReactionEmoji } from "./reactions";

/** The slice of grammY's Api this bot uses; `bot.api` satisfies it structurally. */
export type TelegramPort = {
	forwardMessage(chatId: number, fromChatId: number, messageId: number): Promise<Message>;
	sendMessage(
		chatId: number,
		text: string,
		other?: { reply_parameters?: { message_id: number; allow_sending_without_reply?: boolean } },
	): Promise<Message>;
	setMessageReaction(chatId: number, messageId: number, reaction: ReactionType[]): Promise<true>;
	getChatMember(chatId: number, userId: number): Promise<ChatMember>;
};

/** Only the two calls the ticket flow makes, so tests can fake them. */
export type GitHubPort = Pick<GitHub, "findExisting" | "createIssue">;

export type TicketDeps = {
	config: Config;
	github: GitHubPort;
	telegram: TelegramPort;
	recent: RecentSet;
	archiveChatId: number;
	ackEmoji: ReactionEmoji;
	log?: (event: Record<string, unknown>) => void;
};

export type Outcome =
	| { status: "ignored"; reason: "unconfigured" | "unauthorized" | "duplicate" }
	| { status: "created" | "existing"; issue: number; url: string }
	| { status: "failed"; error: string };

const ADMIN_STATUSES = new Set(["administrator", "creator"]);

async function isAuthorized(
	deps: TicketDeps,
	authorize: "anyone" | "admins" | number[],
	chatId: number,
	user: User | undefined,
	actorChat: Chat | undefined,
): Promise<boolean> {
	if (authorize === "anyone") return true;
	// An anonymous reaction can only come from an admin posting as the chat.
	if (!user) return authorize === "admins" && actorChat !== undefined;
	if (Array.isArray(authorize)) return authorize.includes(user.id);
	const member = await deps.telegram.getChatMember(chatId, user.id);
	return ADMIN_STATUSES.has(member.status);
}

async function reply(deps: TicketDeps, chatId: number, messageId: number, text: string) {
	await deps.telegram.sendMessage(chatId, text, {
		reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
	});
}

export async function handleTicketReaction(
	deps: TicketDeps,
	update: MessageReactionUpdated,
): Promise<Outcome> {
	const chatId = update.chat.id;
	const messageId = update.message_id;
	const settings = settingsFor(deps.config, chatId);
	if (!settings) return { status: "ignored", reason: "unconfigured" };

	const allowed = await isAuthorized(
		deps,
		settings.authorize,
		chatId,
		update.user,
		update.actor_chat,
	);
	if (!allowed) {
		if (settings.announce_created) {
			await reply(deps, chatId, messageId, "You're not allowed to file tickets from this chat.");
		}
		return { status: "ignored", reason: "unauthorized" };
	}

	const key = messageKey(chatId, messageId);
	if (deps.recent.claim(key)) return { status: "ignored", reason: "duplicate" };

	try {
		const ref = parseRepo(settings.repo);
		const marker = { chatId, messageId };

		const existing = await deps.github.findExisting(ref, marker);
		if (existing) {
			if (settings.announce_created) {
				await reply(
					deps,
					chatId,
					messageId,
					withLink(`Already tracked as #${existing.number}`, existing.url, settings.include_link),
				);
			}
			return { status: "existing", issue: existing.number, url: existing.url };
		}

		const forwarded = await deps.telegram.forwardMessage(deps.archiveChatId, chatId, messageId);
		const issue = await deps.github.createIssue(
			ref,
			renderIssue({
				forwarded,
				originChat: update.chat,
				originMessageId: messageId,
				reactedBy: update.user,
				reactedByChat: update.actor_chat,
				archiveChatId: deps.archiveChatId,
				labels: settings.labels,
			}),
		);

		if (settings.ack_reaction) {
			// Best-effort: the message may be too old or the chat may block reactions.
			await deps.telegram
				.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: deps.ackEmoji }])
				.catch((error) =>
					deps.log?.({ event: "ack_failed", chatId, messageId, error: String(error) }),
				);
		}
		if (settings.announce_created) {
			const who = displayName(update.user ?? update.actor_chat);
			await reply(
				deps,
				chatId,
				messageId,
				withLink(`Ticket #${issue.number} filed by ${who}`, issue.url, settings.include_link),
			);
		}

		deps.log?.({
			event: "issue_created",
			chatId,
			messageId,
			repo: settings.repo,
			issue: issue.number,
		});
		return { status: "created", issue: issue.number, url: issue.url };
	} catch (error) {
		// Let a retry through; whatever went wrong, the ticket does not exist yet.
		deps.recent.release(key);
		const message = describe(error);
		deps.log?.({ event: "ticket_failed", chatId, messageId, error: message });
		// Failure always speaks, regardless of the announce toggles.
		await reply(deps, chatId, messageId, `Couldn't file a ticket: ${message}`).catch(() => {});
		return { status: "failed", error: message };
	}
}

/** The issue URL names the repo to everyone in the chat, so it is opt-in. */
export function withLink(text: string, url: string, include: boolean): string {
	return include ? `${text}: ${url}` : text;
}

function describe(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	if (/CHAT_FORWARDS_RESTRICTED|can't be forwarded|not enough rights/i.test(raw)) {
		return "this group has content forwarding restricted, so I can't read the message";
	}
	if (/message to forward not found|MESSAGE_ID_INVALID/i.test(raw)) {
		return "that message is no longer available";
	}
	return raw;
}
