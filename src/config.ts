import { z } from "zod";

const Authorize = z.union([
	z.literal("anyone"),
	z.literal("admins"),
	z.array(z.number().int()).min(1),
]);

// Declared without defaults so a topic override carries only the keys actually
// written; defaults are applied once, in DEFAULTS below.
const settingsShape = {
	repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo"),
	authorize: Authorize,
	announce_created: z.boolean(),
	announce_closed: z.boolean(),
	ack_reaction: z.boolean(),
	include_link: z.boolean(),
	title_mode: z.enum(["mechanical", "llm"]),
	labels: z.array(z.string()),
};

const SettingsOverride = z.object(settingsShape).partial();

const ChatConfig = SettingsOverride.extend({ repo: settingsShape.repo });

const Config = z.object({
	chats: z.record(z.coerce.number().int(), ChatConfig),
});

export type Config = z.infer<typeof Config>;

const DEFAULTS = {
	authorize: "anyone",
	announce_created: true,
	announce_closed: true,
	ack_reaction: true,
	// Off by default: the issue URL names the repo to everyone in the chat.
	include_link: false,
	title_mode: "mechanical",
	labels: [],
} satisfies Omit<Required<z.infer<typeof SettingsOverride>>, "repo">;

export function parseConfig(source: string): Config {
	return Config.parse(Bun.YAML.parse(source));
}

export async function loadConfig(path = Bun.env.CONFIG_PATH ?? "./gitgram.yaml"): Promise<Config> {
	const file = Bun.file(path);
	if (!(await file.exists())) throw new Error(`config not found at ${path}`);
	return parseConfig(await file.text());
}

/**
 * Settings for a chat, or null if it is unconfigured.
 *
 * Not per-topic: MessageReactionUpdated carries no message_thread_id, so the
 * forum topic of the reacted-to message is unknowable at reaction time.
 */
export function settingsFor(config: Config, chatId: number) {
	const chat = config.chats[chatId];
	if (!chat) return null;
	return { ...DEFAULTS, ...chat };
}

export type ResolvedSettings = NonNullable<ReturnType<typeof settingsFor>>;

export function isKnownChat(config: Config, chatId: number): boolean {
	return chatId in config.chats;
}
