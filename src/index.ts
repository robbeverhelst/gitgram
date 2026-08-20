import { Bot } from "grammy";
import type { ReactionTypeEmoji } from "grammy/types";
import { loadConfig, settingsFor } from "./config";
import { RecentSet } from "./dedup";
import { loadEnv } from "./env";
import { GitHub } from "./github";
import { handleTicketReaction } from "./ticket";
import { createWebhookApp } from "./webhook";

const log = (event: Record<string, unknown>) =>
	console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

const env = loadEnv();
const config = await loadConfig(env.CONFIG_PATH);
log({ event: "config_loaded", chats: Object.keys(config.chats).length });

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
const github = new GitHub(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
const recent = new RecentSet();

const deps = {
	config,
	github,
	telegram: bot.api,
	recent,
	archiveChatId: env.ARCHIVE_CHAT_ID,
	ackEmoji: env.ACK_EMOJI,
	log,
};

bot.reaction(env.TRIGGER_EMOJI as ReactionTypeEmoji["emoji"], async (ctx) => {
	const outcome = await handleTicketReaction(deps, ctx.messageReaction);
	log({
		event: "reaction",
		chat: ctx.chat.id,
		message: ctx.messageReaction.message_id,
		...outcome,
	});
});

// Bootstrapping aid: chat ids are not discoverable any other way.
bot.command("gitgram", async (ctx) => {
	const settings = ctx.chat && settingsFor(config, ctx.chat.id);
	const lines = [`chat_id: ${ctx.chat?.id}`, `type: ${ctx.chat?.type}`];
	lines.push(
		settings
			? `repo: ${settings.repo}\nauthorize: ${JSON.stringify(settings.authorize)}\nannounce_created: ${settings.announce_created}\nannounce_closed: ${settings.announce_closed}\nack_reaction: ${settings.ack_reaction}`
			: "not configured — add this chat_id to gitgram.yaml",
	);
	await ctx.reply(lines.join("\n"));
});

bot.on("my_chat_member", (ctx) => {
	log({
		event: "membership",
		chat: ctx.chat.id,
		title: "title" in ctx.chat ? ctx.chat.title : undefined,
		status: ctx.myChatMember.new_chat_member.status,
		configured: settingsFor(config, ctx.chat.id) !== null,
	});
});

bot.catch((error) => log({ event: "bot_error", error: String(error.error) }));

const server = Bun.serve({
	port: env.PORT,
	fetch: createWebhookApp({ config, telegram: bot.api, secret: env.GITHUB_WEBHOOK_SECRET, log })
		.fetch,
});
log({ event: "listening", port: server.port });

const stop = async () => {
	await bot.stop();
	await server.stop();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await bot.start({
	allowed_updates: ["message_reaction", "message", "my_chat_member"],
	onStart: (me) => log({ event: "polling", bot: me.username }),
});
