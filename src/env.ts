import { z } from "zod";
import { REACTION_EMOJI } from "./reactions";

const Env = z.object({
	TELEGRAM_BOT_TOKEN: z.string().min(1),
	/** Private channel the bot forwards into to read message content. */
	ARCHIVE_CHAT_ID: z.coerce.number().int(),
	GITHUB_APP_ID: z.coerce.number().int(),
	GITHUB_APP_PRIVATE_KEY: z.string().min(1),
	GITHUB_WEBHOOK_SECRET: z.string().min(1),
	CONFIG_PATH: z.string().default("./gitgram.yaml"),
	PORT: z.coerce.number().int().default(3000),
	// Constrained to Telegram's reaction set; see src/reactions.ts.
	TRIGGER_EMOJI: z.enum(REACTION_EMOJI).default("👀"),
	ACK_EMOJI: z.enum(REACTION_EMOJI).default("👌"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = Bun.env): Env {
	const parsed = Env.safeParse(source);
	if (parsed.success) return parsed.data;
	const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
	throw new Error(`invalid environment:\n${problems.join("\n")}`);
}

/** Private keys survive env vars better with escaped newlines; accept both forms. */
export function normalizePrivateKey(key: string): string {
	return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}
