/**
 * Creates the GitHub App via the manifest flow and writes its credentials to
 * .env, so none of the form has to be filled in by hand.
 *
 *   bun run scripts/create-app.ts <public-webhook-base-url>
 *
 * Opens a local page that hands GitHub a pre-filled manifest; GitHub redirects
 * back with a code, which is exchanged for the app id, private key and webhook
 * secret. The App still has to be installed on a repo afterwards.
 */
const base = Bun.argv[2];
if (!base) throw new Error("usage: bun run scripts/create-app.ts https://<host>");

const PORT = 4000;
const redirect = `http://localhost:${PORT}/callback`;
const manifest = {
	name: `gitgram-${Bun.env.USER ?? "bot"}`,
	url: "https://github.com/robbeverhelst/gitgram",
	hook_attributes: { url: `${base.replace(/\/$/, "")}/gh/webhook`, active: true },
	redirect_url: redirect,
	public: false,
	default_permissions: { issues: "write", metadata: "read" },
	default_events: ["issues"],
};

const page = `<!doctype html><body style="font-family:system-ui;padding:3rem">
<p>Handing GitHub the manifest…</p>
<form id="f" action="https://github.com/settings/apps/new" method="post">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&apos;")}'>
</form><script>document.getElementById("f").submit()</script></body>`;

async function upsertEnv(values: Record<string, string>) {
	const file = Bun.file(".env");
	const lines = ((await file.exists()) ? await file.text() : "").split("\n");
	for (const [key, value] of Object.entries(values)) {
		const at = lines.findIndex((l) => l.startsWith(`${key}=`));
		const line = `${key}=${value}`;
		if (at >= 0) lines[at] = line;
		else lines.push(line);
	}
	await Bun.write(".env", lines.join("\n"));
}

const server = Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname !== "/callback")
			return new Response(page, { headers: { "content-type": "text/html" } });

		const code = url.searchParams.get("code");
		if (!code) return new Response("no code in redirect", { status: 400 });

		const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
			method: "POST",
			headers: { accept: "application/vnd.github+json", "user-agent": "gitgram-setup" },
		});
		if (!res.ok)
			return new Response(`conversion failed: ${res.status} ${await res.text()}`, { status: 500 });

		const app = (await res.json()) as {
			id: number;
			slug: string;
			pem: string;
			webhook_secret: string;
			html_url: string;
		};
		await upsertEnv({
			GITHUB_APP_ID: String(app.id),
			GITHUB_APP_PRIVATE_KEY: app.pem.replace(/\n/g, "\\n"),
			GITHUB_WEBHOOK_SECRET: app.webhook_secret,
		});

		const install = `https://github.com/apps/${app.slug}/installations/new`;
		console.log(
			`\ncreated: ${app.html_url}\ncredentials written to .env\ninstall it: ${install}\n`,
		);
		queueMicrotask(() => server.stop());
		return new Response(
			`<!doctype html><body style="font-family:system-ui;padding:3rem">
<h2>App created</h2><p>Credentials written to <code>.env</code>.</p>
<p><a href="${install}">Install it on robbeverhelst/gitgram →</a></p></body>`,
			{ headers: { "content-type": "text/html" } },
		);
	},
});

console.log(`open http://localhost:${PORT} to create the app`);
