import { normalizeBaseTag } from '../settings';

export interface ResolvedDeck {
	/** Lowercase deck key. '' is the root deck. */
	path: string;
	/** Human-readable path without the base tag, e.g. "japanese/hiragana". */
	label: string;
	/** Normalized tag including '#'. */
	tag: string;
}

function cleanTag(tag: string): string {
	return tag.trim().replace(/^#+/, '').replace(/\/+$/, '');
}

/**
 * Pick the most specific tag below `baseTag`. Ties use the order in `tags`.
 * Matching is case-insensitive; the deck key is lowercased.
 */
export function resolveDeck(tags: readonly string[], baseTag: string): ResolvedDeck | null {
	const base = normalizeBaseTag(baseTag);
	if (!base) return null;

	let best: ResolvedDeck | null = null;
	let bestDepth = -1;

	for (const rawTag of tags) {
		const cleaned = cleanTag(rawTag);
		if (!cleaned) continue;

		const segments = cleaned.split('/').filter(Boolean);
		const first = segments[0];
		if (!first || first.toLowerCase() !== base) continue;

		const depth = segments.length - 1;
		if (depth < bestDepth) continue;
		if (depth === bestDepth && best) continue;

		const label = segments.slice(1).join('/');
		best = {
			path: label.toLowerCase(),
			label: label || base,
			tag: `#${cleaned}`,
		};
		bestDepth = depth;
	}

	return best;
}

export function tagMatchesBase(tag: string, baseTag: string): boolean {
	const base = normalizeBaseTag(baseTag);
	const cleaned = cleanTag(tag).toLowerCase();
	return cleaned === base || cleaned.startsWith(`${base}/`);
}

function stripQuotes(value: string): string {
	return value.trim().replace(/^['"]|['"]$/g, '');
}

function collectFrontmatterTags(lines: readonly string[], end: number): string[] {
	const tags: string[] = [];
	let inTagsList = false;

	for (let index = 1; index < end; index += 1) {
		const line = lines[index] ?? '';
		const listItem = /^\s*-\s+(.+)$/.exec(line);
		if (inTagsList && listItem) {
			const value = stripQuotes(listItem[1] ?? '').replace(/^#/, '');
			if (value) tags.push(`#${value}`);
			continue;
		}

		const match = /^\s*(?:tags|tag)\s*:\s*(.*)$/i.exec(line);
		if (!match) {
			inTagsList = false;
			continue;
		}

		const value = (match[1] ?? '').trim();
		if (!value) {
			inTagsList = true;
			continue;
		}

		const inlineList = /^\[(.*)\]$/.exec(value);
		const values = inlineList
			? (inlineList[1] ?? '').split(',')
			: value.split(/\s+/).filter(Boolean);
		for (const item of values) {
			const cleaned = stripQuotes(item).replace(/^#/, '');
			if (cleaned) tags.push(`#${cleaned}`);
		}
		inTagsList = false;
	}

	return tags;
}

function fenceAt(line: string): string | null {
	const match = /^\s*(`{3,}|~{3,})/.exec(line);
	return match?.[1] ?? null;
}

/**
 * Fallback tag extraction for files whose metadata cache is not ready yet.
 * Handles YAML frontmatter lists and inline tags, skipping fenced code blocks.
 */
export function extractTagsFromContent(content: string): string[] {
	const lines = content.split(/\r?\n/);
	const tags: string[] = [];
	const seen = new Set<string>();

	const add = (tag: string) => {
		const key = tag.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		tags.push(tag);
	};

	const frontmatterEnd = lines[0]?.trim() === '---' ? lines.indexOf('---', 1) : -1;
	if (frontmatterEnd > 1) {
		for (const tag of collectFrontmatterTags(lines, frontmatterEnd)) add(tag);
	}

	let fence: string | null = null;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const marker = fenceAt(line);
		if (fence) {
			if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
			continue;
		}
		if (marker) {
			fence = marker;
			continue;
		}
		if (index > 0 && index < frontmatterEnd) continue;

		const matches = line.matchAll(/(^|[\s(])#([\p{L}\p{N}_\-/]+)/gu);
		for (const match of matches) {
			const value = (match[2] ?? '').replace(/\/+$/, '');
			if (value) add(`#${value}`);
		}
	}

	return tags;
}
