/**
 * One-off discovery helper: prints the id of every chat the bot sees.
 *
 *   bun run scripts/chat-ids.ts
 *
 * Send a message in the group, and post something in the archive channel.
 * Ctrl-C when you have both ids. Do not run this while the bot itself is
 * running — Telegram delivers each update to only one getUpdates caller.
 */
import { Bot } from "grammy";

const token = Bun.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

const bot = new Bot(token);
const seen = new Set<number>();

const show = (chat: { id: number; type: string; title?: string }) => {
	if (seen.has(chat.id)) return;
	seen.add(chat.id);
	console.log(`${chat.id}\t${chat.type}\t${chat.title ?? ""}`);
};

bot.on("message", (ctx) => show(ctx.chat));
bot.on("channel_post", (ctx) => show(ctx.chat));
bot.on("my_chat_member", (ctx) => show(ctx.chat));
bot.on("message_reaction", (ctx) => show(ctx.chat));

console.log("chat_id\ttype\ttitle");
console.log("listening — send a message in the group and post in the archive channel");

await bot.start({
	allowed_updates: ["message", "channel_post", "my_chat_member", "message_reaction"],
	drop_pending_updates: false,
});
