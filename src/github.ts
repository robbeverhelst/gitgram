import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { normalizePrivateKey } from "./env";
import { type Marker, markerSearchPhrase, parseMarker } from "./marker";

export type RepoRef = { owner: string; repo: string };

export function parseRepo(slug: string): RepoRef {
	const [owner, repo] = slug.split("/");
	if (!owner || !repo) throw new Error(`bad repo slug: ${slug}`);
	return { owner, repo };
}

export type CreatedIssue = { number: number; url: string; existing: boolean };

export class GitHub {
	readonly #auth: { appId: number; privateKey: string };
	readonly #appClient: Octokit;
	readonly #clients = new Map<string, Promise<Octokit>>();

	constructor(appId: number, privateKey: string) {
		this.#auth = { appId, privateKey: normalizePrivateKey(privateKey) };
		this.#appClient = new Octokit({ authStrategy: createAppAuth, auth: this.#auth });
	}

	/** Installation-scoped client for a repo. Cached; the token itself auto-rotates. */
	async #for({ owner, repo }: RepoRef): Promise<Octokit> {
		const key = `${owner}/${repo}`;
		let pending = this.#clients.get(key);
		if (!pending) {
			pending = this.#appClient.rest.apps.getRepoInstallation({ owner, repo }).then(
				({ data }) =>
					new Octokit({
						authStrategy: createAppAuth,
						auth: { ...this.#auth, installationId: data.id },
					}),
			);
			this.#clients.set(key, pending);
			pending.catch(() => this.#clients.delete(key));
		}
		return pending;
	}

	/**
	 * Durable half of dedup. Best-effort: GitHub's search index lags by seconds
	 * to minutes, which is why RecentSet covers the burst window.
	 */
	async findExisting(ref: RepoRef, marker: Marker): Promise<CreatedIssue | null> {
		const octokit = await this.#for(ref);
		const q = `repo:${ref.owner}/${ref.repo} in:body ${markerSearchPhrase(marker)}`;
		const { data } = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 10 });
		const hit = data.items.find((item) => {
			const found = parseMarker(item.body);
			return found?.chatId === marker.chatId && found?.messageId === marker.messageId;
		});
		return hit ? { number: hit.number, url: hit.html_url, existing: true } : null;
	}

	async createIssue(
		ref: RepoRef,
		issue: { title: string; body: string; labels: string[] },
	): Promise<CreatedIssue> {
		const octokit = await this.#for(ref);
		const { data } = await octokit.rest.issues.create({
			...ref,
			title: issue.title,
			body: issue.body,
			labels: issue.labels.length ? issue.labels : undefined,
		});
		return { number: data.number, url: data.html_url, existing: false };
	}
}
